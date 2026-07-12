import { useState, useRef, useCallback, useEffect } from 'react'
import { earnPoints } from '../utils/points'
import styles from './ExamCard.module.css'

type Mode = 'practice' | 'upload'
type Phase = 'question' | 'result'

interface BankQuestion {
  id: string
  stem: string
  options: string
  answer: string
  explanation: string
}

interface Props {
  subject: string
  bankType: string
  pointsPerCorrect: number
}

export default function ExamCard({ subject, bankType, pointsPerCorrect }: Props) {
  const [mode, setMode] = useState<Mode>('practice')

  const [question, setQuestion] = useState<BankQuestion | null>(null)
  const [loadingQ, setLoadingQ] = useState(true)
  const [userAnswer, setUserAnswer] = useState('')
  const [phase, setPhase] = useState<Phase>('question')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  const [uploadText, setUploadText] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadDone, setUploadDone] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchQuestion = useCallback(async () => {
    setLoadingQ(true)
    setError('')
    setUserAnswer('')
    setIsCorrect(null)
    setPhase('question')
    try {
      const res = await fetch(`/api/bank/${bankType}/random`)
      if (!res.ok) throw new Error()
      setQuestion(await res.json())
    } catch {
      setError('题库暂无题目，请先上传')
    } finally {
      setLoadingQ(false)
    }
  }, [bankType])

  useEffect(() => { fetchQuestion() }, [fetchQuestion])

  const handleSubmitAnswer = () => {
    if (!userAnswer.trim()) { setError('请输入答案'); return }
    if (!question) return
    setError('')
    const correct = userAnswer.trim().toUpperCase() === question.answer.trim().toUpperCase()
    setIsCorrect(correct)
    if (!correct) {
      fetch(`/api/bank/${bankType}/${question.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAnswer: userAnswer.trim(), date: Date.now() }),
      }).catch(() => {})
    } else {
      earnPoints(pointsPerCorrect, `${subject}答对`)
    }
    setPhase('result')
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImagePreview(result)
      setImageBase64(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!uploadText.trim() && !imageBase64) { setUploadError('请粘贴题目或上传截图'); return }
    setUploadError('')
    setUploading(true)
    try {
      const res = await fetch(`/api/bank/${bankType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: uploadText.trim(), image: imageBase64 }),
      })
      if (!res.ok) throw new Error()
      setUploadDone(true)
      setUploadText('')
      setImageBase64('')
      setImagePreview('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      setUploadError('上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.label}>{subject}</span>
          <div className={styles.modeTabs}>
            <button className={`${styles.modeTab} ${mode === 'practice' ? styles.modeTabActive : ''}`}
              onClick={() => { setMode('practice'); setUploadDone(false) }}>练题</button>
            <button className={`${styles.modeTab} ${mode === 'upload' ? styles.modeTabActive : ''}`}
              onClick={() => setMode('upload')}>上传</button>
          </div>
        </div>

        {mode === 'practice' && (
          <>
            {loadingQ && <p className={styles.loading}>加载题目...</p>}
            {!loadingQ && !question && (
              <>{error && <p className={styles.error}>{error}</p>}
                <button className={styles.btn} onClick={fetchQuestion}>重试</button></>
            )}
            {!loadingQ && question && phase === 'question' && (
              <>
                <p className={styles.stem}>{question.stem}</p>
                {question.options && <pre className={styles.options}>{question.options}</pre>}
                <div className={styles.inputGroup}>
                  <input className={styles.input} type="text" value={userAnswer}
                    onChange={e => { setUserAnswer(e.target.value); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
                    placeholder="输入答案（如 A）" autoFocus />
                  {error && <p className={styles.error}>{error}</p>}
                  <button className={styles.btn} onClick={handleSubmitAnswer}>确认</button>
                </div>
              </>
            )}
            {phase === 'result' && question && (
              <>
                <p className={styles.stem}>{question.stem}</p>
                {question.options && <pre className={styles.options}>{question.options}</pre>}
                <p className={isCorrect ? styles.correct : styles.wrong}>
                  {isCorrect ? '回答正确！' : `你答了 ${userAnswer}，正确答案是 ${question.answer}`}
                </p>
                <p className={styles.explanation}>{question.explanation}</p>
                <button className={styles.btn} onClick={fetchQuestion}>下一题</button>
              </>
            )}
          </>
        )}

        {mode === 'upload' && (
          <>
            {uploadDone ? (
              <>
                <p className={styles.uploadSuccess}>题目已上传成功！</p>
                <button className={styles.btn} onClick={() => setUploadDone(false)}>继续上传</button>
              </>
            ) : (
              <>
                <textarea className={styles.textarea} value={uploadText}
                  onChange={e => { setUploadText(e.target.value); setUploadError('') }}
                  placeholder="粘贴题目文字..." rows={4} />
                <div className={styles.uploadRow}>
                  <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>上传截图</button>
                  {imagePreview && <span className={styles.imageHint}>图片已选择 ✓</span>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*"
                  style={{ display: 'none' }} onChange={handleImageChange} />
                {imagePreview && <img src={imagePreview} alt="预览" className={styles.preview} />}
                {uploadError && <p className={styles.error}>{uploadError}</p>}
                <button className={styles.btn} onClick={handleUpload} disabled={uploading}>
                  {uploading ? 'AI 提取中...' : '提取并上传'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
