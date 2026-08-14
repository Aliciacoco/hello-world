import { useNavigate } from 'react-router-dom'
import { useCheckin } from '../contexts/CheckinContext'
import { ALL_TASK_KEYS, TASK_LABELS, calcExamCountdown } from '../utils/checkin'
import styles from './DailyCheckin.module.css'

export default function DailyCheckin() {
  const { today } = useCheckin()
  const navigate  = useNavigate()

  if (!today) return null

  const { progress, targets, config } = today
  const exam     = calcExamCountdown(config.examDates)
  const doneCount = ALL_TASK_KEYS.filter(k => (progress[k] || 0) >= targets[k]).length
  const allDone   = doneCount === ALL_TASK_KEYS.length

  return (
    <div
      className={`${styles.banner} ${allDone ? styles.bannerDone : ''}`}
      onClick={() => navigate('/checkin')}
      title="点击查看打卡详情"
    >
      {/* ── 顶行：日期 + 考试倒计时 + 连续打卡 ── */}
      <div className={styles.topRow}>
        <span className={styles.dateLabel}>
          今日打卡 · {today.date}
        </span>
        <div className={styles.topRight}>
          {exam && (
            <span className={styles.examTag}>
              {exam.days === 0 ? '🎯 今天考试！' : `🎯 距考试 ${exam.days} 天`}
            </span>
          )}
          <span className={styles.progressSummary}>
            {allDone ? '🎉 今日全部完成！' : `${doneCount} / ${ALL_TASK_KEYS.length} 项完成`}
          </span>
        </div>
      </div>

      {/* ── 任务格子 ── */}
      <div className={styles.tasks}>
        {ALL_TASK_KEYS.map(key => {
          const cur  = progress[key] || 0
          const max  = targets[key]  || 1
          const done = cur >= max
          const pct  = Math.min(cur / max, 1)
          return (
            <div key={key} className={`${styles.task} ${done ? styles.taskDone : ''}`}>
              <span className={styles.taskLabel}>{TASK_LABELS[key]}</span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${pct * 100}%` }} />
              </div>
              <span className={styles.taskCount}>
                {done ? '✅' : `${cur}/${max}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
