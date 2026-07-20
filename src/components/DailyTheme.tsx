import { useEffect, useMemo, useState } from 'react'
import { getTodayFigure, songStarsTheme, type ThemeChapter } from '../data/songTheme'
import styles from './DailyTheme.module.css'

type ThemeModal =
  | { type: 'chapter'; chapter: ThemeChapter; index: number; imageUrl?: string; imageLoading?: boolean; imageError?: string }
  | { type: 'complete' }
  | null

interface ThemeState {
  dateKey: string
  score: number
  unlocked: number
  firstBonusClaimed: boolean
  streak: number
  completed: boolean
}

interface PointsEventDetail {
  amount: number
  balance?: number
  activity?: 'practice' | 'upload' | 'theme-bonus'
}

interface AnswerEventDetail {
  correct: boolean
  activity?: 'practice' | 'upload'
}

const CHAPTER_STEP = 2
const TOTAL_CHAPTERS = 10

function getDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function storageKey(dateKey: string) {
  return 'daily-theme:' + dateKey
}

function createInitialState(dateKey: string): ThemeState {
  return { dateKey, score: 0, unlocked: 0, firstBonusClaimed: false, streak: 0, completed: false }
}

function loadThemeState(dateKey: string): ThemeState {
  try {
    const raw = localStorage.getItem(storageKey(dateKey))
    if (!raw) return createInitialState(dateKey)
    const parsed = JSON.parse(raw) as Partial<ThemeState>
    if (parsed.dateKey !== dateKey) return createInitialState(dateKey)
    return {
      dateKey,
      score: Number(parsed.score) || 0,
      unlocked: Math.min(TOTAL_CHAPTERS, Number(parsed.unlocked) || 0),
      firstBonusClaimed: Boolean(parsed.firstBonusClaimed),
      streak: Number(parsed.streak) || 0,
      completed: Boolean(parsed.completed),
    }
  } catch {
    return createInitialState(dateKey)
  }
}

function saveThemeState(state: ThemeState) {
  localStorage.setItem(storageKey(state.dateKey), JSON.stringify(state))
}

function emitPoints(amount: number, activity: PointsEventDetail['activity'] = 'practice') {
  window.dispatchEvent(new CustomEvent('points-earned', {
    detail: { amount, balance: 0, activity },
  }))
}

async function fetchChapterImage(figureName: string, chapter: ThemeChapter) {
  const res = await fetch('/api/theme-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      figure: figureName,
      chapter: chapter.title,
      fact: chapter.fact,
      importance: chapter.importance,
      detail: chapter.detail,
      visual: chapter.visual,
    }),
  })
  if (!res.ok) throw new Error('image generation failed')
  const data = await res.json()
  if (!data.url) throw new Error('missing image url')
  return data.url as string
}

async function awardThemeBonus(amount: number, reason: string) {
  if (import.meta.env.DEV) {
    emitPoints(amount, 'theme-bonus')
    return
  }

  try {
    const res = await fetch('/api/points/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, reason }),
    })
    if (!res.ok) return
    const data = await res.json()
    window.dispatchEvent(new CustomEvent('points-earned', {
      detail: { amount, balance: data.balance, activity: 'theme-bonus' },
    }))
  } catch {
    // Bonus failure should not block answering questions.
  }
}

