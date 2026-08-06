import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './NavPoints.module.css'

export default function NavPoints() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
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
    return () => clearInterval(id)
  }, [])

  return (
    <NavLink to="/points" className={styles.badge}>
      分 {balance === null ? '…' : balance.toFixed(1)}
    </NavLink>
  )
}
