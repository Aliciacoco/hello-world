const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const webpush = require('web-push')

function localClock(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  }
}

function pointsSummary(points, now = new Date(), timeZone = 'Asia/Shanghai') {
  const today = localClock(now, timeZone).date
  let earnedToday = 0
  let spentToday = 0
  for (const entry of points.history || []) {
    const date = new Date(entry.date)
    if (!Number.isFinite(date.getTime()) || localClock(date, timeZone).date !== today) continue
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount)) continue
    if (entry.type === 'earn') earnedToday += amount
    if (entry.type === 'redeem') spentToday += amount
  }
  const round = n => Math.round(n * 100) / 100
  const balance = Number(points.balance) || 0
  return {
    balance: round(balance), availableYuan: round(balance),
    earnedToday: round(earnedToday), spentToday: round(spentToday),
    date: today, timeZone, updatedAt: now.toISOString(),
  }
}

function validateSchedule(time, timeZone) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('请选择有效的提醒时间')
  }
  if (typeof timeZone !== 'string' || timeZone.length > 80) throw new Error('时区无效')
  try { localClock(new Date(), timeZone) } catch { throw new Error('时区无效') }
}

function validateOrigin(value, allowLocal = false) {
  const url = new URL(value)
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((!local && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('请使用网站的 HTTPS 地址')
  }
  return url.origin
}

function validateSubscription(subscription) {
  if (!subscription || typeof subscription.endpoint !== 'string') throw new Error('推送订阅无效')
  const url = new URL(subscription.endpoint)
  // Only contact browser push services, never arbitrary URLs supplied by a client.
  const allowed = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com']
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname) || url.port || url.username || url.password) {
    throw new Error('不支持的推送服务')
  }
  const keys = subscription.keys || {}
  if (!/^[\w-]{87}$/.test(keys.p256dh) || !/^[\w-]{22}$/.test(keys.auth)) {
    throw new Error('推送密钥无效')
  }
  return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

function isDue(device, now) {
  const clock = localClock(now, device.timeZone)
  const [hours, minutes] = device.time.split(':').map(Number)
  const elapsed = clock.minute - (hours * 60 + minutes)
  return device.lastSentDate !== clock.date && elapsed >= 0 && elapsed < 30
    && (!device.retryAfter || now.getTime() >= device.retryAfter)
}

