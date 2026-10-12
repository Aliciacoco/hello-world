// Downloaded for Scriptable on iPhone. The token only reads the widget summary.
const settings = __POINTS_WIDGET_CONFIG__
const cacheKey = 'study-points-' + settings.origin + '-' + settings.token.slice(0, 8)
let summary = null
let offline = false
let invalidToken = false
try {
  const request = new Request(settings.origin + '/api/mobile/summary')
  request.headers = { Authorization: 'Bearer ' + settings.token }
  request.timeoutInterval = 12
  const result = await request.loadJSON()
  if (request.response.statusCode === 401) {
    invalidToken = true
    if (Keychain.contains(cacheKey)) Keychain.remove(cacheKey)
    throw new Error('Token expired')
  }
  if (request.response.statusCode !== 200 || typeof result.balance !== 'number') throw new Error('Unavailable')
  summary = result
  Keychain.set(cacheKey, JSON.stringify(summary))
} catch {
  offline = true
  if (!invalidToken && Keychain.contains(cacheKey)) {
    try { summary = JSON.parse(Keychain.get(cacheKey)) } catch {}
  }
}

const widget = new ListWidget()
widget.backgroundColor = Color.dynamic(new Color('#F7FAF9'), new Color('#171B19'))
widget.setPadding(14, 14, 14, 14)
widget.url = settings.origin + '/points?redeem=1'
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
const textColor = Color.dynamic(new Color('#24352C'), new Color('#E8F1EC'))
const mutedColor = Color.dynamic(new Color('#68776E'), new Color('#A4B0A8'))

function text(value, size, color = textColor, bold = false) {
  const line = widget.addText(value)
  line.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size)
  line.textColor = color
  line.lineLimit = 1
  line.minimumScaleFactor = 0.5
  return line
}

const lockScreen = ['accessoryInline', 'accessoryCircular', 'accessoryRectangular'].includes(config.widgetFamily)
if (lockScreen) {
  text(summary ? '积分 ' + summary.balance.toFixed(1) : '积分未同步', 16, textColor, true)
  if (config.widgetFamily === 'accessoryRectangular') {
    text(summary ? '可消费 ¥' + summary.availableYuan.toFixed(1) : '点按打开练习本', 13)
    if (offline) text('离线缓存', 11, mutedColor)
  }
} else {
  text('我的消费积分', 13, mutedColor, true)
  widget.addSpacer(8)
  text(summary ? summary.balance.toFixed(1) : '--', config.widgetFamily === 'small' ? 32 : 40,
    Color.dynamic(new Color('#237352'), new Color('#88D6AD')), true)
  text(summary ? '可消费 ¥' + summary.availableYuan.toFixed(1) : '暂时无法同步', 14)
  widget.addSpacer()
  if (summary && config.widgetFamily !== 'small') {
    text('今日获得 +' + summary.earnedToday.toFixed(1) + '    今日消费 -' + summary.spentToday.toFixed(1), 13, mutedColor)
    widget.addSpacer(5)
  }
  const updated = summary ? new Date(summary.updatedAt).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : ''
  text(invalidToken ? '凭证失效，请重新下载' : offline ? '离线 · ' + (updated || '点按重试') : updated + ' · 点按记消费', 10, mutedColor)
}
Script.setWidget(widget)
if (config.runsInApp) await widget.presentMedium()
Script.complete()
