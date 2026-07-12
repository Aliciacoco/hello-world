import { useState, useEffect } from 'react'
import { getWrongAnswers, clearWrongAnswers, deleteWrongAnswer, type WrongAnswer, type MathWrongAnswer, type IdiomWrongAnswer, type ExamWrongAnswer } from '../utils/storage'
import styles from './WrongAnswers.module.css'

function MathCard({ item, onDelete }: { item: MathWrongAnswer; onDelete: (id: string) => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.tag}>排列组合</div>
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
      <div className={styles.cardActions}>
        <button className={styles.deleteCardBtn} onClick={() => onDelete(item.id)}>删除</button>
      </div>
    </div>
  )
}

function IdiomCard({ item, onDelete }: { item: IdiomWrongAnswer; onDelete: (id: string) => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.tag}>成语辨析</div>
      <div className={styles.question}>
        <strong>{item.word}</strong>
      </div>
      <p className={styles.explanation}><strong>我的理解：</strong>{item.userAnswer}</p>
      <p className={styles.explanation}><strong>正确解析：</strong>{item.explanation}</p>
      <p className={styles.reason}><strong>我的原因：</strong>{item.reason}</p>
      <p className={styles.date}>{new Date(item.date).toLocaleString('zh-CN')}</p>
      <div className={styles.cardActions}>
        <button className={styles.deleteCardBtn} onClick={() => onDelete(item.id)}>删除</button>
      </div>
    </div>
  )
}

function ExamCard({ item, onDelete }: { item: ExamWrongAnswer; onDelete: (id: string) => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.tag}>行测题</div>
      <div className={styles.question}>{item.stem}</div>
      {item.options && <p className={styles.explanation} style={{ whiteSpace: 'pre-line' }}>{item.options}</p>}
      <p className={styles.explanation}>
        <span className={styles.wrong}>我的答案：{item.userAnswer}</span>
        {'　'}
        <span className={styles.correct}>正确答案：{item.answer}</span>
      </p>
      <p className={styles.explanation}><strong>解析：</strong>{item.explanation}</p>
      <p className={styles.reason}><strong>我的原因：</strong>{item.reason}</p>
      <p className={styles.date}>{new Date(item.date).toLocaleString('zh-CN')}</p>
      <div className={styles.cardActions}>
        <button className={styles.deleteCardBtn} onClick={() => onDelete(item.id)}>删除</button>
      </div>
    </div>
  )
}

export default function WrongAnswers() {
  const [list, setList] = useState<WrongAnswer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getWrongAnswers().then(data => {
      setList(data)
      setLoading(false)
    })
  }, [])

  const handleClear = async () => {
    if (confirm('确定清空所有错题吗？')) {
      await clearWrongAnswers()
      setList([])
    }
  }

  const handleDeleteOne = async (id: string) => {
    await deleteWrongAnswer(id)
    setList(l => l.filter(item => item.id !== id))
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>错题本</h1>
        <p className={styles.empty}>加载中...</p>
      </div>
    )
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
        {list.map(item =>
          item.type === 'idiom'
            ? <IdiomCard key={item.id} item={item as IdiomWrongAnswer} onDelete={handleDeleteOne} />
            : item.type === 'exam'
              ? <ExamCard key={item.id} item={item as ExamWrongAnswer} onDelete={handleDeleteOne} />
              : <MathCard key={item.id} item={item as MathWrongAnswer} onDelete={handleDeleteOne} />
        )}
      </div>
    </div>
  )
}
