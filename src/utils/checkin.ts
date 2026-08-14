export type TaskKey =
  | 'speed' | 'idiom' | 'changshi' | 'shenlun'
  | 'math_practice' | 'math_upload'
  | 'analysis_practice' | 'analysis_upload'

export interface DayProgress {
  speed: number
  idiom: number
  changshi: number
  shenlun: number
  math_practice: number
  math_upload: number
  analysis_practice: number
  analysis_upload: number
  completed: boolean
  completedAt: string | null
}

export interface CheckinTargets {
  speed: number
  idiom: number
  changshi: number
  shenlun: number
  math_practice: number
  math_upload: number
  analysis_practice: number
  analysis_upload: number
}

export interface CheckinConfig {
  examDates: string[]
  targets: CheckinTargets
}

export interface TodayResponse {
  date: string
  progress: DayProgress
  targets: CheckinTargets
  config: CheckinConfig
}

export interface HistoryDay extends DayProgress {
  date: string
}

export interface HistoryResponse {
  history: HistoryDay[]
  streak: number
  config: CheckinConfig
}

export const TASK_LABELS: Record<TaskKey, string> = {
  speed:            '⚡速算',
  idiom:            '📖成语',
  changshi:         '🧠常识',
  shenlun:          '✍️申论',
  math_practice:    '📊数量·练',
  math_upload:      '📊数量·录',
  analysis_practice:'📈分析·练',
  analysis_upload:  '📈分析·录',
}

export const ALL_TASK_KEYS: TaskKey[] = [
  'speed', 'idiom', 'changshi', 'shenlun',
  'math_practice', 'math_upload',
  'analysis_practice', 'analysis_upload',
]

export async function fetchTodayCheckin(): Promise<TodayResponse> {
  const res = await fetch('/api/checkin/today')
  if (!res.ok) throw new Error('获取打卡数据失败')
  return res.json()
}

export async function incrementTask(task: TaskKey): Promise<TodayResponse> {
  const res = await fetch('/api/checkin/increment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  })
  if (!res.ok) throw new Error('打卡失败')
  return res.json()
}

export async function fetchHistory(days = 60): Promise<HistoryResponse> {
  const res = await fetch(`/api/checkin/history?days=${days}`)
  if (!res.ok) throw new Error('获取历史失败')
  return res.json()
}

export async function fetchCheckinConfig(): Promise<CheckinConfig> {
  const res = await fetch('/api/checkin/config')
  if (!res.ok) throw new Error('获取配置失败')
  return res.json()
}

export async function saveCheckinConfig(cfg: Partial<CheckinConfig>): Promise<CheckinConfig> {
  const res = await fetch('/api/checkin/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  })
  if (!res.ok) throw new Error('保存配置失败')
  return res.json()
}

/** 距离最近的未来考试日期剩余天数，没有则返回 null */
export function calcExamCountdown(examDates: string[]): { date: string; days: number } | null {
  const today = new Date().toISOString().slice(0, 10)
  const future = examDates
    .filter(d => d >= today)
    .sort()
  if (future.length === 0) return null
  const target = future[0]
  const ms = new Date(target).getTime() - new Date(today).getTime()
  return { date: target, days: Math.round(ms / 86400000) }
}
