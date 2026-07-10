export type QuestionType = 'A' | 'C'

export interface Question {
  type: QuestionType
  n: number
  r: number
}

function factorial(n: number): number {
  if (n <= 1) return 1
  return n * factorial(n - 1)
}

export function calculateAnswer(q: Question): number {
  if (q.type === 'A') {
    return factorial(q.n) / factorial(q.n - q.r)
  }
  return factorial(q.n) / (factorial(q.r) * factorial(q.n - q.r))
}

export function generateQuestion(): Question {
  const type: QuestionType = Math.random() < 0.5 ? 'A' : 'C'
  const n = Math.floor(Math.random() * 9) + 2 // 2~10
  const r = Math.floor(Math.random() * n) + 1  // 1~n
  return { type, n, r }
}

export function getExplanation(q: Question): string {
  const ans = calculateAnswer(q)
  if (q.type === 'C') {
    return `C(${q.n}, ${q.r}) = ${q.n}! ÷ (${q.r}! × ${q.n - q.r}!) = ${ans}`
  }
  return `A(${q.n}, ${q.r}) = ${q.n}! ÷ ${q.n - q.r}! = ${ans}`
}
