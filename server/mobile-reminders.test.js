const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const express = require('express')
const { attachMobileReminders, pointsSummary, isDue, validateSubscription } = require('./mobile-reminders')

const subscription = {
  endpoint: 'https://web.push.apple.com/test-subscription',
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
}

async function fixture(t, sendNotification = async () => {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'points-mobile-test-'))
  const points = { balance: 120.4, history: [] }
  const app = express()
  app.use(express.json())
  const reminders = attachMobileReminders(app, { dataDir, readPoints: () => points, sendNotification })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    reminders.stop()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(dataDir, { recursive: true, force: true })
  })
  const post = async (route, body) => {
    const response = await fetch(`${origin}/api/mobile/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, data: await response.json() }
  }
  return { reminders, dataDir, origin, post, points }
}

test('summary uses Beijing calendar date across UTC midnight and omits transaction details', () => {
  const summary = pointsSummary({ balance: 9.3, history: [
    { type: 'earn', amount: 0.1, date: Date.parse('2026-10-11T16:01:00Z'), image: 'private' },
    { type: 'earn', amount: 0.2, date: Date.parse('2026-10-12T02:00:00Z') },
    { type: 'redeem', amount: 5, date: Date.parse('2026-10-12T03:00:00Z') },
    { type: 'earn', amount: 100, date: Date.parse('2026-10-11T15:59:00Z') },
  ] }, new Date('2026-10-12T12:00:00Z'))
  assert.equal(summary.date, '2026-10-12')
  assert.equal(summary.earnedToday, 0.3)
  assert.equal(summary.spentToday, 5)
  assert.equal(summary.availableYuan, 9.3)
  assert.equal(summary.history, undefined)
})

test('daily schedule catches up within 30 minutes and never repeats a successful day', () => {
  const device = { time: '20:00', timeZone: 'Asia/Shanghai' }
  assert.equal(isDue(device, new Date('2026-10-12T11:59:00Z')), false)
  assert.equal(isDue(device, new Date('2026-10-12T12:00:00Z')), true)
  assert.equal(isDue(device, new Date('2026-10-12T12:29:00Z')), true)
  assert.equal(isDue(device, new Date('2026-10-12T12:30:00Z')), false)
  assert.equal(isDue({ ...device, lastSentDate: '2026-10-12' }, new Date('2026-10-12T12:00:00Z')), false)
})

test('subscription validation blocks arbitrary network destinations', () => {
  assert.throws(() => validateSubscription({ ...subscription, endpoint: 'https://127.0.0.1/private' }))
  assert.throws(() => validateSubscription({ ...subscription, endpoint: 'https://web.push.apple.com.attacker.example/x' }))
  assert.throws(() => validateSubscription({ ...subscription, keys: { auth: 'bad', p256dh: 'bad' } }))
  assert.deepEqual(validateSubscription(subscription), subscription)
})

test('widget requires a HTTPS origin and credential; rotation revokes old scripts', async t => {
  const f = await fixture(t)
  assert.equal((await fetch(`${f.origin}/api/mobile/widget-script?origin=${encodeURIComponent('http://coco-os.cn')}`)).status, 400)
  const response = await fetch(`${f.origin}/api/mobile/widget-script?origin=${encodeURIComponent('https://coco-os.cn')}`)
  assert.equal(response.status, 200)
  const script = await response.text()
  assert.ok(script.includes('https://coco-os.cn'))
  assert.ok(!script.includes('__POINTS_WIDGET_CONFIG__'))
  const config = JSON.parse(script.match(/const settings = (.*)/)[1])
  const summaryUrl = `${f.origin}/api/mobile/summary`
  assert.equal((await fetch(summaryUrl)).status, 401)
  assert.equal((await fetch(`${summaryUrl}?token=${config.token}`)).status, 401)
  const get = () => fetch(summaryUrl, { headers: { Authorization: `Bearer ${config.token}` } })
  assert.equal((await get()).status, 200)
  await f.post('widget-reset', {})
  assert.equal((await get()).status, 401)
})

test('HTTP requests through a public host or a reverse proxy cannot obtain widget credentials', async t => {
  const f = await fixture(t)
  const url = `${f.origin}/api/mobile/widget-script?origin=${encodeURIComponent('https://coco-os.cn')}`
  const status = (target, headers) => new Promise((resolve, reject) => {
    http.get(target, { headers }, response => {
      response.resume()
      response.on('end', () => resolve(response.statusCode))
    }).on('error', reject)
  })
  assert.equal(await status(url, { Host: 'coco-os.cn' }), 426)
  assert.equal(await status(url, { 'X-Forwarded-Proto': 'http' }), 426)
  assert.equal(await status(`${f.origin}/api/mobile/config`, { Host: 'coco-os.cn' }), 200)
})

test('successful reminders persist across restart; test does not consume daily reminder', async t => {
  const sent = []
  const f = await fixture(t, async (sub, payload) => sent.push(JSON.parse(payload)))
  const enabled = await f.post('subscribe', { subscription, origin: 'https://coco-os.cn', time: '20:00', timeZone: 'Asia/Shanghai' })
  assert.equal(enabled.status, 200)
  assert.equal((await f.post('test', { endpoint: subscription.endpoint })).status, 200)
  assert.equal((await f.post('test', { endpoint: subscription.endpoint })).status, 429)
  await f.reminders.tick(new Date('2026-10-12T12:00:00Z'))
  await f.reminders.tick(new Date('2026-10-12T12:01:00Z'))
  assert.equal(sent.length, 2)
  assert.equal(sent[1].url, 'https://coco-os.cn/points?redeem=1')
  assert.match(sent[1].body, /120.4/)
  f.reminders.stop()
  const restarted = attachMobileReminders(express(), {
    dataDir: f.dataDir, readPoints: () => f.points, sendNotification: async () => sent.push('duplicate'),
  })
  t.after(() => restarted.stop())
  await restarted.tick(new Date('2026-10-12T12:02:00Z'))
  assert.equal(sent.length, 2)
  assert.equal((await f.post('settings', { endpoint: subscription.endpoint, time: '25:00', timeZone: 'Asia/Shanghai' })).status, 400)
  assert.equal((await f.post('settings', { endpoint: subscription.endpoint, time: '20:00', timeZone: 'Invalid/Zone' })).status, 400)
})

test('temporary failures back off and expired subscriptions are removed', async t => {
  let calls = 0
  const f = await fixture(t, async () => {
    calls++
    throw Object.assign(new Error('unavailable'), { statusCode: calls === 1 ? 503 : 410 })
  })
  await f.post('subscribe', { subscription, origin: 'https://coco-os.cn', time: '20:00', timeZone: 'Asia/Shanghai' })
  await f.reminders.tick(new Date('2026-10-12T12:00:00Z'))
  await f.reminders.tick(new Date('2026-10-12T12:01:00Z'))
  assert.equal(calls, 1)
  await f.reminders.tick(new Date('2026-10-12T12:15:00Z'))
  assert.equal(calls, 2)
  assert.equal((await f.post('device', { endpoint: subscription.endpoint })).data.subscribed, false)
})

test('Scriptable renders fresh data, marks offline cache and clears it on token revocation', async t => {
  const f = await fixture(t)
  const script = await (await fetch(`${f.origin}/api/mobile/widget-script?origin=${encodeURIComponent('https://coco-os.cn')}`)).text()
  const cache = new Map()
  let mode = 'online'
  let lines = []
  const widget = { setPadding() {}, addSpacer() {}, addText(value) { lines.push(value); return {} } }
  const context = {
    Request: class {
      async loadJSON() {
        this.response = { statusCode: mode === 'revoked' ? 401 : 200 }
        if (mode === 'offline') throw new Error('Offline')
        return mode === 'revoked' ? { error: 'Expired' } : pointsSummary(f.points)
      }
    },
    Keychain: { contains: k => cache.has(k), get: k => cache.get(k), set: (k, v) => cache.set(k, v), remove: k => cache.delete(k) },
    ListWidget: class { constructor() { return widget } },
    Color: class { static dynamic(a) { return a } },
    Font: { boldSystemFont() {}, systemFont() {} },
    config: { widgetFamily: 'medium', runsInApp: false },
    Script: { setWidget() {}, complete() {} },
  }
  const execute = () => vm.runInNewContext(`(async () => { ${script}\n })()`, context)
  await execute()
  assert.ok(lines.includes('120.4'))
  assert.equal(cache.size, 1)
  mode = 'offline'
  lines = []
  await execute()
  assert.ok(lines.some(l => l.startsWith('离线')))
  mode = 'revoked'
  lines = []
  await execute()
  assert.equal(cache.size, 0)
  assert.ok(lines.includes('凭证失效，请重新下载'))
})

test('habit reminders send on weekday mornings and every evening, persist deduplication, and coexist with points', async t => {
  const sent = []
  const f = await fixture(t, async (sub, payload) => sent.push(JSON.parse(payload)))
  const base = { subscription, origin: 'https://coco-os.cn', time: '20:00', timeZone: 'Asia/Shanghai' }
  assert.equal((await f.post('subscribe', base)).status, 200)
  assert.equal((await f.post('subscribe', { ...base, kind: 'habits' })).status, 200)
  await f.reminders.tick(new Date('2026-10-15T21:54:00Z')) // Friday 05:54 Beijing
  assert.equal(sent.length, 0)
  await f.reminders.tick(new Date('2026-10-15T21:55:00Z'))
  await f.reminders.tick(new Date('2026-10-15T21:56:00Z'))
  assert.equal(sent.length, 1)
  assert.match(sent[0].title, /晨学/)
  assert.equal(sent[0].url, 'https://coco-os.cn/checkin')
  await f.reminders.tick(new Date('2026-10-16T13:30:00Z'))
  assert.equal(sent.length, 2)
  assert.match(sent[1].body, /洗漱/)
  f.reminders.stop()
  const restarted = attachMobileReminders(express(), {
    dataDir: f.dataDir, readPoints: () => f.points, sendNotification: async (sub, payload) => sent.push(JSON.parse(payload)),
  })
  t.after(() => restarted.stop())
  await restarted.tick(new Date('2026-10-16T13:31:00Z'))
  await restarted.tick(new Date('2026-10-16T21:55:00Z')) // Saturday morning: no study reminder
  assert.equal(sent.length, 2)
  await restarted.tick(new Date('2026-10-17T13:30:00Z')) // Saturday evening
  assert.equal(sent.length, 3)
  assert.equal((await f.post('unsubscribe', { endpoint: subscription.endpoint, kind: 'habits' })).status, 200)
  assert.equal((await f.post('device', { endpoint: subscription.endpoint })).data.subscribed, true)
  assert.equal((await f.post('device', { endpoint: subscription.endpoint, kind: 'habits' })).data.subscribed, false)
})

test('habit delivery retries a failed slot without duplicating success or cancelling other reminder types', async t => {
  let calls = 0
  const f = await fixture(t, async () => {
    calls++
    if (calls === 1) throw Object.assign(new Error('temporary'), { statusCode: 503 })
  })
  await f.post('subscribe', { subscription, origin: 'https://coco-os.cn', kind: 'habits' })
  await f.reminders.tick(new Date('2026-10-15T21:55:00Z'))
  await f.reminders.tick(new Date('2026-10-15T21:56:00Z'))
  assert.equal(calls, 1)
  await f.reminders.tick(new Date('2026-10-15T22:10:00Z'))
  await f.reminders.tick(new Date('2026-10-15T22:11:00Z'))
  assert.equal(calls, 2)
  await f.reminders.tick(new Date('2026-10-16T13:30:00Z'))
  assert.equal(calls, 3)
})
