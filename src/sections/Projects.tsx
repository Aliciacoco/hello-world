import styles from './Projects.module.css'

const projects = [
  {
    name: 'Project Alpha',
    desc: 'A short description of what this project does and why it matters.',
    tags: ['React', 'TypeScript'],
    link: '#',
  },
  {
    name: 'Project Beta',
    desc: 'A short description of what this project does and why it matters.',
    tags: ['Node.js', 'PostgreSQL'],
    link: '#',
  },
  {
    name: 'Project Gamma',
    desc: 'A short description of what this project does and why it matters.',
    tags: ['Python', 'Docker'],
    link: '#',
  },
]

export default function Projects() {
  return (
    <section id="projects" className={styles.projects}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Projects</h2>
        <div className={styles.grid}>
          {projects.map((p) => (
            <a key={p.name} href={p.link} className={styles.card}>
              <h3>{p.name}</h3>
              <p>{p.desc}</p>
              <div className={styles.tags}>
                {p.tags.map((t) => (
                  <span key={t} className={styles.tag}>{t}</span>
                ))}
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
