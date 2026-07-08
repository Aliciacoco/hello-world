import styles from './Navbar.module.css'

const links = ['About', 'Projects', 'Contact']

export default function Navbar() {
  return (
    <header className={styles.header}>
      <nav className={`container ${styles.nav}`}>
        <a href="#home" className={styles.logo}>YourName</a>
        <ul className={styles.links}>
          {links.map((l) => (
            <li key={l}>
              <a href={`#${l.toLowerCase()}`}>{l}</a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
