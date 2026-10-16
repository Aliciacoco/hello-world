import StudyHabits from '../components/StudyHabits'
import styles from './CheckinPage.module.css'

export default function CheckinPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>每日打卡</h1>
      <StudyHabits />
    </div>
  )
}