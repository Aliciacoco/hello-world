import { useState } from 'react'
import { earnPoints } from '../utils/points'
import examStyles from './ExamCard.module.css'
import styles from './Shenlun.module.css'

type Phase = 'idle' | 'generating' | 'writing' | 'judging' | 'result' | 'editing' | 'saving' | 'saved'

interface Point {
  claim: string
  argument: string
}

interface Answer {
  title: string
  intro: string
  points: Point[]
  conclusion: string
}

interface JudgeResult {
  score: number
  feedback: string
  exemplar: string
}

const emptyAnswer = (): Answer => ({
  title: '',
  intro: '',
  points: [{ claim: '', argument: '' }],
  conclusion: '',
})

export default function ShenlunCard() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [topic, setTopic] = useState('')
  const [answer, setAnswer] = useState<Answer>(emptyAnswer())
  const [result, setResult] = useState<JudgeResult | null>(null)
  const [showExemplar, setShowExemplar] = useState(false)
  const [error, setError] = useState('')

  const generateTopic = async () => {
    setPhase('generating')
    setError('')
    setAnswer(emptyAnswer())
    setResult(null)
    setShowExemplar(false)
    try {
      const res = await fetch('/api/shenlun/topic', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setTopic(data.topic)
      setPhase('writing')
    } catch {
      setError('出题失败，请重试')
      setPhase('idle')
    }
  }

  const setPoint = (i: number, key: keyof Point, val: string) => {
    setAnswer(a => {
      const points = [...a.points]
      points[i] = { ...points[i], [key]: val }
      return { ...a, points }
    })
  }

  const addPoint = () =>
    setAnswer(a => ({ ...a, points: [...a.points, { claim: '', argument: '' }] }))

  const removePoint = (i: number) =>
    setAnswer(a => ({ ...a, points: a.points.filter((_, idx) => idx !== i) }))

  const submitAnswer = async (editedAnswer?: Answer) => {
    const ans = editedAnswer ?? answer
    if (!ans.title.trim() || !ans.intro.trim() || !ans.conclusion.trim()) {
      setError('标题、首段和尾段不能为空')
      return
    }
    if (ans.points.some(p => !p.claim.trim())) {
      setError('每个分论点的标题不能为空')
      return
    }
    setError('')
    if (editedAnswer) setAnswer(editedAnswer)
    setPhase('judging')
    try {
      const res = await fetch('/api/shenlun/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, ...ans }),
      })
      if (!res.ok) throw new Error()
      const data: JudgeResult = await res.json()
      setResult(data)
      earnPoints(data.score * 0.5, `申论作答（${data.score}/10分）`)
      setPhase('result')
    } catch {
      setError('批改失败，请重试')
      setPhase(editedAnswer ? 'editing' : 'writing')
    }
  }

  const saveEntry = async () => {
    if (!result) return
    setPhase('saving')
    try {
      await fetch('/api/shenlun/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, answer, ...result }),
      })
      setPhase('saved')
    } catch {
      setError('保存失败，请重试')
      setPhase('result')
    }
  }

  return (
    <div className={examStyles.container}>
      <div className={examStyles.card}>
        <div className={examStyles.header}>
          <span className={examStyles.label}>申论</span>
        </div>

        {phase === 'idle' && (
          <>
            {error && <p className={examStyles.error}>{error}</p>}
            <button className={examStyles.btn} onClick={generateTopic}>出题</button>
          </>
        )}

        {phase === 'generating' && (
          <p className={styles.loading}>AI 出题中...</p>
        )}

        {(phase === 'writing' || phase === 'editing') && (
          <>
            <div className={styles.topicBox}>
              <span className={styles.topicLabel}>题目</span>
              <p className={styles.topicText}>{topic}</p>
            </div>

            <div className={styles.writingArea}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>标题</span>
                <input
                  className={examStyles.input}
                  value={answer.title}
                  onChange={e => setAnswer(a => ({ ...a, title: e.target.value }))}
                  placeholder="写下文章标题..."
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>首段</span>
                <textarea
                  className={examStyles.textarea}
                  value={answer.intro}
                  onChange={e => setAnswer(a => ({ ...a, intro: e.target.value }))}
                  placeholder="引入背景，提出总论点..."
                  rows={3}
                />
              </div>

              {answer.points.map((p, i) => (
                <div key={i} className={styles.pointBlock}>
                  <div className={styles.pointHeader}>
                    <span className={styles.fieldLabel}>分论点 {i + 1}</span>
                    <button
                      className={styles.removeBtn}
                      onClick={() => removePoint(i)}
                      disabled={answer.points.length <= 1}
                    >删除</button>
                  </div>
                  <input
                    className={examStyles.input}
                    value={p.claim}
                    onChange={e => setPoint(i, 'claim', e.target.value)}
                    placeholder={`分论点 ${i + 1} 标题`}
                  />
                  <textarea
                    className={examStyles.textarea}
                    value={p.argument}
                    onChange={e => setPoint(i, 'argument', e.target.value)}
                    placeholder="论证内容（事例、分析、引用等）..."
                    rows={3}
                  />
                </div>
              ))}

              <button className={styles.addBtn} onClick={addPoint}>＋ 添加分论点</button>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>尾段</span>
                <textarea
                  className={examStyles.textarea}
                  value={answer.conclusion}
                  onChange={e => setAnswer(a => ({ ...a, conclusion: e.target.value }))}
                  placeholder="总结升华，呼应总论点..."
                  rows={3}
                />
              </div>

              {error && <p className={examStyles.error}>{error}</p>}
              <button className={examStyles.btn} onClick={() => submitAnswer()}>提交批改</button>
            </div>
          </>
        )}

        {phase === 'judging' && (
          <p className={styles.loading}>申论老师批改中...</p>
        )}

        {(phase === 'result' || phase === 'saving' || phase === 'saved') && result && (
          <>
            <div className={styles.topicBox}>
              <span className={styles.topicLabel}>题目</span>
              <p className={styles.topicText}>{topic}</p>
            </div>

            <div className={styles.resultArea}>
              <div className={styles.scoreRow}>
                <span className={styles.score}>{result.score}</span>
                <span className={styles.scoreTotal}>/10</span>
                <span className={styles.pointsHint}>+{result.score * 0.5} 积分</span>
              </div>

              <p className={styles.feedback}>{result.feedback}</p>

              <div className={styles.exemplarBlock}>
                <button
                  className={styles.exemplarToggle}
                  onClick={() => setShowExemplar(v => !v)}
                >{showExemplar ? '收起范文' : '查看范文'}</button>
                {showExemplar && (
                  <p className={styles.exemplarText}>{result.exemplar}</p>
                )}
              </div>

              {phase === 'saved' ? (
                <p className={styles.savedHint}>已保存入库</p>
              ) : (
                <div className={styles.actionRow}>
                  <button
                    className={styles.editBtn}
                    onClick={() => setPhase('editing')}
                    disabled={phase === 'saving'}
                  >修改我的内容</button>
                  <button
                    className={examStyles.btn}
                    onClick={saveEntry}
                    disabled={phase === 'saving'}
                  >{phase === 'saving' ? '保存中...' : '保存入库'}</button>
                </div>
              )}
            </div>

            {error && <p className={examStyles.error}>{error}</p>}
          </>
        )}

        {(phase === 'result' || phase === 'saved') && (
          <button
            className={styles.editBtn}
            style={{ marginTop: 4 }}
            onClick={generateTopic}
          >换一题</button>
        )}
      </div>
    </div>
  )
}
