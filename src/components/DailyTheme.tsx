import { useEffect, useMemo, useState } from 'react'
import { getTodayFigure, songStarsTheme, type ThemeChapter } from '../data/songTheme'
import styles from './DailyTheme.module.css'

type ThemeModal =
  | { type: 'chapter'; chapter: ThemeChapter; index: number; imageUrl?: string; imageLoading?: boolean; imageError?: string }
  | { type: 'complete' }
  | { type: 'gallery' }
  | null

interface ThemeState {
  dateKey: string
  score: number
  unlocked: number
  completed: boolean
  images: Record<string, string>
}

interface PointsEventDetail {
  amount: number
  balance?: number
  activity?: 'practice' | 'upload' | 'theme-bonus'
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
  return { dateKey, score: 0, unlocked: 0, completed: false, images: {} }
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
      completed: Boolean(parsed.completed),
      images: parsed.images && typeof parsed.images === 'object' ? parsed.images : {},
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

export default function DailyTheme() {
  const dateKey = useMemo(() => getDateKey(), [])
  const figure = useMemo(() => getTodayFigure(), [])
  const [state, setState] = useState<ThemeState>(() => loadThemeState(dateKey))
  const [modal, setModal] = useState<ThemeModal>(null)

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
            const cachedImage = prev.images[String(nextUnlocked)]
            setModal({ type: 'chapter', chapter, index: nextUnlocked, imageUrl: cachedImage, imageLoading: !cachedImage })
            if (!cachedImage) {
              fetchChapterImage(figure.name, chapter)
                .then(imageUrl => {
                  setState(current => ({
                    ...current,
                    images: { ...current.images, [String(nextUnlocked)]: imageUrl },
                  }))
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
        }
        if (!prev.completed && nextCompleted) {
          setTimeout(() => setModal({ type: 'complete' }), 450)
        }

        return { ...prev, score: nextScore, unlocked: nextUnlocked, completed: nextCompleted }
      })
    }

    window.addEventListener('points-earned', handlePoints)
    return () => {
      window.removeEventListener('points-earned', handlePoints)
    }
  }, [figure])

  const resetToday = () => {
    const fresh = createInitialState(dateKey)
    localStorage.removeItem(storageKey(dateKey))
    setModal(null)
    setState(fresh)
  }

  const simulateCorrect = () => {
    emitPoints(1)
  }

  const simulateChapter = () => {
    emitPoints(CHAPTER_STEP)
  }

  const openGallery = () => {
    if (state.unlocked > 0) setModal({ type: 'gallery' })
  }

  const getChapterParagraphs = (chapter: ThemeChapter) => (
    chapter.detail ? chapter.detail.split('\\n') : [chapter.fact, chapter.importance]
  ).filter(Boolean)

  const currentChapter = state.unlocked > 0 ? figure.chapters[state.unlocked - 1] : null
  const chapterParagraphs = modal?.type === 'chapter' ? getChapterParagraphs(modal.chapter) : []
  const unlockedChapters = figure.chapters.slice(0, state.unlocked)
  const dots = Array.from({ length: TOTAL_CHAPTERS }, (_, index) => index < state.unlocked)

  return (
    <section className={`${styles.theme} ${state.unlocked > 0 ? styles.themeClickable : ''}`} aria-label={songStarsTheme.title} onClick={openGallery}>
      <div className={styles.backdrop} />
      <div className={styles.headerRow}>
        <div>
          <p className={styles.kicker}>{songStarsTheme.title}</p>
          <h1 className={styles.title}>{figure.name}人生十章</h1>
          <p className={styles.subtitle}>{figure.era} · {figure.subtitle}</p>
        </div>
        <div className={styles.actions}>
          <span className={styles.count}>{state.unlocked} / {TOTAL_CHAPTERS}</span>
          {state.unlocked > 0 && (
            <button className={styles.galleryBtn} type="button" onClick={e => { e.stopPropagation(); setModal({ type: 'gallery' }) }}>图集</button>
          )}
        </div>
      </div>
      <div className={styles.chapterLine}>
        <span className={styles.chapterLabel}>{currentChapter ? currentChapter.title : '卷首'}</span>
        <div className={styles.dots} aria-hidden="true">
          {dots.map((done, index) => <span key={index} className={done ? styles.dotDone : styles.dot} />)}
        </div>
      </div>
      {import.meta.env.DEV && (
        <div className={styles.devTools} onClick={e => e.stopPropagation()}>
          <button type="button" onClick={simulateCorrect}>模拟答对</button>
          <button type="button" onClick={simulateChapter}>解锁一章</button>
          <button type="button" onClick={resetToday}>重置今日</button>
        </div>
      )}

      {modal && (
        <div className={styles.overlay} onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) setModal(null) }}>
          {modal.type === 'gallery' ? (
            <div className={styles.galleryModal}>
              <button className={styles.closeBtn} type="button" aria-label="关闭" onClick={() => setModal(null)}>×</button>
              <div className={styles.galleryIntro}>
                <p className={styles.modalKicker}>{songStarsTheme.title}</p>
                <h2>{figure.name}图集</h2>
                <span>{state.unlocked} / {TOTAL_CHAPTERS}</span>
              </div>
              <div className={styles.galleryScroll}>
                {unlockedChapters.map((chapter, index) => {
                  const chapterIndex = index + 1
                  const imageUrl = state.images[String(chapterIndex)]
                  return (
                    <article key={chapter.title} className={styles.galleryPage}>
                      <div className={styles.galleryImage}>
                        {imageUrl ? (
                          <img src={imageUrl} alt={`${figure.name} · ${chapter.title}`} />
                        ) : (
                          <div className={styles.imagePlaceholder}>
                            <span>本章图片尚未生成</span>
                            <strong>{chapter.title}</strong>
                          </div>
                        )}
                      </div>
                      <div className={styles.galleryText}>
                        <p className={styles.modalKicker}>第{chapterIndex}章</p>
                        <h3>{chapter.title}</h3>
                        {getChapterParagraphs(chapter).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : (
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
                  <button className={styles.openGalleryBtn} type="button" onClick={() => setModal({ type: 'gallery' })}>查看图集</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}