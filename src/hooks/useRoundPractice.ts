import { useCallback, useEffect, useMemo, useState } from 'react'

export interface RoundBankQuestion {
  id: string
}

/**
 * 轮次出题状态（按 bankType 持久化到 localStorage，刷新/重开浏览器不丢）：
 * - round:      当前第几轮（从 1 开始）
 * - queue:      本轮待做题 ID 队列（题库顺序），队首即当前题
 * - wrongIds:   本轮答错的题 ID（按题库顺序，去重）
 * - allIds:     本练习周期开始时的全量题库 ID 快照（用于识别新增/删除）
 * - roundTotal: 本轮总题数（轮开始时队列长度）
 * - notice:     轮次切换提示（进入新一轮时显示，答题后清除）
 */
interface RoundState {
  round: number
  queue: string[]
  wrongIds: string[]
  allIds: string[]
  roundTotal: number
  notice: string | null
}

const STORAGE_PREFIX = 'round_practice_'

function loadState(bankType: string): RoundState | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + bankType)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || !Array.isArray(s.queue) || !Array.isArray(s.wrongIds) || !Array.isArray(s.allIds)) return null
    return s as RoundState
  } catch {
    return null
  }
}

/**
 * 由题库构建/恢复轮次状态：
 * - 无历史：第 1 轮，全量题库按顺序入队
 * - 有历史：过滤已删除的题，把新增的题追加到当前轮队尾
 */
function initFromBank<T extends RoundBankQuestion>(items: T[], prev: RoundState | null): RoundState {
  const ids = items.map(q => String(q.id))
  if (!prev) {
    return { round: 1, queue: ids, wrongIds: [], allIds: ids, roundTotal: ids.length, notice: null }
  }
  const alive = new Set(ids)
  const known = new Set(prev.allIds)
  const newIds = ids.filter(id => !known.has(id))
  return {
    ...prev,
    queue: prev.queue.filter(id => alive.has(id)).concat(newIds),
    wrongIds: prev.wrongIds.filter(id => alive.has(id)),
    allIds: prev.allIds.filter(id => alive.has(id)).concat(newIds),
  }
}

/**
 * 轮次出题引擎：
 * 第 1 轮按题库顺序从头刷到尾 → 之后每轮只练上一轮答错的题（保持原顺序）→
 * 某轮全部做对即完成，可重新开始一轮。
 */
export function useRoundPractice<T extends RoundBankQuestion>(bankType: string) {
  const [bank, setBank] = useState<T[]>([])
  const [state, setState] = useState<RoundState | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  const [error, setError] = useState('')

  // 状态变化即持久化（刷新可恢复）
  useEffect(() => {
    if (state) localStorage.setItem(STORAGE_PREFIX + bankType, JSON.stringify(state))
  }, [state, bankType])

  const fetchBank = useCallback(async (mergeCurrent: boolean) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/bank/${bankType}`)
      if (!res.ok) throw new Error()
      const items: T[] = await res.json()
      setBank(items)
      setEmpty(items.length === 0)
      setState(prev => initFromBank(items, mergeCurrent && prev ? prev : loadState(bankType)))
    } catch {
      setError('获取题库失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [bankType])

  useEffect(() => { fetchBank(false) }, [fetchBank])

  /** 上传新题后调用：重新拉题库并把新增题并入当前轮 */
  const reload = useCallback(() => { fetchBank(true) }, [fetchBank])

  // 当前题 = 队列队首
  const currentId = state?.queue[0] ?? null
  const question = useMemo(
    () => bank.find(q => String(q.id) === currentId) ?? null,
    [bank, currentId]
  )

  /** 判卷后立即记录对错（持久化，刷新不丢） */
  const recordResult = useCallback((id: string, correct: boolean) => {
    setState(s => {
      if (!s || String(id) !== s.queue[0]) return s
      if (correct) return s.notice ? { ...s, notice: null } : s
      const sid = String(id)
      if (s.wrongIds.includes(sid)) return s.notice ? { ...s, notice: null } : s
      return { ...s, wrongIds: [...s.wrongIds, sid], notice: null }
    })
  }, [])

  /** 下一题：弹出队首；队列空则进入下一轮（只练本轮错题）或标记完成 */
  const next = useCallback(() => {
    setState(s => {
      if (!s) return s
      const queue = s.queue.slice(1)
      if (queue.length > 0) return { ...s, queue }
      if (s.wrongIds.length > 0) {
        return {
          ...s,
          round: s.round + 1,
          queue: s.wrongIds,
          roundTotal: s.wrongIds.length,
          wrongIds: [],
          notice: `第 ${s.round} 轮完成，${s.wrongIds.length} 题答错，进入第 ${s.round + 1} 轮`,
        }
      }
      return { ...s, queue: [], notice: null } // 全部做对 → completed
    })
  }, [])

  /** 重新开始：按当前题库顺序从头来一遍 */
  const restart = useCallback(() => {
    setState(initFromBank(bank, null))
  }, [bank])

  const completed = !!state && !loading && bank.length > 0
    && state.queue.length === 0 && state.wrongIds.length === 0

  return {
    question,
    loading,
    empty,
    error,
    completed,
    round: state?.round ?? 1,
    remaining: state?.queue.length ?? 0,
    roundTotal: state?.roundTotal ?? 0,
    notice: state?.notice ?? null,
    recordResult,
    next,
    restart,
    reload,
  }
}
