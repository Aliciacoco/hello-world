import { useState, useRef } from 'react'
import { useRoundPractice } from '../hooks/useRoundPractice'
import styles from './Practice.module.css'
import idiomStyles from './Idiom.module.css'

type Mode = 'practice' | 'upload'
type Phase = 'question' | 'loading' | 'explanation'
type UploadPhase = 'idle' | 'extracting' | 'preview'

interface IdiomQuestion {
  id: string
  word: string
  answer?: string
  explanation: string
}

interface JudgeResult {
  correct: boolean
  feedback: string
  referenceAnswer?: string
  referenceExplanation?: string
  _pts?: number
  _balance?: number
}

export default function Idiom() {
  const [mode, setMode] = useState<Mode>('practice')

  const {
    question, loading: loadingQuestion, empty, error, completed,
    round, remaining, roundTotal, notice,
    recordResult, next, restart, reload,
  } = useRoundPractice<IdiomQuestion>('idiom')

  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('question')
  const [judgeError, setJudgeError] = useState('')
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null)

  const [uploadText, setUploadText] = useState('')
  const [uploadImage, setUploadImage] = useState('')
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [extracted, setExtracted] = useState<IdiomQuestion | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmitAnswer = async () => {
    if (!input.trim()) { setJudgeError('请输入你的理解'); return }
    if (!question) return
    setPhase('loading')
    setJudgeError('')
    try {
      const res = await fetch('/api/idiom/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.id, word: question.word, answer: input.trim() }),
      })
      if (!res.ok) throw new Error()
      const result: JudgeResult = await res.json()
      setJudgeResult(result)
      // 记录对错到轮次引擎（持久化，刷新不丢）
      recordResult(question.id, result.correct)
      window.dispatchEvent(new CustomEvent('answer-result', { detail: { correct: result.correct, activity: 'practice', bankType: 'idiom' } }))
      if (result.correct && result._pts != null && result._balance != null) {
        window.dispatchEvent(new CustomEvent('points-earned', {
          detail: { amount: result._pts, balance: result._balance, activity: 'practice', bankType: 'idiom' },
        }))
      }
      if (!result.correct) {
        fetch(`/api/bank/idiom/${question.id}/review`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAnswer: input.trim(), feedback: result.feedback, date: Date.now() }),
        }).catch(() => {})
      }
      setPhase('explanation')
    } catch {
      setJudgeError('判断失败，请重试')
      setPhase('question')
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setUploadImage(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const handleExtract = async () => {
    if (!uploadText.trim() && !uploadImage) { setUploadError('请粘贴文字或上传截图'); return }
    setUploadError('')
    setUploadPhase('extracting')
    try {
      const res = await fetch('/api/bank/idiom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: uploadText.trim(), image: uploadImage }),
      })
      if (!res.ok) throw new Error()
      const raw = await res.json()
      if (raw._pts != null && raw._balance != null) {
        window.dispatchEvent(new CustomEvent('points-earned', {
          detail: { amount: raw._pts, balance: raw._balance, activity: 'upload' },
        }))
      }
      const { _pts: _p, _balance: _b, ...extracted } = raw
      setExtracted(extracted as IdiomQuestion)
      setUploadPhase('preview')
    } catch {
      setUploadError('提取失败，请重试')
      setUploadPhase('idle')
    }
  }

  const handleConfirmUpload = () => {
    setUploadText('')
    setUploadImage('')
    setExtracted(null)
    setUploadPhase('idle')
    setUploadError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    reload()
    setMode('practice')
  }

  const showProgress = mode === 'practice' && !completed && !!question && roundTotal > 0

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={idiomStyles.header}>
          <span className={idiomStyles.cardLabel}>成语辨析</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {showProgress && (
              <span className={idiomStyles.roundBadge}>第{round}轮 {remaining}/{roundTotal}</span>
            )}
            {mode === 'practice' && phase === 'question' && !!question && !loadingQuestion && (
              <button className={styles.confirmBtn} onClick={handleSubmitAnswer}>✓</button>
            )}
            <div className={idiomStyles.tabs}>
              <button className={`${idiomStyles.tab} ${mode === 'practice' ? idiomStyles.tabActive : ''}`}
                onClick={() => setMode('practice')}>练题</button>
              <button className={`${idiomStyles.tab} ${mode === 'upload' ? idiomStyles.tabActive : ''}`}
                onClick={() => setMode('upload')}>上传</button>
            </div>
          </div>
        </div>

        {mode === 'practice' && (
          <>
            {loadingQuestion ? (
              <p className={idiomStyles.loading}>加载题目中...</p>
            ) : empty ? (
              <>
                <p className={idiomStyles.hint}>题库为空，先上传几道成语题吧</p>
                <button className={styles.btn} onClick={() => setMode('upload')}>去上传</button>
              </>
            ) : completed ? (
              <>
                <p className={idiomStyles.word}>🎉</p>
                <p className={idiomStyles.hint}>全部做对！共练了 {round} 轮</p>
                <button className={styles.btn} onClick={restart}>重新开始一轮</button>
              </>
            ) : error && !question ? (
              <>
                <p className={styles.error}>{error}</p>
                <button className={styles.btn} onClick={reload}>重新获取</button>
              </>
            ) : question ? (
              <>
                {notice && <p className={idiomStyles.roundNotice}>{notice}</p>}
                <div className={idiomStyles.word}>{question.word}</div>
                <p className={idiomStyles.hint}>写出这个成语的含义和用法</p>
                {phase === 'question' && (
                  <div className={styles.inputGroup}>
                    <textarea
                      className={styles.textarea}
                      value={input}
                      onChange={e => { setInput(e.target.value); setJudgeError('') }}
                      placeholder="写下你的理解..."
                      rows={3}
                    />
                    {judgeError && <p className={styles.error}>{judgeError}</p>}
                  </div>
                )}
                {phase === 'loading' && <p className={idiomStyles.loading}>AI 判断中...</p>}
                {phase === 'explanation' && judgeResult && (
                  <div className={styles.explanationGroup}>
                    {judgeResult.correct
                      ? <p className={styles.correctAnswer}>答对了！</p>
                      : <p className={styles.wrongHint}>有点偏差，看看这个：</p>
                    }
                    <div className={styles.referenceBox}>
                      <p className={styles.referenceLabel}>{'\u53c2\u8003\u7b54\u6848'}</p>
                      <p className={styles.referenceText}>{judgeResult.referenceAnswer || question.answer || question.explanation}</p>
                      {(judgeResult.referenceExplanation || question.explanation) && (
                        <p className={styles.explanation}>{judgeResult.referenceExplanation || question.explanation}</p>
                      )}
                    </div>
                    <p className={styles.explanation}>{judgeResult.feedback}</p>
                    <button className={styles.btn} onClick={() => { setInput(''); setJudgeResult(null); setPhase('question'); next() }}>{'\u4e0b\u4e00\u9898'}</button>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}

        {mode === 'upload' && (
          <>
            {uploadPhase !== 'preview' ? (
              <>
                <textarea
                  className={styles.textarea}
                  value={uploadText}
                  onChange={e => { setUploadText(e.target.value); setUploadError('') }}
                  placeholder="粘贴成语及解释..."
                  rows={4}
                />
                <div className={idiomStyles.uploadRow}>
                  <button className={idiomStyles.uploadBtn} onClick={() => fileInputRef.current?.click()}>上传截图</button>
                  {uploadImage && <span className={idiomStyles.imageHint}>图片已选 ✓</span>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                {uploadError && <p className={styles.error}>{uploadError}</p>}
                <button className={styles.btn} onClick={handleExtract} disabled={uploadPhase === 'extracting'}>
                  {uploadPhase === 'extracting' ? 'AI 提取中...' : '提取'}
                </button>
              </>
            ) : extracted ? (
              <>
                <p className={idiomStyles.hint}>确认提取结果：</p>
                <div className={idiomStyles.word}>{extracted.word}</div>
                <p className={styles.explanation}>{extracted.explanation}</p>
                <div className={idiomStyles.uploadRow}>
                  <button className={styles.btn} onClick={handleConfirmUpload}>确认保存</button>
                  <button className={idiomStyles.cancelBtn} onClick={() => setUploadPhase('idle')}>重新提取</button>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
