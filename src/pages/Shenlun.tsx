import { useState } from 'react'
import examStyles from './ExamCard.module.css'
import styles from './Shenlun.module.css'

type Phase = 'idle' | 'generating' | 'writing' | 'judging' | 'result' | 'saving' | 'saved'

interface JudgeResult {
  score: number
  feedback: string
  exemplar: string
}

const ARTICLE_MAX = 1500

export default function ShenlunCard() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [article, setArticle] = useState('')
  const [result, setResult] = useState<JudgeResult | null>(null)
  const [showExemplar, setShowExemplar] = useState(false)
  const [error, setError] = useState('')

  const generateTopic = async () => {
    setPhase('generating')
    setError('')
    setTitle('')
    setArticle('')
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

  const submitAnswer = async () => {
    if (!title.trim()) { setError('标题不能为空'); return }
    if (!article.trim()) { setError('正文不能为空'); return }
    setError('')
    setPhase('judging')
    try {
      const res = await fetch('/api/shenlun/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, title: title.trim(), article: article.trim() }),
      })
      if (!res.ok) throw new Error()
      const data: JudgeResult = await res.json()
      setResult(data)
      setPhase('result')
    } catch {
      setError('批改失败，请重试')
      setPhase('writing')
    }
  }

  const saveEntry = async () => {
    if (!result) return
    setPhase('saving')
    try {
      await fetch('/api/shenlun/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, title, article, ...result }),
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

        {phase === 'writing' && (
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
                  value={title}
                  onChange={e => { setTitle(e.target.value); setError('') }}
                  placeholder="写下文章标题..."
                />
              </div>

              <div className={styles.field}>
                <div className={styles.articleHeader}>
                  <span className={styles.fieldLabel}>正文</span>
                  <span className={`${styles.charCount} ${article.length > ARTICLE_MAX ? styles.charOver : ''}`}>
                    {article.length} / {ARTICLE_MAX}
                  </span>
                </div>
                <textarea
                  className={examStyles.textarea}
                  value={article}
                  onChange={e => { setArticle(e.target.value); setError('') }}
                  placeholder="在此写下你的申论作文（建议 800-1500 字）..."
                  rows={14}
                />
              </div>

              {error && <p className={examStyles.error}>{error}</p>}
              <button className={examStyles.btn} onClick={submitAnswer}>提交批改</button>
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
                <span className={styles.pointsHint}>+{Math.round(result.score * 0.5 * 10) / 10} 积分</span>
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
