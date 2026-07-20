import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
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

const CN = {
  currentPoints: '\u5f53\u524d\u79ef\u5206',
  balanceHintPrefix: '\u7ea6 \u00a5',
  balanceHintSuffix: ' \u53ef\u7528\u4e8e\u8d2d\u7269',
  redeem: '\u53bb\u5151\u6362',
  wishTitle: '\u6211\u7684\u5fc3\u613f\u76ee\u6807',
  wishDefault: '\u4e0b\u4e00\u4ef6\u60f3\u4e70\u7684\u4e1c\u897f',
  target: '\u76ee\u6807',
  saved: '\u5df2\u5b58',
  remaining: '\u8fd8\u5dee',
  progress: '\u8fdb\u5ea6',
  weekEarned: '\u672c\u5468\u5df2\u8d5a',
  nextSmallGoal: '\u4e0b\u4e00\u5c0f\u76ee\u6807',
  wishName: '\u5fc3\u613f\u540d\u79f0',
  wishAmount: '\u76ee\u6807\u91d1\u989d',
  milestoneTitle: '\u77ed\u671f\u5956\u52b1\u9636\u68af',
  milestoneSub: '\u628a\u5927\u76ee\u6807\u62c6\u6210\u5c0f\u53f0\u9636\uff0c\u6bcf\u8fbe\u6210\u4e00\u6b21\u90fd\u6709\u660e\u786e\u53cd\u9988',
  achieved: '\u5df2\u8fbe\u6210',
  nextUp: '\u4e0b\u4e00\u7ad9',
  locked: '\u5f85\u89e3\u9501',
  weeklyTitle: '\u672c\u5468\u6218\u62a5',
  earnCount: '\u83b7\u5206\u6b21\u6570',
  avgDaily: '\u65e5\u5747\u79ef\u5206',
  redeemTitle: '\u5151\u6362\u79ef\u5206',
  itemName: '\u7269\u54c1\u540d\u79f0',
  itemPlaceholder: '\u6bd4\u5982\uff1a\u8033\u673a\u3001\u4e66\u3001\u8863\u670d',
  costLabel: '\u6d88\u8017\u79ef\u5206',
  balance: '\u4f59\u989d',
  pointsUnit: '\u5206',
  amountPlaceholder: '\u8f93\u5165\u79ef\u5206\u6570',
  imageOptional: '\u7269\u54c1\u56fe\u7247\uff08\u53ef\u9009\uff09',
  preview: '\u9884\u89c8',
  linkOptional: '\u5546\u54c1\u94fe\u63a5\uff08\u53ef\u9009\uff09',
  linkPlaceholder: '\u7c98\u8d34\u94fe\u63a5...',
  submitting: '\u63d0\u4ea4\u4e2d...',
  confirmRedeem: '\u786e\u8ba4\u5151\u6362',
  cancel: '\u53d6\u6d88',
  historyTitle: '\u79ef\u5206\u8bb0\u5f55',
  emptyHistory: '\u8fd8\u6ca1\u6709\u8bb0\u5f55\uff0c\u5feb\u53bb\u7ec3\u9898\u5427\uff01',
  loading: '\u52a0\u8f7d\u4e2d...',
  loadFailed: '\u52a0\u8f7d\u5931\u8d25',
  productImage: '\u5546\u54c1\u56fe\u7247',
  viewProduct: '\u67e5\u770b\u5546\u54c1',
  delete: '\u5220\u9664',
  deleteConfirm: '\u786e\u5b9a\u5220\u9664\u8fd9\u6761\u8bb0\u5f55\uff1f',
  needName: '\u8bf7\u586b\u5199\u7269\u54c1\u540d\u79f0',
  needAmount: '\u8bf7\u586b\u5199\u6709\u6548\u91d1\u989d',
  notEnough: '\u4f59\u989d\u4e0d\u8db3',
  redeemFailed: '\u5151\u6362\u5931\u8d25',
  networkError: '\u7f51\u7edc\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5',
}

const milestones = [50, 100, 200, 500, 1000]

function getWeekStart(now: Date) {
  const start = new Date(now)
  const day = start.getDay() || 7
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - day + 1)
  return start.getTime()
}

function getDaysPassedInWeek(now: Date) {
  return Math.max(1, now.getDay() || 7)
}

