import { useState } from 'react'
import PracticeCard from './Practice'
import IdiomCard from './Idiom'
import styles from './Home.module.css'

type Tab = 'math' | 'idiom'

export default function Home() {
  const [tab, setTab] = useState<Tab>('math')

  return (
    <div className={styles.page}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'math' ? styles.tabActive : ''}`}
          onClick={() => setTab('math')}
        >
          排列组合
        </button>
        <button
          className={`${styles.tab} ${tab === 'idiom' ? styles.tabActive : ''}`}
          onClick={() => setTab('idiom')}
        >
          成语辨析
        </button>
      </div>
      <div className={styles.cardWrap}>
        {tab === 'math' ? <PracticeCard /> : <IdiomCard />}
      </div>
    </div>
  )
}
