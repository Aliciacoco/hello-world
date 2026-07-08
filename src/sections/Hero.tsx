import styles from './Hero.module.css'

export default function Hero() {
  return (
    <section id="home" className={styles.hero}>
      <div className="container">
        <p className={styles.greeting}>Hi, I'm</p>
        <h1 className={styles.name}>Your Name</h1>
        <p className={styles.tagline}>
          Full-stack developer · Building things for the web
        </p>
        <div className={styles.actions}>
          <a href="#projects" className={styles.btnPrimary}>View Projects</a>
          <a href="#contact" className={styles.btnSecondary}>Contact Me</a>
        </div>
      </div>
    </section>
  )
}
