import { useState } from 'react'
import { getWrongAnswers, clearWrongAnswers } from '../utils/storage'
import styles from './WrongAnswers.module.css'

export default function WrongAnswers() {
  const [list, setList] = useState(() => getWrongAnswers())

  const handleClear = () => {
    if (confirm('确定清空所有错题吗？')) {
      clearWrongAnswers()
      setList([])
    }
  }

  if (list.length === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>错题本</h1>
        <p className={styles.empty}>暂无错题，继续加油！</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>错题本</h1>
        <button className={styles.clearBtn} onClick={handleClear}>清空</button>
      </div>
      <div className={styles.list}>
        {list.map(item => (
          <div key={item.id} className={styles.card}>
            <div className={styles.question}>
              {item.question.type}
              <sub>{item.question.n}</sub>
              <sup>{item.question.r}</sup>
              {' = '}
              <span className={styles.wrong}>{item.userAnswer}</span>
              {' （正确：'}
              <span className={styles.correct}>{item.correctAnswer}</span>
              {'）'}
            </div>
            <p className={styles.explanation}>{item.explanation}</p>
            <p className={styles.reason}><strong>我的原因：</strong>{item.reason}</p>
            <p className={styles.date}>{new Date(item.date).toLocaleString('zh-CN')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
