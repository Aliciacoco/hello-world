import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p>© {new Date().getFullYear()} YourName. Built with React + Vite.</p>
      </div>
    </footer>
  )
}