export default function PointsPage() {
  const [data, setData] = useState<PointsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRedeem, setShowRedeem] = useState(false)
  const [form, setForm] = useState({ reason: '', amount: '', image: '', link: '' })
  const [imagePreview, setImagePreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redeemError, setRedeemError] = useState('')
  const [wishName, setWishName] = useState(() => localStorage.getItem('wishName') || CN.wishDefault)
  const [wishTarget, setWishTarget] = useState(() => localStorage.getItem('wishTarget') || '1000')

  const fetchPoints = () => {
    fetch('/api/points')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchPoints() }, [])

  useEffect(() => { localStorage.setItem('wishName', wishName) }, [wishName])
  useEffect(() => { localStorage.setItem('wishTarget', wishTarget) }, [wishTarget])

  const stats = useMemo(() => {
    const balance = data?.balance ?? 0
    const target = Math.max(1, parseFloat(wishTarget) || 1000)
    const weekStart = getWeekStart(new Date())
    const earns = data?.history.filter(entry => entry.type === 'earn' && entry.date >= weekStart) ?? []
    const weekEarned = earns.reduce((sum, entry) => sum + entry.amount, 0)
    const daysPassed = getDaysPassedInWeek(new Date())
    const remaining = Math.max(0, target - balance)
    const progress = Math.min(100, (balance / target) * 100)
    const nextMilestone = milestones.find(value => value > balance)
    return {
      balance,
      target,
      remaining,
      progress,
      weekEarned,
      earnCount: earns.length,
      avgDaily: weekEarned / daysPassed,
      nextMilestone,
    }
  }, [data, wishTarget])

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
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
    if (!form.reason.trim()) { setRedeemError(CN.needName); return }
    if (isNaN(amount) || amount <= 0) { setRedeemError(CN.needAmount); return }
    if (data && amount > data.balance) { setRedeemError(CN.notEnough); return }
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
        setRedeemError(err.error || CN.redeemFailed)
        return
      }
      const updated = await res.json()
      setData(updated)
      setShowRedeem(false)
      setForm({ reason: '', amount: '', image: '', link: '' })
      setImagePreview('')
    } catch {
      setRedeemError(CN.networkError)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteHistory = async (id: string) => {
    if (!confirm(CN.deleteConfirm)) return
    const res = await fetch('/api/points/history/' + id, { method: 'DELETE' })
    if (res.ok) {
      const updated = await res.json()
      setData(updated)
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.empty}>{CN.loading}</p></div>
  if (!data) return <div className={styles.page}><p className={styles.empty}>{CN.loadFailed}</p></div>

  return (
    <div className={styles.page}>
      <div className={styles.balanceCard}>
        <p className={styles.balanceLabel}>{CN.currentPoints}</p>
        <p className={styles.balanceNum}>{data.balance.toFixed(1)}</p>
        <p className={styles.balanceHint}>{CN.balanceHintPrefix}{data.balance.toFixed(1)}{CN.balanceHintSuffix}</p>
        <button className={styles.redeemBtn} onClick={() => setShowRedeem(true)}>{CN.redeem}</button>
      </div>

      <section className={styles.wishCard}>
        <div className={styles.wishHeader}>
          <div>
            <p className={styles.sectionKicker}>{CN.wishTitle}</p>
            <h2 className={styles.wishTitle}>{wishName || CN.wishDefault}</h2>
          </div>
          <div className={styles.wishMeta}>{CN.progress} {stats.progress.toFixed(0)}%</div>
        </div>
        <div className={styles.progressTrack} aria-label={CN.progress}>
          <div className={styles.progressFill} style={{ width: stats.progress + '%' }} />
        </div>
        <div className={styles.wishGrid}>
          <div className={styles.miniMetric}><span>{CN.target}</span><strong>{stats.target.toFixed(0)}</strong></div>
          <div className={styles.miniMetric}><span>{CN.saved}</span><strong>{stats.balance.toFixed(1)}</strong></div>
          <div className={styles.miniMetric}><span>{CN.remaining}</span><strong>{stats.remaining.toFixed(1)}</strong></div>
          <div className={styles.miniMetric}><span>{CN.nextSmallGoal}</span><strong>{stats.nextMilestone ? stats.nextMilestone : CN.achieved}</strong></div>
        </div>
        <div className={styles.wishEditor}>
          <label>
            <span>{CN.wishName}</span>
            <input className={styles.compactInput} value={wishName} onChange={e => setWishName(e.target.value)} />
          </label>
          <label>
            <span>{CN.wishAmount}</span>
            <input className={styles.compactInput} type="number" min="1" value={wishTarget} onChange={e => setWishTarget(e.target.value)} />
          </label>
        </div>
      </section>

      <section className={styles.milestoneSection}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionKicker}>{CN.milestoneTitle}</p>
          <p className={styles.sectionSub}>{CN.milestoneSub}</p>
        </div>
        <div className={styles.milestoneGrid}>
          {milestones.map(value => {
            const done = data.balance >= value
            const next = stats.nextMilestone === value
            return (
              <div key={value} className={done ? styles.milestoneDone : next ? styles.milestoneNext : styles.milestone}>
                <strong>{value}</strong>
                <span>{done ? CN.achieved : next ? CN.nextUp : CN.locked}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.weeklyPanel}>
        <p className={styles.sectionKicker}>{CN.weeklyTitle}</p>
        <div className={styles.wishGrid}>
          <div className={styles.miniMetric}><span>{CN.weekEarned}</span><strong>+{stats.weekEarned.toFixed(1)}</strong></div>
          <div className={styles.miniMetric}><span>{CN.earnCount}</span><strong>{stats.earnCount}</strong></div>
          <div className={styles.miniMetric}><span>{CN.avgDaily}</span><strong>{stats.avgDaily.toFixed(1)}</strong></div>
        </div>
      </section>

      {showRedeem && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowRedeem(false) }}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{CN.redeemTitle}</h2>
            <label className={styles.label}>{CN.itemName}</label>
            <input className={styles.input} placeholder={CN.itemPlaceholder} value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            <label className={styles.label}>{CN.costLabel} ({CN.balance} {data.balance.toFixed(1)} {CN.pointsUnit})</label>
            <input className={styles.input} type="number" placeholder={CN.amountPlaceholder} value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            <label className={styles.label}>{CN.imageOptional}</label>
            <input type="file" accept="image/*" onChange={handleImageChange} className={styles.fileInput} />
            {imagePreview && <img src={imagePreview} className={styles.imgPreview} alt={CN.preview} />}
            <label className={styles.label}>{CN.linkOptional}</label>
            <input className={styles.input} placeholder={CN.linkPlaceholder} value={form.link}
              onChange={e => setForm(f => ({ ...f, link: e.target.value }))} />
            {redeemError && <p className={styles.error}>{redeemError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.confirmBtn} onClick={handleRedeem} disabled={submitting}>
                {submitting ? CN.submitting : CN.confirmRedeem}
              </button>
              <button className={styles.cancelBtn} onClick={() => { setShowRedeem(false); setRedeemError('') }}>{CN.cancel}</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.historySection}>
        <h2 className={styles.historyTitle}>{CN.historyTitle}</h2>
        {data.history.length === 0
          ? <p className={styles.empty}>{CN.emptyHistory}</p>
          : (
            <div className={styles.timeline}>
              {data.history.map(entry => (
                <div key={entry.id} className={entry.type === 'earn' ? styles.entry + ' ' + styles.earn : styles.entry + ' ' + styles.redeem}>
                  <div className={styles.entryDot} />
                  <div className={styles.entryBody}>
                    <div className={styles.entryHeader}>
                      <span className={styles.entryReason}>{entry.reason}</span>
                      <span className={styles.entryAmount}>
                        {entry.type === 'earn' ? '+' : '-'}{entry.amount.toFixed(1)} {CN.pointsUnit}
                      </span>
                    </div>
                    <p className={styles.entryDate}>{new Date(entry.date).toLocaleString('zh-CN')}</p>
                    {entry.link && (
                      <a href={entry.link} target="_blank" rel="noreferrer" className={styles.entryLink}>{CN.viewProduct}</a>
                    )}
                    {entry.image && (
                      <img src={'data:image/jpeg;base64,' + entry.image} className={styles.entryImg} alt={CN.productImage} />
                    )}
                    <button className={styles.deleteEntryBtn} onClick={() => handleDeleteHistory(entry.id)}>{CN.delete}</button>
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