function attachMobileReminders(app, { dataDir, readPoints, sendNotification = webpush.sendNotification }) {
  const file = path.join(dataDir, 'mobile_reminders.json')
  let state
  if (fs.existsSync(file)) {
    // Do not silently replace damaged keys: existing phones would lose their subscription.
    state = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!state.vapid?.publicKey || !state.vapid?.privateKey || !state.widgetToken || !Array.isArray(state.devices)) {
      throw new Error('mobile_reminders.json 数据损坏，请从备份恢复')
    }
  } else {
    state = { vapid: webpush.generateVAPIDKeys(), widgetToken: crypto.randomBytes(32).toString('hex'), devices: [] }
    save()
  }

  function save() {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 })
    fs.renameSync(`${file}.tmp`, file)
  }

  function deviceView(device) {
    return device ? {
      subscribed: true, time: device.time, timeZone: device.timeZone,
      lastSentAt: device.lastSentAt || null, lastError: device.lastError || null,
    } : { subscribed: false, time: '20:00', timeZone: 'Asia/Shanghai', lastSentAt: null, lastError: null }
  }

  function endpointDevice(req, res) {
    const device = state.devices.find(d => d.subscription.endpoint === req.body?.endpoint)
    if (!device) res.status(404).json({ error: '本设备尚未开启提醒，请重新开启' })
    return device
  }

  const route = handler => async (req, res) => {
    try { await handler(req, res) } catch (error) {
      res.status(400).json({ error: error.message || '操作失败，请重试' })
    }
  }

  app.use('/api/mobile', (req, res, next) => {
    const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)
      && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      && !req.get('X-Forwarded-Proto')
    if (req.path === '/config' || req.secure || localPreview) return next()
    res.status(426).json({ error: '手机积分功能需要 HTTPS，请先配置网站证书' })
  })

  app.get('/api/mobile/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ publicKey: state.vapid.publicKey })
  })

  app.get('/api/mobile/summary', (req, res) => {
    const provided = req.get('Authorization')?.replace(/^Bearer /, '') || ''
    const expected = Buffer.from(state.widgetToken)
    const actual = Buffer.from(provided)
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: '组件凭证失效，请重新下载组件' })
    }
    res.set('Cache-Control', 'no-store').json(pointsSummary(readPoints()))
  })

  app.get('/api/mobile/widget-script', route((req, res) => {
    const origin = validateOrigin(req.query.origin, true)
    const template = fs.readFileSync(path.join(__dirname, 'points-widget.js'), 'utf8')
    const script = template.replace('__POINTS_WIDGET_CONFIG__', JSON.stringify({ origin, token: state.widgetToken }))
    res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="StudyPoints.js"' }).send(script)
  }))

  app.post('/api/mobile/widget-reset', (req, res) => {
    state.widgetToken = crypto.randomBytes(32).toString('hex')
    save()
    res.json({ ok: true })
  })

  app.post('/api/mobile/device', (req, res) => {
    const device = state.devices.find(d => d.subscription.endpoint === req.body?.endpoint)
    res.set('Cache-Control', 'no-store').json(deviceView(device))
  })

  app.post('/api/mobile/subscribe', route((req, res) => {
    const { time = '20:00', timeZone = 'Asia/Shanghai', origin } = req.body
    validateSchedule(time, timeZone)
    const subscription = validateSubscription(req.body.subscription)
    const subject = validateOrigin(origin, true)
    let device = state.devices.find(d => d.subscription.endpoint === subscription.endpoint)
    if (!device) {
      if (state.devices.length >= 20) throw new Error('订阅设备过多，请先关闭旧设备提醒')
      device = { subscription }
      state.devices.push(device)
    }
    Object.assign(device, { subscription, time, timeZone, origin: subject, lastError: null, retryAfter: 0 })
    save()
    res.json(deviceView(device))
  }))

  app.post('/api/mobile/settings', route((req, res) => {
    const device = endpointDevice(req, res)
    if (!device) return
    validateSchedule(req.body.time, req.body.timeZone)
    Object.assign(device, { time: req.body.time, timeZone: req.body.timeZone })
    save()
    res.json(deviceView(device))
  }))

  app.post('/api/mobile/unsubscribe', (req, res) => {
    state.devices = state.devices.filter(d => d.subscription.endpoint !== req.body?.endpoint)
    save()
    res.json({ ok: true })
  })

  async function send(device, test, now = new Date()) {
    const summary = pointsSummary(readPoints(), now, device.timeZone)
    const body = `当前 ${summary.balance.toFixed(1)} 分，可消费 ¥${summary.availableYuan.toFixed(1)}。`
      + `今日获得 ${summary.earnedToday.toFixed(1)} 分，消费 ${summary.spentToday.toFixed(1)} 分。买之前看一眼，花完记一笔。`
    try {
      await sendNotification(device.subscription, JSON.stringify({
        title: test ? '积分提醒 · 测试' : '今晚的消费积分', body,
        url: `${device.origin}/points?redeem=1`, tag: test ? 'points-test' : `points-${summary.date}`,
      }), { TTL: 1800, timeout: 10000, urgency: 'normal', vapidDetails: {
        subject: process.env.VAPID_SUBJECT || device.origin,
        publicKey: state.vapid.publicKey, privateKey: state.vapid.privateKey,
      } })
      device.lastError = null
      device.retryAfter = 0
      if (!test) {
        device.lastSentDate = summary.date
        device.lastSentAt = now.toISOString()
      }
      save()
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        state.devices = state.devices.filter(d => d !== device)
      } else {
        device.lastError = '通知发送失败，请稍后测试或重新开启提醒'
        device.retryAfter = now.getTime() + 15 * 60 * 1000
      }
      save()
      throw new Error([404, 410].includes(error.statusCode) ? '订阅已过期，请重新开启提醒' : '通知发送失败，请稍后重试')
    }
  }

  const sending = new Set()
  app.post('/api/mobile/test', route(async (req, res) => {
    const device = endpointDevice(req, res)
    if (!device) return
    if (Date.now() - (device.lastTestAt || 0) < 60000 || sending.has(device)) {
      return res.status(429).json({ error: '请等一分钟再发送测试通知' })
    }
    device.lastTestAt = Date.now()
    save()
    sending.add(device)
    try {
      await send(device, true)
      res.json({ ok: true })
    } finally { sending.delete(device) }
  }))

  async function tick(now = new Date()) {
    for (const device of [...state.devices]) {
      if (!isDue(device, now) || sending.has(device)) continue
      sending.add(device)
      try { await send(device, false, now) } catch {
        console.warn('[mobile-reminders] Daily notification failed; will retry later')
      } finally { sending.delete(device) }
    }
  }
  const timer = setInterval(() => { void tick() }, 30000)
  timer.unref()
  return { tick, stop: () => clearInterval(timer) }
}

module.exports = { attachMobileReminders, pointsSummary, localClock, validateSchedule, validateSubscription, isDue }
