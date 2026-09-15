import { useState, useEffect } from 'react'
import styles from './ConfigPage.module.css'

interface PointsConfig {
  speed: number
  idiom: number
  changshi: number
  shenlun: number
  math_practice: number
  math_upload: number
  judgement_practice: number
  judgement_upload: number
  analysis_practice: number
  analysis_upload: number
  verbal_practice: number
  verbal_upload: number
}

const CONFIG_LABELS: Record<keyof PointsConfig, string> = {
  speed: '⚡ 速算（排列组合 + 分数速算）',
  idiom: '📖 成语辨析',
  changshi: '🧠 常识',
  shenlun: '✍️ 申论（单篇最高分）',
  math_practice: '📊 数量关系·练题',
  math_upload: '📊 数量关系·录题',
  judgement_practice: '🔍 判断推理·练题',
  judgement_upload: '🔍 判断推理·录题',
  analysis_practice: '📈 资料分析·练题',
  analysis_upload: '📈 资料分析·录题',
  verbal_practice: '📝 言语理解·练题',
  verbal_upload: '📝 言语理解·录题',
}

export default function ConfigPage() {
  const [config, setConfig] = useState<PointsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/config/points')
      .then(r => r.json())
      .then(d => { setConfig(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/config/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error()
      setMsg('保存成功 ✓')
      setTimeout(() => setMsg(''), 2000)
    } catch {
      setMsg('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.loading}>加载中...</p></div>
  if (!config) return <div className={styles.page}><p className={styles.loading}>加载失败</p></div>

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>积分配置</h1>
      <p className={styles.hint}>设置每道题答对或录入的积分数</p>

      <div className={styles.configGrid}>
        {(Object.keys(CONFIG_LABELS) as Array<keyof PointsConfig>).map(key => (
          <div key={key} className={styles.configRow}>
            <label className={styles.label}>{CONFIG_LABELS[key]}</label>
            <div className={styles.inputWrap}>
              <input
                type="number"
                className={styles.input}
                value={config[key]}
                min={0}
                max={20}
                step={0.1}
                onChange={e => setConfig(prev => prev ? { ...prev, [key]: parseFloat(e.target.value) || 0 } : null)}
              />
              <span className={styles.unit}>分</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.note}>
        ℹ️ 修改配置后立即生效，影响之后的所有练习和录题。历史积分记录不会改变。
      </div>

      <div className={styles.saveRow}>
        {msg && <span className={styles.saveMsg}>{msg}</span>}
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}
