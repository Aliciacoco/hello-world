import { Link, useLocation } from 'react-router-dom'
import styles from './Navbar.module.css'

export default function Navbar() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  return (
    <header className={styles.header}>
      <nav className={`container ${styles.nav}`}>
        <Link to="/" className={styles.logo}>YourName</Link>
        <ul className={styles.links}>
          {isHome ? (
            <>
              <li><a href="#about">About</a></li>
              <li><a href="#projects">Projects</a></li>
              <li><a href="#contact">Contact</a></li>
            </>
          ) : null}
          <li><Link to="/practice">练习</Link></li>
          <li><Link to="/wrong-answers">错题本</Link></li>
        </ul>
      </nav>
    </header>
  )
}
