import PracticeCard from './Practice'
import IdiomCard from './Idiom'
import ExamCard from './ExamCard'
import ShenlunCard from './Shenlun'
import ZhengzhiCard from './Zhengzhi'
import styles from './Home.module.css'

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <PracticeCard />
        <IdiomCard />
        <ExamCard subject="常识" bankType="changshi" pointsPerCorrect={0.5} openEnded />
        <ExamCard subject="数量关系" bankType="math" pointsPerCorrect={1} />
        <ExamCard subject="判断推理" bankType="judgement" pointsPerCorrect={1} />
        <ExamCard subject="资料分析" bankType="analysis" pointsPerCorrect={1} />
        <ShenlunCard />
        <ZhengzhiCard />
      </div>
    </div>
  )
}
