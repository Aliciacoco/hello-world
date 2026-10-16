import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HabitReminders from './HabitReminders'
import styles from './StudyHabits.module.css'

interface HabitRecord {
  date: string
  studyCompleted: boolean
  minutes: number
  summary: string
  bedtime: string
  updatedAt?: string
  rewards?: { study: boolean; sleep: boolean }
}
const localDate = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const weekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay()
  return d >= 1 && d <= 5
}
const blank = (date: string): HabitRecord => ({ date, studyCompleted: false, minutes: 60, summary: '', bedtime: '' })
function offset(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}

export default function StudyHabits() {
  const [today, setToday] = useState(localDate)
  const [date, setDate] = useState(localDate)
  const [records, setRecords] = useState<Record<string, HabitRecord>>({})
  const [form, setForm] = useState<HabitRecord>(() => blank(localDate()))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/habits')
      if (!res.ok) throw new Error('读取打卡记录失败，请重试')
      const data: { today: string; records: Record<string, HabitRecord> } = await res.json()
      setToday(data.today); setDate(data.today); setRecords(data.records)
      setForm(data.records[data.today] || blank(data.today)); setDirty(false)
    } catch (e) { setError(e instanceof Error ? e.message : '读取失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!dirty) return
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])

  function select(next: string) {
    if (!next || next > today || next === date) return
    if (dirty && !window.confirm('小结还未保存，确定切换日期吗？')) return
    setDate(next); setForm(records[next] || blank(next)); setDirty(false); setMessage(''); setError('')
  }
  function change(patch: Partial<HabitRecord>) {
    setForm(f => ({ ...f, ...patch })); setDirty(true); setMessage('')
  }
  async function save(complete = form.studyCompleted, bedtime = form.bedtime) {
    setBusy(true); setError(''); setMessage('')
    try {
      const res = await fetch(`/api/habits/${date}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, studyCompleted: complete, bedtime }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存失败，请重试')
      const { _pts, _balance, ...record } = data
      setRecords(r => ({ ...r, [date]: record })); setForm(record); setDirty(false)
      if (typeof _balance === 'number') {
        window.dispatchEvent(new CustomEvent('points-updated', { detail: { balance: _balance } }))
      }
      if (_pts > 0) {
        window.dispatchEvent(new CustomEvent('points-earned', { detail: { amount: _pts, balance: _balance, activity: 'checkin' } }))
      }
      setMessage(_pts > 0 ? `打卡成功，获得 ${_pts} 积分` : '已保存')
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { setBusy(false) }
  }

  const day = new Date(`${today}T00:00:00Z`).getUTCDay()
  const monday = offset(today, -(day === 0 ? 6 : day - 1))
  const week = Array.from({ length: 5 }, (_, i) => offset(monday, i))
  const completed = week.filter(d => records[d]?.studyCompleted).length
  const history = Object.values(records).sort((a, b) => b.date.localeCompare(a.date))
  const currentTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())

  return <section className={styles.root} aria-labelledby="habit-title">
    <div className={styles.heading}>
      <h2 id="habit-title">{date === today ? '今天' : date}</h2>
      <span className={styles.hint}>本周 {completed} / 5 天</span>
    </div>
    {loading ? <p role="status">正在读取打卡记录…</p> : <>
      <fieldset disabled={busy} className={styles.editor}>
        <div className={styles.heading}><h3>{form.studyCompleted ? '晨学已完成 ✓' : '晨学'}</h3><Link to="/">去学习 →</Link></div>
        <p className={styles.hint}>{weekday(date) ? `周一至周五 · 06:00–07:00 · ${form.rewards?.study ? '20 积分已领取' : '打卡 +20 积分'}` : '周末自由安排，写点收获也很好。'}</p>
        <label className={styles.field}>学习小结<textarea rows={3} maxLength={5000} value={form.summary} placeholder="今天学到了什么？" onChange={e => change({ summary: e.target.value })} /></label>
        {dirty && <p className={styles.hint}>修改后记得保存</p>}
        <div className={styles.actions}>
          {weekday(date) && !form.studyCompleted
            ? <button className={styles.primary} onClick={() => void save(true)} disabled={form.minutes < 60 || !form.summary.trim()}>{busy ? '保存中…' : '完成 1 小时学习，打卡'}</button>
            : <button className={styles.primary} disabled={!dirty} onClick={() => void save()}>{busy ? '保存中…' : '保存小结'}</button>}
        </div>
        <div className={styles.sleep}>
          <div className={styles.heading}>
            <div><h3>睡前打卡</h3><p>{records[date]?.bedtime ? `${records[date].bedtime} 已打卡 ✓${form.rewards?.sleep ? ' · 20 积分已领取' : ''}` : `22:00 前上床 · ${form.rewards?.sleep ? '20 积分已领取' : '打卡 +20 积分'}`}</p></div>
            {!records[date]?.bedtime && <button onClick={() => {
              if (date !== today && !form.bedtime) { setError('补记睡前打卡时，请填写当天实际就寝时间'); return }
              const time = form.bedtime || currentTime()
              change({ bedtime: time }); void save(form.studyCompleted, time)
            }}>准备睡了</button>}
          </div>
        </div>
        <details className={styles.options}><summary>修改记录 / 保存草稿</summary>
          <label className={styles.field}>实际学习时长（分钟）<input type="number" min="0" max="1440" step="1" value={form.minutes} onChange={e => change({ minutes: Number(e.target.value) })} /></label>
          <label className={styles.field}>就寝时间<input type="time" value={form.bedtime} onChange={e => change({ bedtime: e.target.value })} /></label>
          <div className={styles.actions}>
            <button onClick={() => void save()}>保存记录</button>
            {form.studyCompleted && <button onClick={() => void save(false)}>撤销晨学打卡</button>}
            {form.bedtime && <button onClick={() => { change({ bedtime: '' }); void save(form.studyCompleted, '') }}>撤销睡前打卡</button>}
          </div>
        </details>
      </fieldset>
    </>}
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => void load()} disabled={busy || dirty}>重新读取</button></p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    <details className={styles.history}><summary>历史记录与补记</summary>
      <div className={styles.week} aria-label="本周晨学打卡">
        {week.map((d, i) => <button key={d} disabled={d > today || busy || loading} onClick={() => select(d)} aria-pressed={date === d}>
          <span>周{['一', '二', '三', '四', '五'][i]}</span><strong>{records[d]?.studyCompleted ? '✓' : d > today ? '·' : '○'}</strong><small>{d.slice(5).replace('-', '/')}</small>
        </button>)}
      </div>
      <div className={styles.dateRow}><label htmlFor="habit-date">选择日期</label>
        <input id="habit-date" type="date" value={date} max={today} disabled={busy} onChange={e => select(e.target.value)} />
        {date !== today && <button disabled={busy} onClick={() => select(today)}>回到今天</button>}
      </div>
      {history.length === 0 && <p>从今天开始，留下第一条记录。</p>}
      {history.map(item => <article key={item.date}>
        <div className={styles.heading}><strong>{item.date}</strong><button disabled={busy || loading} onClick={() => select(item.date)}>查看 / 修改</button></div>
        <p>{item.studyCompleted ? '晨学完成' : '晨学未打卡'} · 学习 {item.minutes} 分钟 · {item.bedtime ? `${item.bedtime} 就寝` : '睡前未打卡'}</p>
        <p className={styles.summary}>{item.summary || '还没有写小结'}</p>
      </article>)}
    </details>
    <details className={styles.history}><summary>提醒设置</summary><HabitReminders /></details>
  </section>
}
