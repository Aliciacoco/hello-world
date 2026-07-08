import styles from './Contact.module.css'

export default function Contact() {
  return (
    <section id="contact" className={styles.contact}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Contact</h2>
        <p className={styles.intro}>
          Have a project in mind or just want to say hi? Reach out.
        </p>
        <div className={styles.links}>
          <a href="mailto:you@example.com">you@example.com</a>
          <a href="https://github.com/yourusername" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://linkedin.com/in/yourusername" target="_blank" rel="noreferrer">LinkedIn</a>
        </div>
      </div>
    </section>
  )
}
