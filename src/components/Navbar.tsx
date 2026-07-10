import { NavLink } from 'react-router-dom'
import styles from './Navbar.module.css'

export default function Navbar() {
  return (
    <header className={styles.header}>
      <nav className={`container ${styles.nav}`}>
        <NavLink to="/" className={styles.logo}>练习本</NavLink>
        <ul className={styles.links}>
          <li><NavLink to="/" end className={({ isActive }) => isActive ? styles.active : ''}>练习</NavLink></li>
          <li><NavLink to="/wrong-answers" className={({ isActive }) => isActive ? styles.active : ''}>错题本</NavLink></li>
        </ul>
      </nav>
    </header>
  )
}
