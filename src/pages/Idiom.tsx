import { useState, useCallback } from 'react'
import styles from './Practice.module.css'
import idiomStyles from './Idiom.module.css'

type Phase = 'question' | 'wrong-reason' | 'explanation' | 'loading'

interface IdiomQuestion {
  word: string
  prompt: string
}

interface JudgeResult {
  correct: boolean
  explanation: string
}

export default function Idiom() {
  const [question, setQuestion] = useState<IdiomQuestion | null>(null)
  const [loadingQuestion, setLoadingQuestion] = useState(false)
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('question')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null)

  const fetchQuestion = useCallback(async () => {
    setLoadingQuestion(true)
    setError('')
    try {
      const res = await fetch('/api/idiom/question')
      if (!res.ok) throw new Error('获取题目失败')
      const data = await res.json()
      setQuestion(data)
      setInput('')
      setReason('')
      setJudgeResult(null)
      setPhase('question')
    } catch {
      setError('获取题目失败，请重试')
    } finally {
      setLoadingQuestion(false)
    }
  }, [])

  const handleSubmitAnswer = async () => {
    if (!input.trim()) {
      setError('请输入你的理解')
      return
    }
    if (!question) return
    setPhase('loading')
    setError('')
    try {
      const res = await fetch('/api/idiom/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: question.word, answer: input.trim() }),
      })
      if (!res.ok) throw new Error('判断失败')
      const result: JudgeResult = await res.json()
      setJudgeResult(result)
      if (result.correct) {
        setPhase('explanation')
      } else {
        setPhase('wrong-reason')
      }
    } catch {
      setError('判断失败，请重试')
      setPhase('question')
    }
  }

  const handleSubmitReason = async () => {
    if (!reason.trim()) {
      setError('请填写原因')
      return
    }
    if (!question || !judgeResult) return
    try {
      await fetch('/api/wrong-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'idiom',
          word: question.word,
          userAnswer: input.trim(),
          explanation: judgeResult.explanation,
          reason: reason.trim(),
          date: Date.now(),
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      })
    } catch {
      // 保存失败不阻断流程
    }
    setError('')
    setPhase('explanation')
  }

  if (!question && !loadingQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p className={idiomStyles.intro}>每次出一道行测常考成语题，AI 判断你的理解是否正确。</p>
          <button className={styles.btn} onClick={fetchQuestion}>开始练习</button>
        </div>
      </div>
    )
  }

  if (loadingQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p className={idiomStyles.loading}>正在生成题目...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={idiomStyles.word}>{question!.word}</div>
        <p className={idiomStyles.prompt}>{question!.prompt}</p>

        {(phase === 'question') && (
          <div className={styles.inputGroup}>
            <textarea
              className={styles.textarea}
              value={input}
              onChange={e => { setInput(e.target.value); setError('') }}
              placeholder="写下你对这个成语的理解..."
              rows={4}
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} onClick={handleSubmitAnswer}>提交</button>
          </div>
        )}

        {phase === 'loading' && (
          <p className={idiomStyles.loading}>AI 判断中...</p>
        )}

        {phase === 'wrong-reason' && (
          <div className={styles.inputGroup}>
            <p className={styles.wrongHint}>理解有偏差，你觉得哪里出错了？</p>
            <textarea
              className={styles.textarea}
              value={reason}
              onChange={e => { setReason(e.target.value); setError('') }}
              placeholder="写下你的想法..."
              rows={3}
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} onClick={handleSubmitReason}>提交</button>
          </div>
        )}

        {phase === 'explanation' && judgeResult && (
          <div className={styles.explanationGroup}>
            {judgeResult.correct
              ? <p className={styles.correctAnswer}>理解正确！</p>
              : <p className={styles.wrongHint}>正确解析：</p>
            }
            <p className={styles.explanation}>{judgeResult.explanation}</p>
            <button className={styles.btn} onClick={fetchQuestion}>下一题</button>
          </div>
        )}
      </div>
    </div>
  )
}
