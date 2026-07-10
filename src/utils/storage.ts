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

const KEY = 'combinatorics_wrong_answers'

export function getWrongAnswers(): WrongAnswer[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function saveWrongAnswer(item: Omit<WrongAnswer, 'id' | 'date'>): void {
  const list = getWrongAnswers()
  list.unshift({ ...item, id: crypto.randomUUID(), date: Date.now() })
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function clearWrongAnswers(): void {
  localStorage.removeItem(KEY)
}
