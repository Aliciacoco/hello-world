import { useState, useEffect, useCallback } from 'react'
import {
  fetchHistory, saveCheckinConfig,
  TASK_LABELS, getActiveTasks,
  CalendarDay, CheckinConfig, calcExamCountdown,
} from '../utils/checkin'

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}
import { useCheckin } from '../contexts/CheckinContext'
import styles from './CheckinPage.module.css'

// ── 工具 ──────────────────────────────────────────────────────────
function formatDate(d: string) {
  const [, m, day] = d.split('-')
  return `${parseInt(m)}/${parseInt(day)}`
}

function getWeekdayLabel(d: string) {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(d + 'T00:00:00').getDay()]
}

// ── 今日进度卡 ────────────────────────────────────────────────────
function TodayCard() {
  const { today, increment } = useCheckin()
  const [mockLoading, setMockLoading] = useState(false)

  if (!today) return <p className={styles.loading}>加载中...</p>

  const { progress, targets, isSaturday } = today
  const activeTasks = getActiveTasks(today.date)

  const handleMock = async () => {
    if (mockLoading || (progress.mock || 0) >= targets.mock) return
    setMockLoading(true)
    try { await increment('mock') } finally { setMockLoading(false) }
  }

  return (
    <div className={styles.todayGrid}>
      {activeTasks.map(key => {
        const cur    = progress[key] || 0
        const max    = targets[key]  || 1
        const done   = cur >= max
        const pct    = Math.min(cur / max, 1)
        const isMock = key === 'mock'
        return (
          <div key={key} className={`${styles.todayItem} ${done ? styles.todayItemDone : ''}`}>
            <div className={styles.todayItemHeader}>
              <span className={styles.todayItemLabel}>{TASK_LABELS[key]}</span>
              <span className={styles.todayItemCount}>
                {done ? '✅' : (key === 'mock' ? `${fmt(cur)}/${fmt(max)}` : `${fmt(cur)}/${fmt(max)}分`)}
              </span>
            </div>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${pct * 100}%` }} />
            </div>
            {isMock && isSaturday && !done && (
              <button
                className={styles.mockBtn}
                onClick={handleMock}
                disabled={mockLoading}
              >
                {mockLoading ? '打卡中...' : '✓ 完成今日套题'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 日历格子（今天 → 考试日）────────────────────────────────────────
function CalendarGrid({ calendar, examDates }: { calendar: CalendarDay[]; examDates: string[] }) {
  const today  = new Date().toISOString().slice(0, 10)
  const examSet = new Set(examDates)

  if (calendar.length === 0) {
    return <p className={styles.loading}>暂无考试日期，请在配置中设置</p>
  }

  return (
    <div className={styles.calendar}>
      {calendar.map(day => {
        const isToday  = day.date === today
        const isExam   = examSet.has(day.date)
        const isFuture = day.date > today
        const activeTasks = getActiveTasks(day.date)
        const doneCount   = activeTasks.filter(k => (day[k] || 0) > 0).length

        let cls = styles.calDay
        if (isExam)              cls += ' ' + styles.calDayExam
        else if (isToday)        cls += ' ' + styles.calDayToday
        else if (isFuture && day.isSaturday) cls += ' ' + styles.calDaySatFuture
        else if (isFuture)       cls += ' ' + styles.calDayFuture
        else if (day.completed)  cls += ' ' + styles.calDayDone
        else if (doneCount > 0)  cls += ' ' + styles.calDayPartial
        else                     cls += ' ' + styles.calDayMiss

        return (
          <div
            key={day.date}
            className={cls}
            title={`${day.date}（周${getWeekdayLabel(day.date)}）${day.isSaturday ? ' 📝套题' : ''}`}
          >
            <span className={styles.calDate}>{formatDate(day.date)}</span>
            {isExam ? (
              <span className={styles.calExamMark}>考</span>
            ) : isFuture ? (
              <span className={styles.calDot}>{day.isSaturday ? '📝' : '·'}</span>
            ) : (
              <span className={styles.calDot}>
                {day.completed ? '●' : doneCount > 0 ? '◐' : isToday ? '○' : '·'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 配置面板 ──────────────────────────────────────────────────────
const TARGET_LABELS: Record<string, string> = {
  speed:             '⚡ 速算（积分，排列组合+分数速算合计，每题0.1分）',
  idiom:             '📖 成语辨析（积分，每题0.5分）',
  changshi:          '🧠 常识（积分，每题0.5分）',
  shenlun:           '✍️ 申论（积分，单篇最高5分，累计满即可）',
  math_practice:     '📊 数量关系·练题（积分，每题1分）',
  math_upload:       '📊 数量关系·录题（积分，每题1分）',
  analysis_practice: '📈 资料分析·练题（积分，每题1分）',
  analysis_upload:   '📈 资料分析·录题（积分，每题1分）',
  mock:              '📝 套题（套数，仅周六，手动打卡）',
}

const ALL_TARGET_KEYS = [
  'speed', 'idiom', 'changshi', 'shenlun',
  'math_practice', 'math_upload',
  'analysis_practice', 'analysis_upload',
  'mock',
]

function ConfigPanel({ config, onSaved }: { config: CheckinConfig; onSaved: (c: CheckinConfig) => void }) {
  const [examDates, setExamDates] = useState<string[]>(config.examDates)
  const [targets,   setTargets]   = useState({ ...config.targets })
  const [newDate,   setNewDate]   = useState('')
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')

  const addDate = () => {
    const d = newDate.trim()
    if (!d || examDates.includes(d)) return
    setExamDates(prev => [...prev, d].sort())
    setNewDate('')
  }

  const removeDate = (d: string) => setExamDates(prev => prev.filter(x => x !== d))

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const updated = await saveCheckinConfig({ examDates, targets })
      onSaved(updated)
      setMsg('保存成功 ✓')
      setTimeout(() => setMsg(''), 2000)
    } catch {
      setMsg('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.configPanel}>
      {/* ── 注意事项 ── */}
      <div className={styles.configNote}>
        ℹ️ 修改目标只影响<strong>今日及以后</strong>的完成判定；历史已打卡的记录不会改变。
      </div>

      {/* ── 考试日期 ── */}
      <div className={styles.configSection}>
        <h3 className={styles.configTitle}>考试日期</h3>
        <div className={styles.dateList}>
          {examDates.length === 0 && (
            <span className={styles.emptyHint}>还没有设置考试日期</span>
          )}
          {examDates.map(d => (
            <span key={d} className={styles.dateChip}>
              {d}
              <button className={styles.dateRemove} onClick={() => removeDate(d)}>×</button>
            </span>
          ))}
        </div>
        <div className={styles.dateAddRow}>
          <input
            type="date"
            className={styles.dateInput}
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
          <button className={styles.addBtn} onClick={addDate}>添加</button>
        </div>
      </div>

      {/* ── 每日目标 ── */}
      <div className={styles.configSection}>
        <h3 className={styles.configTitle}>每日目标</h3>
        <div className={styles.targetGrid}>
          {ALL_TARGET_KEYS.map(key => (
            <div key={key} className={styles.targetRow}>
              <label className={styles.targetLabel}>{TARGET_LABELS[key]}</label>
              <input
                type="number"
                className={styles.targetInput}
                value={(targets as Record<string, number>)[key] ?? 0}
                min={0}
                max={200}
                step={key === 'mock' ? 1 : 0.5}
                onChange={e => setTargets(prev => ({
                  ...prev,
                  [key]: key === 'mock'
                    ? (parseInt(e.target.value, 10) || 0)
                    : (parseFloat(e.target.value) || 0),
                }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.saveRow}>
        {msg && <span className={styles.saveMsg}>{msg}</span>}
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function CheckinPage() {
  const [calendar, setCalendar] = useState<CalendarDay[]>([])
  const [streak,   setStreak]   = useState(0)
  const [config,   setConfig]   = useState<CheckinConfig | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'history' | 'config'>('history')

  const load = useCallback(async () => {
    try {
      const data = await fetchHistory()
      setCalendar(data.calendar)
      setStreak(data.streak)
      setConfig(data.config)
    } catch { /* noop */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const exam = config ? calcExamCountdown(config.examDates) : null

  return (
    <div className={styles.page}>
      {/* ── 页头 ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>每日打卡</h1>
          {streak > 0 && (
            <span className={styles.streakBadge}>🔥 连续 {streak} 天</span>
          )}
        </div>
        {exam && (
          <div className={styles.examCountdown}>
            <span className={styles.examLabel}>距 {exam.date} 考试</span>
            <span className={styles.examDays}>{exam.days === 0 ? '今天！' : `${exam.days} 天`}</span>
          </div>
        )}
      </div>

      {/* ── 今日进度 ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>今日进度</h2>
        <TodayCard />
      </section>

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`}
          onClick={() => setTab('history')}
        >打卡日历</button>
        <button
          className={`${styles.tab} ${tab === 'config' ? styles.tabActive : ''}`}
          onClick={() => setTab('config')}
        >目标配置</button>
      </div>

      {/* ── 日历（今天 → 考试日）── */}
      {tab === 'history' && (
        <section className={styles.section}>
          {loading ? (
            <p className={styles.loading}>加载中...</p>
          ) : (
            <>
              <div className={styles.legendRow}>
                <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendDone}`} />全部完成</span>
                <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendPartial}`} />部分完成</span>
                <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendMiss}`} />未完成</span>
                <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendSat}`} />周六·套题</span>
                <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendExam}`} />考试日</span>
              </div>
              <CalendarGrid calendar={calendar} examDates={config?.examDates ?? []} />
            </>
          )}
        </section>
      )}

      {/* ── 目标配置 ── */}
      {tab === 'config' && config && (
        <section className={styles.section}>
          <ConfigPanel
            config={config}
            onSaved={newCfg => {
              setConfig(newCfg)
              load()
            }}
          />
        </section>
      )}
    </div>
  )
}
