import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface RoundBankQuestion {
  id: string
}

/**
 * 轮次出题状态：
 * - round:      当前第几轮（从 1 开始）
 * - queue:      本轮待做题 ID 队列（题库顺序），队首即当前题
 * - wrongIds:   本轮答错的题 ID（按题库顺序，去重）
 * - allIds:     本练习周期开始时的全量题库 ID 快照（用于识别新增/删除）
 * - roundTotal: 本轮总题数（轮开始时队列长度）
 * - notice:     轮次切换提示（进入新一轮时显示，答题后清除）
 * - updatedAt:  最后修改时间，用于在本地缓存与服务端进度之间择新
 */
interface RoundState {
  round: number
  queue: string[]
  wrongIds: string[]
  allIds: string[]
  roundTotal: number
  notice: string | null
  updatedAt?: number
}

const STORAGE_PREFIX = 'round_practice_'
/** 同步服务端的防抖间隔（毫秒），避免每答一题都打一次请求 */
const PUSH_DELAY = 400

function isValidState(s: unknown): s is RoundState {
  const o = s as RoundState | null
  return !!o && typeof o === 'object'
    && Array.isArray(o.queue) && Array.isArray(o.wrongIds) && Array.isArray(o.allIds)
}

function loadLocal(bankType: string): RoundState | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + bankType)
    if (!raw) return null
    const s = JSON.parse(raw)
    return isValidState(s) ? s : null
  } catch {
    return null
  }
}

function saveLocal(bankType: string, s: RoundState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + bankType, JSON.stringify(s))
  } catch {
    /* 隐私模式/存储被禁用时写入会失败，忽略即可——服务端仍在同步 */
  }
}

/** 取修改时间更新的一方作为恢复源（都没有则返回 null） */
function pickNewer(a: RoundState | null, b: RoundState | null): RoundState | null {
  if (!a) return b
  if (!b) return a
  return (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b
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
 *
 * 进度双写：本地缓存（localStorage，即时生效、离线可用）+ 服务端（防抖同步，
 * 刷新、换浏览器、换设备都能接着上次的轮次继续）。
 */
export function useRoundPractice<T extends RoundBankQuestion>(bankType: string) {
  const [bank, setBank] = useState<T[]>([])
  const [state, setState] = useState<RoundState | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  const [error, setError] = useState('')

  // 推送服务端：防抖合并写入，失败静默（本地缓存已同步写好）
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef<RoundState | null>(null)

  const push = useCallback((s: RoundState) => {
    pendingRef.current = s
    if (timerRef.current != null) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      const payload = pendingRef.current
      pendingRef.current = null
      if (!payload) return
      fetch(`/api/round/${bankType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    }, PUSH_DELAY)
  }, [bankType])

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  // 状态变化即双写：本地缓存立即写（刷新/离线不丢），服务端防抖同步（换浏览器/设备可恢复）
  useEffect(() => {
    if (!state) return
    const stamped: RoundState = { ...state, updatedAt: Date.now() }
    saveLocal(bankType, stamped)
    push(stamped)
  }, [state, bankType, push])

  const fetchBank = useCallback(async (mergeCurrent: boolean) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/bank/${bankType}`)
      if (!res.ok) throw new Error()
      const items: T[] = await res.json()

      // 远端进度：请求失败（网络异常 / 服务端是旧版本没有该接口）就退回本地缓存
      let remote: RoundState | null = null
      try {
        const r = await fetch(`/api/round/${bankType}`)
        if (r.ok) {
          const data = await r.json()
          if (isValidState(data)) remote = data
        }
      } catch {
        /* 忽略，用本地缓存 */
      }

      setBank(items)
      setEmpty(items.length === 0)
      setState(prev => {
        const base = mergeCurrent && prev ? prev : pickNewer(loadLocal(bankType), remote)
        return initFromBank(items, base)
      })
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
