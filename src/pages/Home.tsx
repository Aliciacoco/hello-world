import PracticeCard from './Practice'
import IdiomCard from './Idiom'
import ExamCard from './ExamCard'
import styles from './Home.module.css'

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <PracticeCard />
        <IdiomCard />
        <ExamCard />
      </div>
    </div>
  )
}
