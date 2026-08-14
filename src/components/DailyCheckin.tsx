import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCheckin } from '../contexts/CheckinContext'
import { getActiveTasks, TASK_LABELS, calcExamCountdown } from '../utils/checkin'
import styles from './DailyCheckin.module.css'

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

export default function DailyCheckin() {
  const { today, increment } = useCheckin()
  const navigate = useNavigate()
  const [mockLoading, setMockLoading] = useState(false)

  if (!today) return null

  const { progress, targets, config, isSaturday } = today
  const activeTasks  = getActiveTasks(today.date)
  const exam         = calcExamCountdown(config.examDates)
  const doneCount    = activeTasks.filter(k => (progress[k] || 0) >= targets[k]).length
  const allDone      = doneCount === activeTasks.length

  const handleMock = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (mockLoading || (progress.mock || 0) >= targets.mock) return
    setMockLoading(true)
    try { await increment('mock') } finally { setMockLoading(false) }
  }

  return (
    <div
      className={`${styles.banner} ${allDone ? styles.bannerDone : ''}`}
      onClick={() => navigate('/checkin')}
      title="点击查看打卡详情"
    >
      {/* ── 顶行 ── */}
      <div className={styles.topRow}>
        <span className={styles.dateLabel}>
          今日打卡 · {today.date}{isSaturday ? ' · 周六有套题' : ''}
        </span>
        <div className={styles.topRight}>
          {exam && (
            <span className={styles.examTag}>
              {exam.days === 0 ? '🎯 今天考试！' : `🎯 距考试 ${exam.days} 天`}
            </span>
          )}
          <span className={styles.progressSummary}>
            {allDone ? '🎉 今日全部完成！' : `${doneCount} / ${activeTasks.length} 项`}
          </span>
        </div>
      </div>

      {/* ── 任务格子 ── */}
      <div className={styles.tasks}>
        {activeTasks.map(key => {
          const cur    = progress[key] || 0
          const max    = targets[key]  || 1
          const done   = cur >= max
          const pct    = Math.min(cur / max, 1)
          const isMock = key === 'mock'

          return (
            <div key={key} className={`${styles.task} ${done ? styles.taskDone : ''}`}>
              <span className={styles.taskLabel}>{TASK_LABELS[key]}</span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${pct * 100}%` }} />
              </div>
              {isMock && !done ? (
                <button
                  className={styles.mockBtn}
                  onClick={handleMock}
                  disabled={mockLoading}
                  title="完成今日套题，点击打卡"
                >
                  {mockLoading ? '…' : '完成 ✓'}
                </button>
              ) : (
                <span className={styles.taskCount}>
                  {done ? '✅' : (isMock ? `${fmt(cur)}/${fmt(max)}` : `${fmt(cur)}/${fmt(max)}分`)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
