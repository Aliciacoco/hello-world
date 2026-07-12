import type { Question } from './combinatorics'

export interface MathWrongAnswer {
  id: string
  type?: 'math'
  question: Question
  userAnswer: number
  correctAnswer: number
  explanation: string
  reason: string
  date: number
}

export interface IdiomWrongAnswer {
  id: string
  type: 'idiom'
  word: string
  userAnswer: string
  explanation: string
  reason: string
  date: number
}

export interface ExamWrongAnswer {
  id: string
  type: 'exam'
  stem: string
  options: string
  answer: string
  explanation: string
  userAnswer: string
  reason: string
  date: number
}

export type WrongAnswer = MathWrongAnswer | IdiomWrongAnswer | ExamWrongAnswer

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

export async function deleteWrongAnswer(id: string): Promise<void> {
  const res = await fetch(`${API}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('删除失败')
}

export async function clearWrongAnswers(): Promise<void> {
  const res = await fetch(API, { method: 'DELETE' })
  if (!res.ok) throw new Error('清空失败')
}
