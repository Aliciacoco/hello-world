import { useEffect, useState } from 'react'
import { Bell, BellOff, Download, RefreshCw, Send, Smartphone } from 'lucide-react'
import styles from './MobilePoints.module.css'

interface DeviceSettings {
  subscribed: boolean
  time: string
  timeZone: string
  lastSentAt: string | null
  lastError: string | null
}

const defaultSettings: DeviceSettings = {
  subscribed: false, time: '20:00', timeZone: 'Asia/Shanghai', lastSentAt: null, lastError: null,
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/mobile/${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '操作失败，请重试')
  return data
}

function serverKey(key: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length))
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  return bytes
}

async function registration() {
  const result = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  if (result.active) return result
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('通知服务未就绪，请刷新后重试')), 15000)),
  ])
}

export default function MobilePoints() {
  const [settings, setSettings] = useState(defaultSettings)
  const [time, setTime] = useState('20:00')
  const [timeZone, setTimeZone] = useState('Asia/Shanghai')
  const [endpoint, setEndpoint] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const isIPhone = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const pushSupported = window.isSecureContext && 'serviceWorker' in navigator
    && 'PushManager' in window && typeof Notification !== 'undefined'
  const needsInstall = isIPhone && !standalone
  const localOnly = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  const needsHttps = window.location.protocol !== 'https:' && !localOnly

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const config = await api<{ publicKey: string }>('config')
      setPublicKey(config.publicKey)
      if (pushSupported && !needsInstall) {
        const reg = await registration()
        const subscription = await reg.pushManager.getSubscription()
        setEndpoint(subscription?.endpoint || '')
        if (subscription) {
          const device = await api<DeviceSettings>('device', { endpoint: subscription.endpoint })
          setSettings(device)
          setTime(device.time)
          setTimeZone(device.timeZone)
        } else setSettings(defaultSettings)
      }
      setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const run = async (action: string, work: () => Promise<void>) => {
    setBusy(action)
    setMessage('')
    setError('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setBusy('') }
  }

  const enable = () => run('enable', async () => {
    // Request permission directly inside the tap handler on iOS.
    const granted = await Notification.requestPermission()
    setPermission(granted)
    if (granted !== 'granted') throw new Error('通知未获允许，请在 iPhone 设置中允许练习本发送通知')
    const reg = await registration()
    let subscription = await reg.pushManager.getSubscription()
    if (subscription) {
      const currentKey = subscription.options.applicationServerKey
      if (!currentKey || Array.from(new Uint8Array(currentKey)).join(',') !== Array.from(serverKey(publicKey)).join(',')) {
        await subscription.unsubscribe()
        subscription = null
      }
    }
    subscription ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey(publicKey) })
    setEndpoint(subscription.endpoint)
    const device = await api<DeviceSettings>('subscribe', {
      subscription: subscription.toJSON(), time, timeZone, origin: window.location.origin,
    })
    setSettings(device)
    setMessage(`每日提醒已开启：${time}（${timeZone}）`)
  })

  const disable = () => run('disable', async () => {
    await api('unsubscribe', { endpoint })
    setSettings(defaultSettings)
    const reg = await registration()
    const subscription = await reg.pushManager.getSubscription()
    if (subscription) await subscription.unsubscribe()
    setEndpoint('')
    setMessage('本设备的每日提醒已关闭')
  })

  const saveTime = () => run('save', async () => {
    const device = await api<DeviceSettings>('settings', { endpoint, time, timeZone })
    setSettings(device)
    setMessage('提醒时间已保存')
  })

  const test = () => run('test', async () => {
    await api('test', { endpoint })
    setMessage('测试通知已发送，请查看通知中心')
  })

  const download = () => run('download', async () => {
    const response = await fetch(`/api/mobile/widget-script?origin=${encodeURIComponent(window.location.origin)}`)
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || '下载失败')
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = 'StudyPoints.js'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    setMessage('组件文件已下载')
  })

  const resetWidget = () => {
    if (!confirm('重置后，所有旧的桌面组件都会停止同步，需要重新下载组件。继续吗？')) return
    void run('reset', async () => {
      await api('widget-reset', {})
      setMessage('旧组件凭证已失效，请重新下载组件')
    })
  }

  return <section className={styles.section} aria-labelledby="mobile-points-title">
    <h2 id="mobile-points-title" className={styles.heading}><Smartphone size={18} aria-hidden="true" />手机积分提醒</h2>
    <div className={styles.block}>
      <h3>桌面与锁屏组件</h3>
      <div className={styles.actions}>
        <button type="button" onClick={download} disabled={Boolean(busy) || loading || needsHttps}>
          <Download size={16} aria-hidden="true" />{busy === 'download' ? '下载中...' : '下载 iPhone 组件'}
        </button>
        <button type="button" className={styles.iconButton} onClick={resetWidget} disabled={Boolean(busy) || loading || needsHttps}
          title="重置组件凭证" aria-label="重置组件凭证"><RefreshCw size={16} /></button>
      </div>
      <details className={styles.setup}>
        <summary>iPhone 安装步骤</summary>
        <ol>
          <li>安装 <a href="https://scriptable.app/" target="_blank" rel="noreferrer">Scriptable</a>。</li>
          <li>在 iPhone 上打开本站，下载组件；在“文件”中长按 StudyPoints.js，分享给 Scriptable。若没有导入选项，可用文本方式打开文件，复制内容到 Scriptable 新建脚本中。</li>
          <li>在 Scriptable 中运行脚本，确认积分已显示。</li>
          <li>长按手机桌面，添加 Scriptable 小组件，再长按组件编辑，选择 StudyPoints 脚本。推荐中号组件；锁屏可添加矩形组件。</li>
        </ol>
        <p>组件凭证仅能读取积分摘要，请保留给自己使用。组件由 iOS 定期刷新，离线时显示上次同步时间。</p>
      </details>
      {localOnly && <p className={styles.note}>当前是电脑本地地址。手机组件请从正式网站下载，手机无法连接电脑的 localhost。</p>}
      {needsHttps && <p className={styles.note}>当前网站使用 HTTP。请先配置 HTTPS，再下载手机组件和开启每日通知。</p>}
    </div>
    <div className={styles.block}>
      <div className={styles.statusRow}><h3>每日通知</h3><span>{loading ? '读取中' : settings.subscribed ? '已开启' : '未开启'}</span></div>
      {needsInstall && <p className={styles.note}>在 Safari 中点“分享 → 添加到主屏幕”，再从桌面打开练习本，开启通知。</p>}
      {!needsInstall && !pushSupported && <p className={styles.note}>当前浏览器无法开启推送。iPhone 请使用 iOS 16.4 以上，并从主屏幕打开 HTTPS 网站。</p>}
      {permission === 'denied' && <p className={styles.note}>通知权限已关闭，请到 iPhone 设置中允许练习本发送通知。</p>}
      <div className={styles.fields}>
        <label>提醒时间<input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={Boolean(busy)} /></label>
        <label>时区<select value={timeZone} onChange={e => setTimeZone(e.target.value)} disabled={Boolean(busy)}>
          {[...new Set(['Asia/Shanghai', Intl.DateTimeFormat().resolvedOptions().timeZone, timeZone])].map(zone =>
            <option key={zone} value={zone}>{zone === 'Asia/Shanghai' ? '北京时间' : zone}</option>)}
        </select></label>
      </div>
      <div className={styles.actions}>
        {settings.subscribed ? <>
          <button type="button" onClick={saveTime} disabled={Boolean(busy) || loading}>{busy === 'save' ? '保存中...' : '保存时间'}</button>
          <button type="button" onClick={test} disabled={Boolean(busy) || loading}><Send size={16} />{busy === 'test' ? '发送中...' : '测试通知'}</button>
          <button type="button" onClick={disable} disabled={Boolean(busy) || loading}><BellOff size={16} />关闭提醒</button>
        </> : <button type="button" onClick={enable}
          disabled={Boolean(busy) || loading || !publicKey || !pushSupported || needsInstall || permission === 'denied'}>
          <Bell size={16} />{busy === 'enable' ? '开启中...' : '开启每日提醒'}
        </button>}
      </div>
      <p className={styles.note}>通知会显示当前积分、可消费金额和今日收支，点按直接记录消费。1 积分 = 1 元。</p>
      {settings.lastSentAt && <p className={styles.note}>上次提醒：{new Date(settings.lastSentAt).toLocaleString('zh-CN')}</p>}
      {settings.lastError && <p className={styles.error}>{settings.lastError}</p>}
    </div>
    {error && <div role="alert" className={styles.error}>{error} <button type="button" onClick={load} disabled={Boolean(busy) || loading}>重新读取</button></div>}
    {message && <p role="status" className={styles.success}>{message}</p>}
  </section>
}
