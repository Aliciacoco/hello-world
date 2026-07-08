import styles from './About.module.css'

export default function About() {
  return (
    <section id="about" className={styles.about}>
      <div className="container">
        <h2 className={styles.sectionTitle}>About</h2>
        <div className={styles.content}>
          <p>
            I'm a developer based in [City]. I love building clean, fast, and
            accessible web experiences. Currently working on [something cool].
          </p>
          <p>
            When I'm not coding, you'll find me [hobby / interest].
          </p>
        </div>
        <div className={styles.skills}>
          {['TypeScript', 'React', 'Node.js', 'Python', 'Docker', 'Linux'].map((s) => (
            <span key={s} className={styles.tag}>{s}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
