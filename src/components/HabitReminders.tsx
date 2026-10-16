import { useEffect, useState } from 'react'
import { api, registration, serverKey } from './MobilePoints'
import styles from './StudyHabits.module.css'

export default function HabitReminders() {
  const [enabled, setEnabled] = useState(false)
  const [key, setKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
  const needsInstall = /iPhone|iPad|iPod/.test(navigator.userAgent)
    && !window.matchMedia('(display-mode: standalone)').matches
    && !(navigator as Navigator & { standalone?: boolean }).standalone

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const config = await api<{ publicKey: string }>('config')
        if (!alive) return
        setKey(config.publicKey)
        if (supported && !needsInstall) {
          const reg = await registration()
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            const settings = await api<{ subscribed: boolean }>('device', { endpoint: sub.endpoint, kind: 'habits' })
            if (alive) { setEndpoint(sub.endpoint); setEnabled(settings.subscribed) }
          }
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : '提醒设置读取失败') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [supported, needsInstall])

  async function run(action: 'enable' | 'disable' | 'test') {
    setBusy(true); setMessage(''); setError('')
    try {
      if (action === 'enable') {
        if (await Notification.requestPermission() !== 'granted') throw new Error('请在浏览器或手机设置中允许本站发送通知')
        const reg = await registration()
        let sub = await reg.pushManager.getSubscription()
        if (sub) {
          const current = sub.options.applicationServerKey
          if (!current || Array.from(new Uint8Array(current)).join(',') !== Array.from(serverKey(key)).join(',')) {
            await sub.unsubscribe(); sub = null
          }
        }
        sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey(key) })
        await api('subscribe', { subscription: sub.toJSON(), origin: window.location.origin, kind: 'habits', time: '05:55', timeZone: 'Asia/Shanghai' })
        setEndpoint(sub.endpoint); setEnabled(true); setMessage('本设备已开启晨学与洗漱提醒')
      } else {
        await api(action === 'disable' ? 'unsubscribe' : 'test', { endpoint, kind: 'habits' })
        if (action === 'disable') { setEnabled(false); setMessage('本设备的学习与早睡提醒已关闭') }
        else setMessage('测试通知已发送，请查看通知中心')
      }
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试') }
    finally { setBusy(false) }
  }

  return <div className={styles.reminders}>
    <h3>让提醒帮你开始</h3>
    <p>北京时间 · 周一至周五 05:55 提醒晨学，每天 21:30 提醒洗漱，22:00 前上床。</p>
    {needsInstall && <p>iPhone：Safari 分享 → 添加到主屏幕，再从桌面打开本站开启通知。</p>}
    {!supported && !needsInstall && <p>请用支持网页推送的浏览器，通过 HTTPS 打开网站后开启通知。</p>}
    <div className={styles.actions}>
      <button disabled={busy || loading || !key || !supported || needsInstall} onClick={() => void run(enabled ? 'disable' : 'enable')}>
        {loading ? '读取设置中…' : busy ? '处理中…' : enabled ? '关闭学习与早睡提醒' : '开启学习与早睡提醒'}
      </button>
      {enabled && <button disabled={busy} onClick={() => void run('test')}>测试通知</button>}
    </div>
    <p className={styles.hint}>开启后无需保持网页打开。通知展示可能受手机专注模式和系统设置影响。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>
}
