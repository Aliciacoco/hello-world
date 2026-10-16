import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './NavPoints.module.css'

export default function NavPoints() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<{ balance?: number }>).detail?.balance
      if (typeof next === 'number') setBalance(next)
    }
    window.addEventListener('points-updated', update)
    window.addEventListener('points-earned', update)
    fetch('/api/points')
      .then(r => r.json())
      .then(d => setBalance(typeof d.balance === 'number' ? d.balance : 0))
      .catch(() => {})

    const id = setInterval(() => {
      fetch('/api/points')
        .then(r => r.json())
        .then(d => setBalance(typeof d.balance === 'number' ? d.balance : 0))
        .catch(() => {})
    }, 30000)
    return () => {
      clearInterval(id)
      window.removeEventListener('points-updated', update)
      window.removeEventListener('points-earned', update)
    }
  }, [])

  return (
    <NavLink to="/points" className={styles.badge}>
      🪙 {balance === null ? '…' : balance.toFixed(1)}
    </NavLink>
  )
}