export default function DailyTheme() {
  const dateKey = useMemo(() => getDateKey(), [])
  const figure = useMemo(() => getTodayFigure(), [])
  const [state, setState] = useState<ThemeState>(() => loadThemeState(dateKey))
  const [modal, setModal] = useState<ThemeModal>(null)
  const [bonusText, setBonusText] = useState('')

  useEffect(() => { saveThemeState(state) }, [state])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handlePoints = (event: Event) => {
      const detail = (event as CustomEvent<PointsEventDetail>).detail
      if (!detail || detail.amount <= 0) return

      setState(prev => {
        const nextScore = prev.score + detail.amount
        const nextUnlocked = Math.min(TOTAL_CHAPTERS, Math.floor(nextScore / CHAPTER_STEP))
        const nextCompleted = prev.completed || nextUnlocked >= TOTAL_CHAPTERS

        if (nextUnlocked > prev.unlocked) {
          const chapter = figure.chapters[nextUnlocked - 1]
          if (chapter) {
            setModal({ type: 'chapter', chapter, index: nextUnlocked, imageLoading: true })
            fetchChapterImage(figure.name, chapter)
              .then(imageUrl => {
                setModal(current => current?.type === 'chapter' && current.index === nextUnlocked
                  ? { ...current, imageUrl, imageLoading: false }
                  : current)
              })
              .catch(() => {
                setModal(current => current?.type === 'chapter' && current.index === nextUnlocked
                  ? { ...current, imageLoading: false, imageError: '图片生成失败，先显示文字节点。' }
                  : current)
              })
          }
        }
        if (!prev.completed && nextCompleted) {
          setTimeout(() => setModal({ type: 'complete' }), 450)
        }

        return { ...prev, score: nextScore, unlocked: nextUnlocked, completed: nextCompleted }
      })
    }

    const handleAnswer = (event: Event) => {
      const detail = (event as CustomEvent<AnswerEventDetail>).detail
      if (!detail || detail.activity === 'upload') return

      setState(prev => {
        if (!detail.correct) return { ...prev, streak: 0 }

        const nextStreak = prev.streak + 1
        const shouldAwardFirst = !prev.firstBonusClaimed
        const shouldAwardStreak = nextStreak > 0 && nextStreak % 3 === 0

        if (shouldAwardFirst) {
          setBonusText('今日初练 +2')
          setTimeout(() => setBonusText(''), 1800)
          awardThemeBonus(2, '今日首次练习奖励')
        }
        if (shouldAwardStreak) {
          setBonusText('三连对 +1')
          setTimeout(() => setBonusText(''), 1800)
          awardThemeBonus(1, '连续答对三题奖励')
        }

        return { ...prev, streak: nextStreak, firstBonusClaimed: prev.firstBonusClaimed || shouldAwardFirst }
      })
    }

    window.addEventListener('points-earned', handlePoints)
    window.addEventListener('answer-result', handleAnswer)
    return () => {
      window.removeEventListener('points-earned', handlePoints)
      window.removeEventListener('answer-result', handleAnswer)
    }
  }, [figure])

  const resetToday = () => {
    const fresh = createInitialState(dateKey)
    localStorage.removeItem(storageKey(dateKey))
    setModal(null)
    setBonusText('')
    setState(fresh)
  }

  const simulateCorrect = () => {
    window.dispatchEvent(new CustomEvent('answer-result', { detail: { correct: true, activity: 'practice' } }))
    emitPoints(1)
  }

  const simulateChapter = () => {
    emitPoints(CHAPTER_STEP)
  }

  const currentChapter = state.unlocked > 0 ? figure.chapters[state.unlocked - 1] : null
  const chapterParagraphs = modal?.type === 'chapter'
    ? (modal.chapter.detail ? modal.chapter.detail.split('\\n') : [modal.chapter.fact, modal.chapter.importance]).filter(Boolean)
    : []
  const dots = Array.from({ length: TOTAL_CHAPTERS }, (_, index) => index < state.unlocked)

  return (
    <section className={styles.theme} aria-label={songStarsTheme.title}>
      <div className={styles.backdrop} />
      <div className={styles.headerRow}>
        <div>
          <p className={styles.kicker}>{songStarsTheme.title}</p>
          <h1 className={styles.title}>{figure.name}人生十章</h1>
          <p className={styles.subtitle}>{figure.era} · {figure.subtitle}</p>
        </div>
        <span className={styles.count}>{state.unlocked} / {TOTAL_CHAPTERS}</span>
      </div>
      <div className={styles.chapterLine}>
        <span className={styles.chapterLabel}>{currentChapter ? currentChapter.title : '卷首'}</span>
        <div className={styles.dots} aria-hidden="true">
          {dots.map((done, index) => <span key={index} className={done ? styles.dotDone : styles.dot} />)}
        </div>
      </div>
      {import.meta.env.DEV && (
        <div className={styles.devTools}>
          <button type="button" onClick={simulateCorrect}>模拟答对</button>
          <button type="button" onClick={simulateChapter}>解锁一章</button>
          <button type="button" onClick={resetToday}>重置今日</button>
        </div>
      )}
      {bonusText && <div className={styles.bonus}>{bonusText}</div>}

      {modal && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className={modal.type === 'chapter' ? styles.storyModal : styles.completeModal}>
            <button className={styles.closeBtn} type="button" aria-label="关闭" onClick={() => setModal(null)}>×</button>
            {modal.type === 'chapter' ? (
              <>
                <div className={styles.storyImage}>
                  {modal.imageUrl ? (
                    <img src={modal.imageUrl} alt={`${figure.name} · ${modal.chapter.title}`} />
                  ) : (
                    <div className={styles.imagePlaceholder}>
                      <span>{modal.imageLoading ? '正在生成宋代风格插图，通常需要 10-20 秒' : figure.name}</span>
                      <strong>{modal.chapter.title}</strong>
                      {modal.imageError && <small>{modal.imageError}</small>}
                    </div>
                  )}
                </div>
                <div className={styles.storyText}>
                  <p className={styles.modalKicker}>第{modal.index}章</p>
                  <h2 className={styles.modalTitle}>{modal.chapter.title}</h2>
                  {chapterParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              </>
            ) : (
              <div className={styles.completeTextWrap}>
                <p className={styles.modalKicker}>今日成卷</p>
                <h2 className={styles.modalTitle}>{figure.name}人生十章已完成</h2>
                <p className={styles.completeText}>你今日解锁了十个真实节点，获得「{songStarsTheme.title} · {figure.name}图集」。</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}