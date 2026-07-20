import { useState, useCallback } from 'react'
import { generateQuestion, calculateAnswer, type Question } from '../utils/combinatorics'
import { saveWrongAnswer } from '../utils/storage'
import { earnPoints } from '../utils/points'
import styles from './Practice.module.css'

type Phase = 'question' | 'wrong-reason' | 'loading' | 'explanation'

export default function Practice() {
  const [question, setQuestion] = useState<Question>(() => generateQuestion())
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('question')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [aiExplanation, setAiExplanation] = useState('')
  const [cardAnim, setCardAnim] = useState<'correct' | 'wrong' | ''>('')

  const nextQuestion = useCallback(() => {
    setQuestion(generateQuestion())
    setInput('')
    setReason('')
    setError('')
    setAiExplanation('')
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
      window.dispatchEvent(new CustomEvent('answer-result', { detail: { correct: true, activity: 'practice' } }))
      setCardAnim('correct')
      setTimeout(() => { setCardAnim(''); earnPoints(0.1, '排列组合答对'); nextQuestion() }, 360)
    } else {
      window.dispatchEvent(new CustomEvent('answer-result', { detail: { correct: false, activity: 'practice' } }))
      setCardAnim('wrong')
      setTimeout(() => setCardAnim(''), 400)
      setError('')
      setPhase('wrong-reason')
    }
  }

  const handleSubmitReason = async () => {
    if (!reason.trim()) {
      setError('请填写原因')
      return
    }
    setError('')
    setPhase('loading')
    const userAnswer = parseInt(input.trim(), 10)
    const correctAnswer = calculateAnswer(question)
    let explanation = ''
    try {
      const res = await fetch('/api/math/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: question.type, n: question.n, r: question.r, userAnswer, correctAnswer, reason: reason.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        explanation = data.explanation || ''
      }
    } catch {
      // 降级到本地解析
    }
    if (!explanation) {
      const { getExplanation } = await import('../utils/combinatorics')
      explanation = getExplanation(question)
    }
    setAiExplanation(explanation)
    await saveWrongAnswer({ question, userAnswer, correctAnswer, explanation, reason: reason.trim() })
    setPhase('explanation')
  }

  const correct = calculateAnswer(question)

  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${cardAnim === 'correct' ? styles.correctAnim : ''} ${cardAnim === 'wrong' ? styles.wrongAnim : ''}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>排列组合</span>
        </div>

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

        {phase === 'loading' && (
          <p className={styles.wrongHint}>AI 解析中...</p>
        )}

        {phase === 'explanation' && (
          <div className={styles.explanationGroup}>
            <p className={styles.correctAnswer}>正确答案：{correct}</p>
            <p className={styles.explanation}>{aiExplanation}</p>
            <button className={styles.btn} onClick={nextQuestion}>我明白了</button>
          </div>
        )}
      </div>
    </div>
  )
}
