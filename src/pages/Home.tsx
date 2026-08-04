import { useState } from 'react'
import PracticeCard from './Practice'
import FractionPractice from './FractionPractice'
import IdiomCard from './Idiom'
import ExamCard from './ExamCard'
import ShenlunCard from './Shenlun'
import DailyExplore from '../components/DailyExplore'
import styles from './Home.module.css'

export default function Home() {
  const [tab, setTab] = useState<'practice' | 'explore'>('practice')

  return (
    <div className={styles.page}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'practice' ? styles.tabActive : ''}`}
          onClick={() => setTab('practice')}
        >练习</button>
        <button
          className={`${styles.tab} ${tab === 'explore' ? styles.tabActive : ''}`}
          onClick={() => setTab('explore')}
        >探索</button>
      </div>

      {tab === 'practice' && (
        <div className={styles.grid}>
          <PracticeCard />
          <FractionPractice />
          <IdiomCard />
          <ExamCard subject="常识" bankType="changshi" pointsPerCorrect={0.5} openEnded />
          <ExamCard subject="数量关系" bankType="math" pointsPerCorrect={1} />
          <ExamCard subject="判断推理" bankType="judgement" pointsPerCorrect={1} />
          <ExamCard subject="资料分析" bankType="analysis" pointsPerCorrect={1} />
          <ShenlunCard />
        </div>
      )}

      {tab === 'explore' && <DailyExplore />}
    </div>
  )
}
