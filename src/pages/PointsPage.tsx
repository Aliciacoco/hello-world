import { useState, useEffect } from 'react'
import styles from './PointsPage.module.css'

interface HistoryEntry {
  id: string
  type: 'earn' | 'redeem'
  amount: number
  reason: string
  date: number
  image?: string
  link?: string
}

interface PointsData {
  balance: number
  history: HistoryEntry[]
}

export default function PointsPage() {
  const [data, setData] = useState<PointsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRedeem, setShowRedeem] = useState(false)
  const [form, setForm] = useState({ reason: '', amount: '', image: '', link: '' })
  const [imagePreview, setImagePreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redeemError, setRedeemError] = useState('')

  const fetchPoints = () => {
    fetch('/api/points')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchPoints() }, [])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImagePreview(result)
      setForm(f => ({ ...f, image: result.split(',')[1] }))
    }
    reader.readAsDataURL(file)
  }

  const handleRedeem = async () => {
    const amount = parseFloat(form.amount)
    if (!form.reason.trim()) { setRedeemError('请填写物品名称'); return }
    if (isNaN(amount) || amount <= 0) { setRedeemError('请填写有效金额'); return }
    if (data && amount > data.balance) { setRedeemError('余额不足'); return }
    setRedeemError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/points/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason: form.reason.trim(), image: form.image || undefined, link: form.link.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json()
        setRedeemError(err.error || '兑换失败')
        return
      }
      const updated = await res.json()
      setData(updated)
      setShowRedeem(false)
      setForm({ reason: '', amount: '', image: '', link: '' })
      setImagePreview('')
    } catch {
      setRedeemError('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('确定删除这条记录？')) return
    const res = await fetch(`/api/points/history/${id}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = await res.json()
      setData(updated)
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.empty}>加载中...</p></div>
  if (!data) return <div className={styles.page}><p className={styles.empty}>加载失败</p></div>

  return (
    <div className={styles.page}>
      {/* 余额卡片 */}
      <div className={styles.balanceCard}>
        <p className={styles.balanceLabel}>当前积分</p>
        <p className={styles.balanceNum}>{data.balance.toFixed(1)}</p>
        <p className={styles.balanceHint}>≈ ¥{data.balance.toFixed(1)} 可用于购物</p>
        <button className={styles.redeemBtn} onClick={() => setShowRedeem(true)}>去兑换</button>
      </div>

      {/* 兑换弹窗 */}
      {showRedeem && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowRedeem(false) }}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>兑换积分</h2>
            <label className={styles.label}>物品名称</label>
            <input className={styles.input} placeholder="比如：优衣库T恤" value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            <label className={styles.label}>消耗积分（余额 {data.balance.toFixed(1)} 分）</label>
            <input className={styles.input} type="number" placeholder="输入积分数" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            <label className={styles.label}>物品图片（可选）</label>
            <input type="file" accept="image/*" onChange={handleImageChange} className={styles.fileInput} />
            {imagePreview && <img src={imagePreview} className={styles.imgPreview} alt="预览" />}
            <label className={styles.label}>商品链接（可选）</label>
            <input className={styles.input} placeholder="粘贴链接..." value={form.link}
              onChange={e => setForm(f => ({ ...f, link: e.target.value }))} />
            {redeemError && <p className={styles.error}>{redeemError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.confirmBtn} onClick={handleRedeem} disabled={submitting}>
                {submitting ? '提交中...' : '确认兑换'}
              </button>
              <button className={styles.cancelBtn} onClick={() => { setShowRedeem(false); setRedeemError('') }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录 */}
      <div className={styles.historySection}>
        <h2 className={styles.historyTitle}>积分记录</h2>
        {data.history.length === 0
          ? <p className={styles.empty}>还没有记录，快去练题吧！</p>
          : (
            <div className={styles.timeline}>
              {data.history.map(entry => (
                <div key={entry.id} className={`${styles.entry} ${entry.type === 'earn' ? styles.earn : styles.redeem}`}>
                  <div className={styles.entryDot} />
                  <div className={styles.entryBody}>
                    <div className={styles.entryHeader}>
                      <span className={styles.entryReason}>{entry.reason}</span>
                      <span className={styles.entryAmount}>
                        {entry.type === 'earn' ? '+' : '-'}{entry.amount.toFixed(1)} 分
                      </span>
                    </div>
                    <p className={styles.entryDate}>{new Date(entry.date).toLocaleString('zh-CN')}</p>
                    {entry.link && (
                      <a href={entry.link} target="_blank" rel="noreferrer" className={styles.entryLink}>查看商品 →</a>
                    )}
                    {entry.image && (
                      <img src={`data:image/jpeg;base64,${entry.image}`} className={styles.entryImg} alt="商品图片" />
                    )}
                    <button className={styles.deleteEntryBtn} onClick={() => handleDeleteHistory(entry.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
