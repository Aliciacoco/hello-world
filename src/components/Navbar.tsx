import { NavLink } from 'react-router-dom'
import styles from './Navbar.module.css'
import ThemeToggle from './ThemeToggle'

export default function Navbar() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        {/* 左侧占位，让链接居中 */}
        <div style={{ width: 32 }} />
        <div className={styles.linksWrap}>
          <ul className={styles.links}>
            <li><NavLink to="/" end className={({ isActive }) => isActive ? styles.active : ''}>练习</NavLink></li>
            <li><NavLink to="/bank" className={({ isActive }) => isActive ? styles.active : ''}>题库</NavLink></li>
            <li><NavLink to="/points" className={({ isActive }) => isActive ? styles.active : ''}>积分</NavLink></li>
          </ul>
        </div>
        <ThemeToggle />
      </nav>
    </header>
  )
}
