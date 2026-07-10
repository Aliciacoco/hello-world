import type { Question } from './combinatorics'

export interface WrongAnswer {
  id: string
  question: Question
  userAnswer: number
  correctAnswer: number
  explanation: string
  reason: string
  date: number
}

const API = '/api/wrong-answers'

export async function getWrongAnswers(): Promise<WrongAnswer[]> {
  const res = await fetch(API)
  if (!res.ok) throw new Error('获取错题失败')
  return res.json()
}

export async function saveWrongAnswer(item: Omit<WrongAnswer, 'id' | 'date'>): Promise<void> {
  const body: WrongAnswer = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: Date.now(),
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('保存失败')
}

export async function clearWrongAnswers(): Promise<void> {
  const res = await fetch(API, { method: 'DELETE' })
  if (!res.ok) throw new Error('清空失败')
}
