import { useState, useEffect, useCallback } from 'react'
import styles from './DailyExplore.module.css'

// ——— 类型 ———
interface Clue {
  id: string
  name: string
  x: number
  y: number
  hint: string
  childSceneId: string | null
}

interface Scene {
  id: string
  imageUrl: string
  narration: string
  clues: Clue[]
}

interface ExploreDay {
  figure: string
  dateContext: string
  nextThreshold: number
  explorationCount: number
  scenes: Record<string, Scene>
}

interface PreviewData {
  figure: string
  dateContext: string
  imagePrompt: string
}

type Phase =
  | 'loading'
  | 'no-theme'
  | 'generating-preview'
  | 'preview'
  | 'confirming'
  | 'exploring'

// ——— 主组件 ———
export default function DailyExplore() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [todayData, setTodayData] = useState<ExploreDay | null>(null)
  // 历史场景路径，用于面包屑
  const [sceneStack, setSceneStack] = useState<string[]>(['root'])
  const [exploringClue, setExploringClue] = useState<string | null>(null)
  const [points, setPoints] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [confirmingReset, setConfirmingReset] = useState<boolean>(false)
  const [imgError, setImgError] = useState<boolean>(false)

  const currentSceneId = sceneStack[sceneStack.length - 1]

  const fetchPoints = useCallback(async () => {
    try {
      const r = await fetch('/api/points')
      const data = await r.json()
      setPoints(typeof data.balance === 'number' ? data.balance : 0)
    } catch {}
  }, [])

  // 初始化
  useEffect(() => {
    fetch('/api/explore/today')
      .then(r => r.json())
      .then(data => {
        if (data) {
          setTodayData(data)
          setSceneStack(['root'])
          setPhase('exploring')
          fetchPoints()
        } else {
          setPhase('no-theme')
        }
      })
      .catch(() => setPhase('no-theme'))
  }, [fetchPoints])

  // ——— 生成预览 ———
  async function fetchPreview() {
    setErrorMsg('')
    setPhase('generating-preview')
    try {
      const r = await fetch('/api/explore/preview', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || '生成失败')
      setPreview(data)
      setPhase('preview')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '生成失败'
      setErrorMsg(msg)
      setPhase('no-theme')
    }
  }

  // ——— 确认锁定今日人物 ———
  async function handleConfirm() {
    if (!preview) return
    setErrorMsg('')
    setPhase('confirming')
    try {
      const r = await fetch('/api/explore/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preview),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || '确认失败')
      setTodayData(data)
      setSceneStack(['root'])
      setPhase('exploring')
      fetchPoints()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '确认失败'
      setErrorMsg(msg)
      setPhase('preview')
    }
  }

  // ——— 点击线索 ———
  async function handleClueClick(clue: Clue) {
    if (!todayData || exploringClue) return

    // 已探索过：切换到子场景
    if (clue.childSceneId && todayData.scenes[clue.childSceneId]) {
      setSceneStack(prev => [...prev, clue.childSceneId!])
      setImgError(false)
      return
    }

    // 积分不足
    if (points < todayData.nextThreshold) return

    setExploringClue(clue.id)
    setErrorMsg('')
    try {
      const r = await fetch('/api/explore/clue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clueId: clue.id, sceneId: currentSceneId }),
      })
      const data = await r.json()
      if (!r.ok) {
        if (data.error === 'insufficient_points') {
          await fetchPoints()
          return
        }
        throw new Error(data.error || '探索失败')
      }
      // 更新本地数据
      setTodayData(prev => {
        if (!prev) return prev
        const updated: ExploreDay = JSON.parse(JSON.stringify(prev))
        const parentScene = updated.scenes[currentSceneId]
        if (parentScene) {
          const c = parentScene.clues.find(x => x.id === clue.id)
          if (c) c.childSceneId = data.scene.id
        }
        updated.scenes[data.scene.id] = data.scene
        updated.nextThreshold = data.nextThreshold
        updated.explorationCount = (updated.explorationCount || 0) + 1
        return updated
      })
      setSceneStack(prev => [...prev, data.scene.id])
      setImgError(false)
      await fetchPoints()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '探索失败'
      setErrorMsg(msg)
    } finally {
      setExploringClue(null)
    }
  }

  // ——— 面包屑导航 ———
  function goToSceneIndex(idx: number) {
    setSceneStack(prev => prev.slice(0, idx + 1))
    setImgError(false)
  }

  // ——————————————————————————————
  // 渲染
  // ——————————————————————————————

  if (phase === 'loading') {
    return (
      <div className={styles.wrap}>
        <div className={styles.backdrop} />
        <p className={styles.kicker}>TODAY'S STORY</p>
        <div className={styles.loadingMsg}>
          <span className={styles.spinner} />
          加载中…
        </div>
      </div>
    )
  }

  if (phase === 'no-theme' || phase === 'generating-preview') {
    const isGenerating = phase === 'generating-preview'
    return (
      <div className={styles.wrap}>
        <div className={styles.backdrop} />
        <p className={styles.kicker}>TODAY'S STORY</p>
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>今日探索</h2>
          <p className={styles.emptyHint}>
            {isGenerating ? '' : '每天解锁一位历史人物，探索他的故事场景'}
          </p>
          {errorMsg && <p style={{ color: 'rgba(255,120,100,0.9)', fontSize: '0.83rem', margin: 0 }}>{errorMsg}</p>}
          <button
            className={styles.startBtn}
            onClick={fetchPreview}
            disabled={isGenerating}
          >
            {isGenerating
              ? <><span className={styles.spinner} style={{ width: 14, height: 14, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />AI 推荐人物中…</>
              : '生成今日故事'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'preview' && preview) {
    return (
      <div className={styles.wrap}>
        <div className={styles.backdrop} />
        <p className={styles.kicker}>选择人物 — 确认后进入探索，随时可更换</p>
        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <h2 className={styles.previewFigure}>{preview.figure}</h2>
          </div>
          <p className={styles.previewContext}>{preview.dateContext}</p>
          {errorMsg && <p style={{ color: 'rgba(255,120,100,0.9)', fontSize: '0.83rem', margin: 0 }}>{errorMsg}</p>}
          <div className={styles.previewActions}>
            <button className={styles.refreshBtn} onClick={fetchPreview}>
              换一个
            </button>
            <button className={styles.confirmBtn} onClick={handleConfirm}>
              开始探索 →
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'confirming') {
    return (
      <div className={styles.wrap}>
        <div className={styles.backdrop} />
        <p className={styles.kicker}>TODAY'S STORY</p>
        <div className={styles.loadingMsg}>
          <span className={styles.spinner} />
          AI 正在生成场景图，约需 30–45 秒…
        </div>
      </div>
    )
  }

  // ——— 探索阶段 ———
  if (!todayData) return null
  const currentScene = todayData.scenes[currentSceneId]
  if (!currentScene) return null

  const nextThreshold = todayData.nextThreshold

  function handleResetClick() {
    setConfirmingReset(true)
  }

  function handleResetConfirm() {
    setTodayData(null)
    setSceneStack(['root'])
    setErrorMsg('')
    setConfirmingReset(false)
    setPhase('no-theme')
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.backdrop} />

      {/* 顶部：人物标题 + 积分 + 更换按钮 */}
      <div className={styles.sceneHeader}>
        <div>
          <p className={styles.kicker}>STORY EXPLORE</p>
          <p className={styles.sceneFigure}>{todayData.figure} · {todayData.dateContext}</p>
        </div>
        <div className={styles.sceneHeaderRight}>
          <span className={styles.pointsBadge}>
            {points.toFixed(1)} 分 · 下次需 {nextThreshold}
          </span>
          {!confirmingReset ? (
            <button className={styles.resetBtn} onClick={handleResetClick}>更换主题</button>
          ) : (
            <div className={styles.resetConfirm}>
              <span className={styles.resetConfirmText}>确定换掉？</span>
              <button className={styles.resetCancelBtn} onClick={() => setConfirmingReset(false)}>取消</button>
              <button className={styles.resetOkBtn} onClick={handleResetConfirm}>换掉</button>
            </div>
          )}
        </div>
      </div>

      {/* 面包屑 */}
      {sceneStack.length > 1 && (
        <div className={styles.breadcrumb}>
          {sceneStack.map((id, idx) => {
            const isLast = idx === sceneStack.length - 1
            const label = idx === 0 ? '主场景' : id.split('-')[0]
            return isLast ? (
              <span key={id} className={styles.breadcrumbCurrent}>{label}</span>
            ) : (
              <>
                <button
                  key={id}
                  className={styles.breadcrumbItem}
                  onClick={() => goToSceneIndex(idx)}
                >
                  {label}
                </button>
                <span key={`sep-${idx}`} className={styles.breadcrumbSep}>›</span>
              </>
            )
          })}
        </div>
      )}

      {/* 图片 + 线索点 */}
      <div className={styles.imageContainer}>
        {imgError ? (
          <div className={styles.imgPlaceholder}>
            <span className={styles.imgPlaceholderIcon}>🖼️</span>
            <strong className={styles.imgPlaceholderTitle}>{todayData.figure}</strong>
            <span className={styles.imgPlaceholderHint}>场景图加载失败，线索仍可探索</span>
          </div>
        ) : (
          <img
            src={currentScene.imageUrl}
            alt={`${todayData.figure} - 探索场景`}
            className={styles.sceneImage}
            onError={() => setImgError(true)}
          />
        )}
        {currentScene.clues.map(clue => {
          const isExplored = !!clue.childSceneId
          const isLoading = exploringClue === clue.id
          const canExplore = !isExplored && !isLoading && points >= nextThreshold

          return (
            <button
              key={clue.id}
              className={styles.clueBtn}
              style={{ left: `${clue.x}%`, top: `${clue.y}%` }}
              onClick={() => handleClueClick(clue)}
              title={clue.hint}
              disabled={isLoading || (!isExplored && !canExplore)}
            >
              {isLoading ? (
                <span className={styles.clueLoading} />
              ) : isExplored ? (
                <>
                  <span className={styles.clueExplored} title={`重看：${clue.name}`} />
                  <span className={styles.clueLabel}>{clue.name} ✦</span>
                </>
              ) : canExplore ? (
                <>
                  <span className={styles.clueHot} />
                  <span className={styles.clueLabel}>{clue.name}</span>
                </>
              ) : (
                <>
                  <span className={styles.clueLocked}>🔒</span>
                  <span className={styles.clueLockLabel}>差{Math.ceil(nextThreshold - points)}分</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* 旁白 */}
      <p className={styles.narration}>{currentScene.narration}</p>

      {/* 积分不足提示 */}
      {points < nextThreshold && (
        <p className={styles.pointsHint}>
          🔒 还差 <strong>{Math.ceil(nextThreshold - points)} 分</strong>才能探索线索——答题来攒积分吧
        </p>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <p style={{ color: 'rgba(255,120,100,0.9)', fontSize: '0.83rem', margin: '8px 0 0' }}>
          {errorMsg}
        </p>
      )}
    </div>
  )
}
