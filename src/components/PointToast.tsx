import { useState, useEffect } from 'react'
import styles from './PointToast.module.css'

interface Toast {
  id: number
  amount: number
  balance: number
}

export default function PointToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const { amount, balance } = (e as CustomEvent<{ amount: number; balance: number }>).detail
      const id = Date.now() + Math.random()
      setToasts(prev => [...prev, { id, amount, balance }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 3100)
    }
    window.addEventListener('points-earned', handler)
    return () => window.removeEventListener('points-earned', handler)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className={styles.container}>
      {toasts.map(t => (
        <div key={t.id} className={styles.toast}>
          +{t.amount} 分 · 累计 {t.balance} 分
        </div>
      ))}
    </div>
  )
}
