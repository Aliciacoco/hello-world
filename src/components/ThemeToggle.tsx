import { useEffect, useState } from 'react'
import styles from './ThemeToggle.module.css'

type Theme = 'default' | 'hellokitty'

function applyTheme(theme: Theme) {
  if (theme === 'hellokitty') {
    document.documentElement.dataset.theme = 'hellokitty'
  } else {
    delete document.documentElement.dataset.theme
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'hellokitty' ? 'hellokitty' : 'default'
  })

  // 初始化时应用已保存的主题
  useEffect(() => {
    applyTheme(theme)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'hellokitty' ? 'default' : 'hellokitty'
    setTheme(next)
    applyTheme(next)
    localStorage.setItem('theme', next)
  }

  return (
    <button
      className={styles.btn}
      onClick={toggle}
      title={theme === 'hellokitty' ? '切换回默认主题' : '切换 Hello Kitty 主题'}
      type="button"
    >
      {theme === 'hellokitty' ? '📚' : '🎀'}
    </button>
  )
}
