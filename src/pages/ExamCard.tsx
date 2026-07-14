import { useState, useRef, useCallback, useEffect } from 'react'
import { earnPoints } from '../utils/points'
import styles from './ExamCard.module.css'

type Mode = 'practice' | 'upload'
type Phase = 'question' | 'judging' | 'result'

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
  openEnded?: boolean
}

// 确保每个选项单独一行，兼容 AI 输出格式不一的情况（上传预览兜底用）
function formatOptions(options: string): string {
  return options
    .replace(/\s*([A-D][\.\、])/g, '\n$1')
    .trimStart()
}

// 把选项字符串解析为 [{letter, text}] 数组
function parseOptions(raw: string): { letter: string; text: string }[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const m = line.match(/^([A-D])[.、．]\s*(.*)/)
      return m ? { letter: m[1], text: m[2] } : null
    })
    .filter((x): x is { letter: string; text: string } => x !== null)
}

export default function ExamCard({ subject, bankType, pointsPerCorrect, openEnded = false }: Props) {
  const [mode, setMode] = useState<Mode>('practice')

  const [question, setQuestion] = useState<BankQuestion | null>(null)
  const [loadingQ, setLoadingQ] = useState(true)
  const [userAnswer, setUserAnswer] = useState('')
  const [phase, setPhase] = useState<Phase>('question')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [aiFeedback, setAiFeedback] = useState('')
  const [error, setError] = useState('')
  const [cardAnim, setCardAnim] = useState<'correct' | 'wrong' | ''>('')

  const [uploadText, setUploadText] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadedItem, setUploadedItem] = useState<BankQuestion | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchQuestion = useCallback(async () => {
    setLoadingQ(true)
    setError('')
    setUserAnswer('')
    setIsCorrect(null)
    setAiFeedback('')
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

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) { setError('请选择答案'); return }
    if (!question) return
    setError('')

    if (openEnded) {
      setPhase('judging')
      try {
        const res = await fetch(`/api/bank/${bankType}/judge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stem: question.stem,
            userAnswer: userAnswer.trim(),
            correctAnswer: question.answer,
            explanation: question.explanation,
          }),
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        setIsCorrect(data.correct)
        setAiFeedback(data.feedback)
        setCardAnim(data.correct ? 'correct' : 'wrong')
        setTimeout(() => setCardAnim(''), 400)
        setPhase('result')
      } catch {
        setError('判断失败，请重试')
        setPhase('question')
      }
      return
    }

    // 选择题：本地字符串对比
    const correct = userAnswer.trim().toUpperCase() === question.answer.trim().toUpperCase()
    setIsCorrect(correct)
    setCardAnim(correct ? 'correct' : 'wrong')
    setTimeout(() => setCardAnim(''), 400)
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
      const item = await res.json()
      setUploadedItem(item)
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

  // 当前题目的解析选项（每次渲染时计算，开销极小）
  const parsedOpts = question?.options ? parseOptions(question.options) : []

  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${cardAnim === 'correct' ? styles.correctAnim : ''} ${cardAnim === 'wrong' ? styles.wrongAnim : ''}`}>
        <div className={styles.header}>
          <span className={styles.label}>{subject}</span>
          <div className={styles.modeTabs}>
            <button className={`${styles.modeTab} ${mode === 'practice' ? styles.modeTabActive : ''}`}
              onClick={() => { setMode('practice'); setUploadedItem(null) }}>练题</button>
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

            {/* ── 答题阶段 ── */}
            {!loadingQ && question && phase === 'question' && (
              <>
                <p className={styles.stem}>{question.stem}</p>
                <div className={styles.inputGroup}>
                  {openEnded ? (
                    <textarea
                      className={styles.textarea}
                      value={userAnswer}
                      onChange={e => { setUserAnswer(e.target.value); setError('') }}
                      placeholder="写下你的理解..."
                      rows={3}
                      autoFocus
                    />
                  ) : parsedOpts.length > 0 ? (
                    /* 选择题：ABCD 点击按钮 */
                    <div className={styles.optionList}>
                      {parsedOpts.map(({ letter, text }) => (
                        <button
                          key={letter}
                          className={`${styles.optionBtn} ${userAnswer === letter ? styles.optionBtnSelected : ''}`}
                          onClick={() => { setUserAnswer(letter); setError('') }}
                        >
                          <span className={styles.optionLetter}>{letter}</span>
                          <span className={styles.optionText}>{text}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* 兜底：选项格式无法解析时降级为输入框 */
                    <>
                      {question.options && <pre className={styles.options}>{formatOptions(question.options)}</pre>}
                      <input className={styles.input} type="text" value={userAnswer}
                        onChange={e => { setUserAnswer(e.target.value); setError('') }}
                        onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
                        placeholder="输入答案（如 A）" autoFocus />
                    </>
                  )}
                  {error && <p className={styles.error}>{error}</p>}
                  <button
                    className={styles.btn}
                    onClick={handleSubmitAnswer}
                    disabled={!openEnded && !userAnswer}
                  >确认</button>
                </div>
              </>
            )}

            {phase === 'judging' && (
              <p className={styles.loading}>AI 判断中...</p>
            )}

            {/* ── 结果阶段 ── */}
            {phase === 'result' && question && (
              <>
                <p className={styles.stem}>{question.stem}</p>

                {!openEnded && parsedOpts.length > 0 ? (
                  /* 选择题结果：高亮正确/错误选项 */
                  <div className={styles.optionList}>
                    {parsedOpts.map(({ letter, text }) => {
                      const correctLetter = question.answer.trim().toUpperCase()
                      const isThisCorrect = letter === correctLetter
                      const isThisWrong = letter === userAnswer.toUpperCase() && !isCorrect
                      return (
                        <button
                          key={letter}
                          disabled
                          className={`${styles.optionBtn} ${
                            isThisCorrect ? styles.optionBtnCorrect
                            : isThisWrong ? styles.optionBtnWrong
                            : ''
                          }`}
                        >
                          <span className={styles.optionLetter}>{letter}</span>
                          <span className={styles.optionText}>{text}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : !openEnded && question.options ? (
                  <pre className={styles.options}>{formatOptions(question.options)}</pre>
                ) : null}

                <p className={isCorrect ? styles.correct : styles.wrong}>
                  {openEnded
                    ? aiFeedback
                    : isCorrect ? '回答正确！' : `你选了 ${userAnswer}，正确答案是 ${question.answer}`}
                </p>
                {openEnded && (
                  <div className={styles.referenceBox}>
                    <p className={styles.referenceLabel}>参考答案</p>
                    <p className={styles.referenceText}>{question.answer}</p>
                  </div>
                )}
                <p className={styles.explanation}>{question.explanation}</p>
                <button className={styles.btn} onClick={fetchQuestion}>下一题</button>
              </>
            )}
          </>
        )}

        {mode === 'upload' && (
          <>
            {uploadedItem ? (
              <>
                <p className={styles.uploadSuccess}>✓ 已录入</p>
                <p className={styles.stem}>{uploadedItem.stem}</p>
                {uploadedItem.options && (() => {
                  const opts = parseOptions(uploadedItem.options)
                  const correctLetter = uploadedItem.answer.trim().toUpperCase()
                  return opts.length > 0 ? (
                    <div className={styles.optionList}>
                      {opts.map(({ letter, text }) => (
                        <button
                          key={letter}
                          disabled
                          className={`${styles.optionBtn} ${letter === correctLetter ? styles.optionBtnCorrect : ''}`}
                        >
                          <span className={styles.optionLetter}>{letter}</span>
                          <span className={styles.optionText}>{text}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <pre className={styles.options}>{formatOptions(uploadedItem.options)}</pre>
                  )
                })()}
                <p className={styles.uploadAnswer}>答案：{uploadedItem.answer}</p>
                <p className={styles.explanation}>{uploadedItem.explanation}</p>
                <button className={styles.btn} onClick={() => setUploadedItem(null)}>继续上传</button>
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
