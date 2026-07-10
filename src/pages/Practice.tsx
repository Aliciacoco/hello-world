import { useState, useCallback } from 'react'
import { generateQuestion, calculateAnswer, getExplanation, type Question } from '../utils/combinatorics'
import { saveWrongAnswer } from '../utils/storage'
import styles from './Practice.module.css'

type Phase = 'question' | 'wrong-reason' | 'explanation'

export default function Practice() {
  const [question, setQuestion] = useState<Question>(() => generateQuestion())
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('question')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const nextQuestion = useCallback(() => {
    setQuestion(generateQuestion())
    setInput('')
    setReason('')
    setError('')
    setPhase('question')
  }, [])

  const handleSubmitAnswer = () => {
    const userAnswer = parseInt(input.trim(), 10)
    if (isNaN(userAnswer)) {
      setError('请输入数字')
      return
    }
    const correct = calculateAnswer(question)
    if (userAnswer === correct) {
      nextQuestion()
    } else {
      setError('')
      setPhase('wrong-reason')
    }
  }

  const handleSubmitReason = () => {
    if (!reason.trim()) {
      setError('请填写原因')
      return
    }
    saveWrongAnswer({
      question,
      userAnswer: parseInt(input.trim(), 10),
      correctAnswer: calculateAnswer(question),
      explanation: getExplanation(question),
      reason: reason.trim(),
    })
    setError('')
    setPhase('explanation')
  }

  const correct = calculateAnswer(question)
  const explanation = getExplanation(question)

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>排列组合练习</h1>

      <div className={styles.card}>
        <div className={styles.questionText}>
          {question.type === 'A' ? 'A' : 'C'}
          <sub>{question.n}</sub>
          <sup>{question.r}</sup>
          {' = ?'}
        </div>

        {phase === 'question' && (
          <div className={styles.inputGroup}>
            <input
              className={styles.input}
              type="number"
              value={input}
              onChange={e => { setInput(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
              placeholder="输入答案"
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} onClick={handleSubmitAnswer}>确认</button>
          </div>
        )}

        {phase === 'wrong-reason' && (
          <div className={styles.inputGroup}>
            <p className={styles.wrongHint}>答案不对，你觉得哪里出错了？</p>
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

        {phase === 'explanation' && (
          <div className={styles.explanationGroup}>
            <p className={styles.correctAnswer}>正确答案：{correct}</p>
            <p className={styles.explanation}>{explanation}</p>
            <button className={styles.btn} onClick={nextQuestion}>我明白了</button>
          </div>
        )}
      </div>
    </div>
  )
}
