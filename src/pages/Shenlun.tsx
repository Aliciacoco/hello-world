import { useState, useEffect, useRef } from 'react'
import examStyles from './ExamCard.module.css'
import styles from './Shenlun.module.css'

type Phase = 'idle' | 'generating' | 'writing' | 'judging' | 'result' | 'saving' | 'saved'

interface JudgeResult {
  score: number
  feedback: string
  exemplar: string
}

interface Province {
  code: string
  name: string
}

interface Draft {
  topic: string
  title: string
  article: string
  province: string
  provinceName: string
  updatedAt: number
}

const ARTICLE_MAX = 1500
const PROVINCE_STORAGE_KEY = 'shenlun_province'
const DRAFT_STORAGE_KEY = 'shenlun_draft'

// —— 草稿本地缓存（离线兜底；服务端那份是主，两边按 updatedAt 择新）——
function loadLocalDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    return d && typeof d.topic === 'string' && d.topic.trim() ? d : null
  } catch {
    return null
  }
}

function saveLocalDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    /* 隐私模式等写本地失败，不影响服务端同步 */
  }
}

function pickNewer(a: Draft | null, b: Draft | null): Draft | null {
  if (!a) return b
  if (!b) return a
  return (Number(b.updatedAt) || 0) > (Number(a.updatedAt) || 0) ? b : a
}

export default function ShenlunCard() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [province, setProvince] = useState('national')
  const [provinceName, setProvinceName] = useState('全国')
  const [provinceList, setProvinceList] = useState<Province[]>([{ code: 'national', name: '全国' }])
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [article, setArticle] = useState('')
  const [result, setResult] = useState<JudgeResult | null>(null)
  const [showExemplar, setShowExemplar] = useState(false)
  const [restored, setRestored] = useState(false)
  const [error, setError] = useState('')

  // 草稿恢复出来的省份，避免省份清单请求把它覆盖掉
  const draftProvinceRef = useRef<string | null>(null)

  // 进入页面：恢复上次未完成的题目/草稿 + 拉省份清单
  useEffect(() => {
    let alive = true
    const local = loadLocalDraft()

    const applyDraft = (d: Draft) => {
      if (!alive) return
      setTopic(d.topic)
      setTitle(d.title || '')
      setArticle(d.article || '')
      setProvince(d.province || 'national')
      setProvinceName(d.provinceName || '全国')
      draftProvinceRef.current = d.province || 'national'
      setPhase('writing')
      setRestored(true)
    }

    fetch('/api/shenlun/draft')
      .then(r => r.json())
      .then((remote: Draft | null) => {
        const best = pickNewer(local, remote && remote.topic ? remote : null)
        if (best) applyDraft(best)
      })
      .catch(() => { if (local) applyDraft(local) })

    const savedProvince = localStorage.getItem(PROVINCE_STORAGE_KEY) || 'national'
    fetch('/api/shenlun/provinces')
      .then(r => r.json())
      .then((list: Province[]) => {
        if (!alive || !Array.isArray(list) || !list.length) return
        setProvinceList(list)
        const hit = list.find(p => p.code === (draftProvinceRef.current || savedProvince))
        if (hit) { setProvince(hit.code); setProvinceName(hit.name) }
      })
      .catch(() => {})

    return () => { alive = false }
  }, [])

  // 题目/草稿变化即持久化：本地立即写，服务端防抖 400ms
  useEffect(() => {
    if (!topic.trim()) return
    const draft: Draft = { topic, title, article, province, provinceName, updatedAt: Date.now() }
    saveLocalDraft(draft)
    const timer = setTimeout(() => {
      fetch('/api/shenlun/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      }).catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [topic, title, article, province, provinceName])

  const clearDraft = () => {
    saveLocalDraft(null)
    setRestored(false)
    fetch('/api/shenlun/draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: '' }),
    }).catch(() => {})
  }

  const changeProvince = (code: string) => {
    setProvince(code)
    localStorage.setItem(PROVINCE_STORAGE_KEY, code)
    const hit = provinceList.find(p => p.code === code)
    setProvinceName(hit ? hit.name : '全国')
  }

  const generateTopic = async () => {
    if (phase === 'generating') return
    const prevPhase = phase
    setPhase('generating')
    setError('')
    try {
      const res = await fetch('/api/shenlun/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ province }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      // 拿到新题后才清掉旧题与旧草稿；生成失败则原样保留
      setTopic(data.topic)
      setTitle('')
      setArticle('')
      setResult(null)
      setShowExemplar(false)
      setRestored(false)
      if (data.province) {
        setProvince(data.province)
        setProvinceName(data.provinceName || '全国')
      }
      setPhase('writing')
    } catch {
      setError('出题失败，请重试')
      setPhase(prevPhase)
    }
  }

  const submitAnswer = async () => {
    if (phase === 'judging') return
    if (!title.trim()) { setError('标题不能为空'); return }
    if (!article.trim()) { setError('正文不能为空'); return }
    setError('')
    setPhase('judging')
    try {
      const res = await fetch('/api/shenlun/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, title: title.trim(), article: article.trim(), province }),
      })
      if (!res.ok) throw new Error()
      const data: JudgeResult = await res.json()
      setResult(data)
      clearDraft() // 已提交批改，题目不再保留
      const pts = Math.round(data.score * 0.5 * 10) / 10
      window.dispatchEvent(new CustomEvent('points-earned', { detail: { amount: pts, activity: 'practice', bankType: 'shenlun' } }))
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
        body: JSON.stringify({ topic, title, article, ...result, province }),
      })
      setPhase('saved')
    } catch {
      setError('保存失败，请重试')
      setPhase('result')
    }
  }

  const topicLabel = province === 'national' ? '题目' : `题目 · ${provinceName}`

  return (
    <div className={examStyles.container}>
      <div className={examStyles.card}>
        <div className={examStyles.header}>
          <span className={examStyles.label}>申论</span>
          {phase === 'idle' ? (
            <select
              className={styles.provinceSelect}
              value={province}
              onChange={e => changeProvince(e.target.value)}
              title="选择命题省份，题目的话题与案例将取自该省"
            >
              {provinceList.map(p => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          ) : province !== 'national' ? (
            <span className={styles.provinceBadge}>{provinceName}</span>
          ) : null}
        </div>

        {phase === 'idle' && (
          <>
            {error && <p className={examStyles.error}>{error}</p>}
            <button className={examStyles.btn} onClick={generateTopic}>出题</button>
          </>
        )}

        {phase === 'generating' && (
          <p className={styles.loading}>AI 出题中{province !== 'national' ? `（${provinceName}）` : ''}...</p>
        )}

        {phase === 'writing' && (
          <>
            {restored && (
              <p className={styles.draftHint}>已恢复上次未完成的题目，接着写或点「换一题」</p>
            )}

            <div className={styles.topicBox}>
              <span className={styles.topicLabel}>{topicLabel}</span>
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
              <span className={styles.topicLabel}>{topicLabel}</span>
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
