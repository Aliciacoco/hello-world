import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { fetchTodayCheckin, incrementTask, TodayResponse, TaskKey } from '../utils/checkin'

// ── bankType → 打卡任务 key ──────────────────────────────────────
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
  /** 手动增加某任务积分（供套题等手动打卡按钮调用） */
  increment: (task: TaskKey, amount?: number) => Promise<void>
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

  const increment = useCallback(async (task: TaskKey, amount = 1) => {
    const res = await incrementTask(task, amount)
    setToday(res)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 统一监听 points-earned，按 activity + bankType 路由到对应打卡任务
  // 同时处理 practice（答题得分）和 upload（录题得分）
  useEffect(() => {
    const handlePointsEarned = (e: Event) => {
      const { activity, bankType, amount } = (e as CustomEvent).detail ?? {}
      if (!bankType || !amount) return

      if (activity === 'practice') {
        const task = PRACTICE_TASK_MAP[bankType as string]
        if (task) incrementTask(task, amount).then(setToday).catch(() => {})
      } else if (activity === 'upload') {
        const task = UPLOAD_TASK_MAP[bankType as string]
        if (task) incrementTask(task, amount).then(setToday).catch(() => {})
      }
    }

    window.addEventListener('points-earned', handlePointsEarned)
    return () => window.removeEventListener('points-earned', handlePointsEarned)
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
