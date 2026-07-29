import { useState, useCallback } from 'react'
import { saveWrongAnswer } from '../utils/storage'
import { earnPoints } from '../utils/points'
import styles from './Practice.module.css'

type Phase = 'question' | 'correct' | 'wrong-reason' | 'loading' | 'explanation'

function generateN(): number {
  return Math.floor(Math.random() * 19) + 2 // 2~20
}

function correctAnswer(n: number): number {
  return Math.floor(100 / n)
}

export default function FractionPractice() {
  const [n, setN] = useState<number>(() => generateN())
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('question')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [aiExplanation, setAiExplanation] = useState('')
  const [cardAnim, setCardAnim] = useState<'correct' | 'wrong' | ''>('')

  const correct = correctAnswer(n)

  const nextQuestion = useCallback(() => {
    setN(generateN())
    setInput('')
    setReason('')
    setError('')
    setAiExplanation('')
    setPhase('question')
  }, [])

  const handleSubmitAnswer = () => {
    const userAnswer = parseInt(input.trim(), 10)
    if (isNaN(userAnswer)) {
      setError('请输入整数')
      return
    }
    if (userAnswer === correct) {
      window.dispatchEvent(new CustomEvent('answer-result', { detail: { correct: true, activity: 'practice' } }))
      setCardAnim('correct')
      setTimeout(() => { setCardAnim(''); earnPoints(0.1, '分数速算答对'); setPhase('correct') }, 360)
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
    const explanation = `1/${n} = ${(100 / n).toFixed(4)}…%，取整数位得 ${correct}%`
    await saveWrongAnswer({
      question: { type: 'F' as never, n, r: 1 },
      userAnswer,
      correctAnswer: correct,
      explanation,
      reason: reason.trim(),
    })
    setAiExplanation(explanation)
    setPhase('explanation')
  }

  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${cardAnim === 'correct' ? styles.correctAnim : ''} ${cardAnim === 'wrong' ? styles.wrongAnim : ''}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>分数速算</span>
        </div>

        <div className={styles.questionText}>
          1/{n} = ?%
        </div>

        {phase === 'question' && (
          <div className={styles.inputGroup}>
            <input
              className={styles.input}
              type="number"
              value={input}
              onChange={e => { setInput(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
              placeholder="输入整数部分"
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} onClick={handleSubmitAnswer}>确认</button>
          </div>
        )}

        {phase === 'correct' && (
          <div className={styles.explanationGroup}>
            <p className={styles.correctAnswer}>回答正确！答案是 {correct}%</p>
            <button className={styles.btn} onClick={nextQuestion}>下一题</button>
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
          <p className={styles.wrongHint}>处理中...</p>
        )}

        {phase === 'explanation' && (
          <div className={styles.explanationGroup}>
            <p className={styles.correctAnswer}>正确答案：{correct}%</p>
            <p className={styles.explanation}>{aiExplanation}</p>
            <button className={styles.btn} onClick={nextQuestion}>我明白了</button>
          </div>
        )}
      </div>
    </div>
  )
}
