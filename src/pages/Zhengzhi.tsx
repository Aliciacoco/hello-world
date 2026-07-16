import { useState, useCallback, useEffect, useRef } from 'react'
import styles from './Practice.module.css'
import idiomStyles from './Idiom.module.css'
import zhStyles from './Zhengzhi.module.css'

type Mode = 'practice' | 'upload'
type Phase = 'front' | 'back'
type UploadPhase = 'idle' | 'extracting' | 'done'

interface ZhengzhiCard {
  id: string
  front: string
  back: string
}

export default function Zhengzhi() {
  const [mode, setMode] = useState<Mode>('practice')

  // 练习状态
  const [card, setCard] = useState<ZhengzhiCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  const [phase, setPhase] = useState<Phase>('front')
  const [error, setError] = useState('')

  // 上传状态
  const [uploadText, setUploadText] = useState('')
  const [uploadImage, setUploadImage] = useState('')
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchCard = useCallback(async (excludeId?: string) => {
    setLoading(true)
    setError('')
    setPhase('front')
    setEmpty(false)
    try {
      const url = excludeId
        ? `/api/bank/zhengzhi/random?exclude=${encodeURIComponent(excludeId)}`
        : '/api/bank/zhengzhi/random'
      const res = await fetch(url)
      if (res.status === 404) { setEmpty(true); return }
      if (!res.ok) throw new Error()
      const c = await res.json()
      setCard(c)
    } catch {
      setError('获取卡片失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCard() }, [fetchCard])

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

  const handleUpload = async () => {
    if (!uploadText.trim() && !uploadImage) { setUploadError('请粘贴文字或上传截图'); return }
    setUploadError('')
    setUploadPhase('extracting')
    try {
      const res = await fetch('/api/bank/zhengzhi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: uploadText.trim(), image: uploadImage }),
      })
      if (!res.ok) throw new Error()
      const raw = await res.json()
      if (raw._pts != null && raw._balance != null) {
        window.dispatchEvent(new CustomEvent('points-earned', {
          detail: { amount: raw._pts, balance: raw._balance },
        }))
      }
      setUploadedCount(raw.items?.length ?? 1)
      setUploadPhase('done')
      setUploadText('')
      setUploadImage('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      setUploadError('提取失败，请重试')
      setUploadPhase('idle')
    }
  }

  const goToPractice = () => {
    setUploadPhase('idle')
    setUploadedCount(0)
    setMode('practice')
    fetchCard()
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={idiomStyles.header}>
          <span className={idiomStyles.cardLabel}>政治理论</span>
          <div className={idiomStyles.tabs}>
            <button className={`${idiomStyles.tab} ${mode === 'practice' ? idiomStyles.tabActive : ''}`}
              onClick={() => setMode('practice')}>练习</button>
            <button className={`${idiomStyles.tab} ${mode === 'upload' ? idiomStyles.tabActive : ''}`}
              onClick={() => setMode('upload')}>上传</button>
          </div>
        </div>

        {mode === 'practice' && (
          <>
            {loading ? (
              <p className={idiomStyles.loading}>加载中...</p>
            ) : empty ? (
              <>
                <p className={idiomStyles.hint}>卡片库为空，先上传几条政治理论知识点吧</p>
                <button className={styles.btn} onClick={() => setMode('upload')}>去上传</button>
              </>
            ) : card ? (
              <>
                <div
                  className={`${zhStyles.flashcard} ${phase === 'back' ? zhStyles.flipped : ''}`}
                  onClick={() => phase === 'front' && setPhase('back')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && phase === 'front' && setPhase('back')}
                >
                  <div className={zhStyles.cardInner}>
                    <div className={zhStyles.cardFront}>
                      <p className={zhStyles.frontText}>{card.front}</p>
                      <p className={zhStyles.tapHint}>点击翻牌</p>
                    </div>
                    <div className={zhStyles.cardBack}>
                      <p className={zhStyles.backText}>{card.back}</p>
                    </div>
                  </div>
                </div>

                {phase === 'back' && (
                  <div className={zhStyles.actionRow}>
                    <button className={zhStyles.knewBtn} onClick={() => fetchCard(card.id)}>
                      记住了 ✓
                    </button>
                    <button className={zhStyles.reviewBtn} onClick={() => fetchCard(card.id)}>
                      再看看
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {error && <p className={styles.error}>{error}</p>}
                <button className={styles.btn} onClick={() => fetchCard()}>重新获取</button>
              </>
            )}
          </>
        )}

        {mode === 'upload' && (
          <>
            {uploadPhase === 'done' ? (
              <>
                <p className={zhStyles.doneHint}>✓ 已录入 {uploadedCount} 张卡片</p>
                <button className={styles.btn} onClick={goToPractice}>去练习</button>
                <button className={zhStyles.continueBtn} onClick={() => { setUploadPhase('idle'); setUploadedCount(0) }}>继续上传</button>
              </>
            ) : (
              <>
                <p className={idiomStyles.hint}>粘贴政治理论内容，AI 自动拆成卡片</p>
                <textarea
                  className={styles.textarea}
                  value={uploadText}
                  onChange={e => { setUploadText(e.target.value); setUploadError('') }}
                  placeholder="粘贴知识点文字（可多条）..."
                  rows={5}
                />
                <div className={idiomStyles.uploadRow}>
                  <button className={idiomStyles.uploadBtn} onClick={() => fileInputRef.current?.click()}>上传截图</button>
                  {uploadImage && <span className={idiomStyles.imageHint}>图片已选 ✓</span>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                {uploadError && <p className={styles.error}>{uploadError}</p>}
                <button className={styles.btn} onClick={handleUpload} disabled={uploadPhase === 'extracting'}>
                  {uploadPhase === 'extracting' ? 'AI 提取中...' : '提取并保存'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
