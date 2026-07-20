import { useEffect, useMemo, useState } from 'react'
import PracticeCard from './Practice'
import IdiomCard from './Idiom'
import ExamCard from './ExamCard'
import ShenlunCard from './Shenlun'
import styles from './Home.module.css'

interface HistoryEntry {
  id: string
  type: 'earn' | 'redeem'
  amount: number
  reason: string
  date: number
}

interface PointsData {
  balance: number
  history: HistoryEntry[]
}

const CN = {
  stripTitle: '\u672c\u5468\u7ec3\u9898\u52a8\u529b',
  stripSub: '\u4e0d\u589e\u52a0\u65b0\u5165\u53e3\uff0c\u70b9\u4e0b\u9762\u5361\u7247\u76f4\u63a5\u505a\u9898',
  weekEarned: '\u672c\u5468\u5df2\u8d5a',
  nextReward: '\u8ddd\u4e0b\u4e2a\u5c0f\u5956\u52b1',
  todayMission: '\u4eca\u65e5\u4efb\u52a1',
  points: '\u5206',
  done: '\u5df2\u8fbe\u6210',
  changshi: '\u5e38\u8bc6',
  math: '\u6570\u91cf\u5173\u7cfb',
  judgement: '\u5224\u65ad\u63a8\u7406',
  analysis: '\u8d44\u6599\u5206\u6790',
}

const milestones = [50, 100, 200, 500, 1000]

function getWeekStart(now: Date) {
  const start = new Date(now)
  const day = start.getDay() || 7
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - day + 1)
  return start.getTime()
}

function MotivationStrip() {
  const [data, setData] = useState<PointsData | null>(null)

  useEffect(() => {
    fetch('/api/points')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [])

  const summary = useMemo(() => {
    if (!data) return null
    const weekStart = getWeekStart(new Date())
    const weekEarned = data.history
      .filter(entry => entry.type === 'earn' && entry.date >= weekStart)
      .reduce((sum, entry) => sum + entry.amount, 0)
    const next = milestones.find(value => value > data.balance) ?? milestones[milestones.length - 1]
    const remaining = Math.max(0, next - data.balance)
    return { weekEarned, next, remaining }
  }, [data])

  const missionCount = new Date().getDay() % 2 === 0 ? 8 : 6

  return (
    <section className={styles.motivation} aria-label={CN.stripTitle}>
      <div className={styles.motivationMain}>
        <p className={styles.motivationTitle}>{CN.stripTitle}</p>
        <p className={styles.motivationSub}>{CN.stripSub}</p>
      </div>
      <div className={styles.motivationStats}>
        <div className={styles.motivationItem}>
          <span className={styles.motivationValue}>{summary ? '+' + summary.weekEarned.toFixed(1) : '--'}</span>
          <span className={styles.motivationLabel}>{CN.weekEarned}</span>
        </div>
        <div className={styles.motivationItem}>
          <span className={styles.motivationValue}>{summary ? (summary.remaining === 0 ? CN.done : summary.remaining.toFixed(1)) : '--'}</span>
          <span className={styles.motivationLabel}>{CN.nextReward}{summary ? ' ' + summary.next + CN.points : ''}</span>
        </div>
        <div className={styles.motivationItem}>
          <span className={styles.motivationValue}>{missionCount}</span>
          <span className={styles.motivationLabel}>{CN.todayMission}</span>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <div className={styles.page}>
      <MotivationStrip />
      <div className={styles.grid}>
        <PracticeCard />
        <IdiomCard />
        <ExamCard subject={CN.changshi} bankType="changshi" pointsPerCorrect={0.5} openEnded />
        <ExamCard subject={CN.math} bankType="math" pointsPerCorrect={1} />
        <ExamCard subject={CN.judgement} bankType="judgement" pointsPerCorrect={1} />
        <ExamCard subject={CN.analysis} bankType="analysis" pointsPerCorrect={1} />
        <ShenlunCard />
      </div>
    </div>
  )
}
