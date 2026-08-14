export type TaskKey =
  | 'speed' | 'idiom' | 'changshi' | 'shenlun'
  | 'math_practice' | 'math_upload'
  | 'analysis_practice' | 'analysis_upload'
  | 'mock'

export interface DayProgress {
  speed: number
  idiom: number
  changshi: number
  shenlun: number
  math_practice: number
  math_upload: number
  analysis_practice: number
  analysis_upload: number
  mock: number
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
  mock: number
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
  isSaturday: boolean
}

export interface CalendarDay extends DayProgress {
  date: string
  isSaturday: boolean
}

export interface HistoryResponse {
  calendar: CalendarDay[]
  streak: number
  config: CheckinConfig
}

export const TASK_LABELS: Record<TaskKey, string> = {
  speed:             '⚡速算',
  idiom:             '📖成语',
  changshi:          '🧠常识',
  shenlun:           '✍️申论',
  math_practice:     '📊数量·练',
  math_upload:       '📊数量·录',
  analysis_practice: '📈分析·练',
  analysis_upload:   '📈分析·录',
  mock:              '📝套题',
}

/** 所有任务 key（含 mock）*/
export const ALL_TASK_KEYS: TaskKey[] = [
  'speed', 'idiom', 'changshi', 'shenlun',
  'math_practice', 'math_upload',
  'analysis_practice', 'analysis_upload',
  'mock',
]

/** 仅在特定星期几生效的任务（0=周日, 6=周六）*/
export const TASK_WEEKDAYS: Partial<Record<TaskKey, number[]>> = {
  mock: [6],
}

/** 判断日期字符串是否为周六（本地时间）*/
export function isSaturday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 6
}

/** 根据日期返回当天有效的任务列表（过滤掉非当天星期的限定任务）*/
export function getActiveTasks(dateStr: string): TaskKey[] {
  const day = new Date(dateStr + 'T00:00:00').getDay()
  return ALL_TASK_KEYS.filter(k => {
    const weekdays = TASK_WEEKDAYS[k]
    return !weekdays || weekdays.includes(day)
  })
}

export async function fetchTodayCheckin(): Promise<TodayResponse> {
  const res = await fetch('/api/checkin/today')
  if (!res.ok) throw new Error('获取打卡数据失败')
  return res.json()
}

export async function incrementTask(task: TaskKey, amount = 1): Promise<TodayResponse> {
  const res = await fetch('/api/checkin/increment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, amount }),
  })
  if (!res.ok) throw new Error('打卡失败')
  return res.json()
}

export async function fetchHistory(): Promise<HistoryResponse> {
  const res = await fetch('/api/checkin/history')
  if (!res.ok) throw new Error('获取历史失败')
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

/** 距最近未来考试日的剩余天数，无则返回 null */
export function calcExamCountdown(examDates: string[]): { date: string; days: number } | null {
  const today = new Date().toISOString().slice(0, 10)
  const future = examDates.filter(d => d >= today).sort()
  if (future.length === 0) return null
  const target = future[0]
  const ms = new Date(target).getTime() - new Date(today).getTime()
  return { date: target, days: Math.round(ms / 86400000) }
}
