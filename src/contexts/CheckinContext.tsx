import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { fetchTodayCheckin, incrementTask, TodayResponse, TaskKey } from '../utils/checkin'

// ── bankType 事件值 → 打卡任务 key ──────────────────────────────────
const PRACTICE_TASK_MAP: Record<string, TaskKey> = {
  speed:    'speed',
  idiom:    'idiom',
  changshi: 'changshi',
  shenlun:  'shenlun',
  math:     'math_practice',
  analysis: 'analysis_practice',
}

const UPLOAD_TASK_MAP: Record<string, TaskKey> = {
  math:     'math_upload',
  analysis: 'analysis_upload',
}

// ── Context ─────────────────────────────────────────────────────────
interface CheckinCtx {
  today: TodayResponse | null
  refresh: () => void
  /** 手动增加某任务进度（供套题等手动打卡按钮调用） */
  increment: (task: TaskKey) => Promise<void>
}

const CheckinContext = createContext<CheckinCtx>({
  today: null,
  refresh: () => {},
  increment: async () => {},
})

export function CheckinProvider({ children }: { children: ReactNode }) {
  const [today, setToday] = useState<TodayResponse | null>(null)

  const refresh = useCallback(() => {
    fetchTodayCheckin().then(setToday).catch(() => {})
  }, [])

  const increment = useCallback(async (task: TaskKey) => {
    const res = await incrementTask(task)
    setToday(res)
  }, [])

  // 首次加载
  useEffect(() => { refresh() }, [refresh])

  // 全局监听 answer-result 和 points-earned 事件
  useEffect(() => {
    const handleAnswer = (e: Event) => {
      const { correct, bankType } = (e as CustomEvent).detail ?? {}
      if (!correct || !bankType) return
      const task = PRACTICE_TASK_MAP[bankType as string]
      if (task) incrementTask(task).then(setToday).catch(() => {})
    }

    const handleUpload = (e: Event) => {
      const { activity, bankType } = (e as CustomEvent).detail ?? {}
      if (activity !== 'upload' || !bankType) return
      const task = UPLOAD_TASK_MAP[bankType as string]
      if (task) incrementTask(task).then(setToday).catch(() => {})
    }

    window.addEventListener('answer-result', handleAnswer)
    window.addEventListener('points-earned', handleUpload)
    return () => {
      window.removeEventListener('answer-result', handleAnswer)
      window.removeEventListener('points-earned', handleUpload)
    }
  }, [])

  return (
    <CheckinContext.Provider value={{ today, refresh, increment }}>
      {children}
    </CheckinContext.Provider>
  )
}

export function useCheckin() {
  return useContext(CheckinContext)
}
