import { useState, useEffect } from 'react'
import styles from './BankPage.module.css'

type BankTab = 'idiom' | 'math' | 'judgement' | 'analysis' | 'calc'

interface Review {
  date: number
  userAnswer: string
  feedback?: string
}

interface BankItem {
  id: string
  word?: string
  stem?: string
  options?: string
  answer: string
  explanation: string
  reviews?: Review[]
}

interface CalcRecord {
  id: string
  question: { type: string; n: number; r: number }
  userAnswer: number
  correctAnswer: number
  explanation: string
  reason?: string
  date: number
}

function ReviewList({ reviews, onDeleteReview }: { reviews: Review[]; onDeleteReview?: (index: number) => void }) {
  return (
    <div className={styles.reviews}>
      <p className={styles.reviewTitle}>答错记录</p>
      {reviews.map((r, i) => (
        <div key={i} className={styles.reviewRow}>
          <span className={styles.reviewDate}>{new Date(r.date).toLocaleDateString('zh-CN')}</span>
          <span className={styles.reviewAnswer}>你答：{r.userAnswer}</span>
          {onDeleteReview && (
            <button className={styles.deleteReviewBtn} onClick={() => onDeleteReview(i)}>删除</button>
          )}
          {r.feedback && <p className={styles.reviewFeedback}>{r.feedback}</p>}
        </div>
      ))}
    </div>
  )
}

function IdiomBankItem({ item, onUpdate, onDelete }: {
  item: BankItem
  onUpdate: (updated: BankItem) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ word: item.word ?? '', answer: item.answer, explanation: item.explanation })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/bank/idiom/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`确定删除「${item.word}」？`)) return
    const res = await fetch(`/api/bank/idiom/${item.id}`, { method: 'DELETE' })
    if (res.ok) onDelete(item.id)
  }

  const handleDeleteReview = async (index: number) => {
    const res = await fetch(`/api/bank/idiom/${item.id}/reviews/${index}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(updated)
    }
  }

  return (
    <div className={styles.item}>
      <div className={styles.itemHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.itemTitle}>{item.word}</span>
        <span className={styles.itemMeta}>
          {item.reviews?.length ? <span className={styles.reviewBadge}>答错 {item.reviews.length} 次</span> : null}
          <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
        </span>
      </div>
      {open && (
        <div className={styles.itemBody}>
          {editing ? (
            <div className={styles.editForm}>
              <label className={styles.editLabel}>成语</label>
              <input className={styles.editField} value={form.word} onChange={e => setForm(f => ({ ...f, word: e.target.value }))} />
              <label className={styles.editLabel}>含义</label>
              <textarea className={styles.editArea} value={form.answer} rows={2} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
              <label className={styles.editLabel}>解析</label>
              <textarea className={styles.editArea} value={form.explanation} rows={3} onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))} />
              <div className={styles.actions}>
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
                <button className={styles.cancelBtn} onClick={() => setEditing(false)}>取消</button>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.answer}><strong>含义：</strong>{item.answer}</p>
              <p className={styles.explanation}>{item.explanation}</p>
              {item.reviews && item.reviews.length > 0 && <ReviewList reviews={item.reviews} onDeleteReview={handleDeleteReview} />}
              <div className={styles.actions}>
                <button className={styles.editBtn} onClick={() => { setForm({ word: item.word ?? '', answer: item.answer, explanation: item.explanation }); setEditing(true) }}>编辑</button>
                <button className={styles.deleteBtn} onClick={handleDelete}>删除</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ExamBankItem({ item, bankType, onUpdate, onDelete }: {
  item: BankItem
  bankType: string
  onUpdate: (updated: BankItem) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ stem: item.stem ?? '', options: item.options ?? '', answer: item.answer, explanation: item.explanation })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/bank/${bankType}/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定删除这道题？')) return
    const res = await fetch(`/api/bank/${bankType}/${item.id}`, { method: 'DELETE' })
    if (res.ok) onDelete(item.id)
  }

  return (
    <div className={styles.item}>
      <div className={styles.itemHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.itemTitle}>{item.stem?.slice(0, 40)}{(item.stem?.length ?? 0) > 40 ? '…' : ''}</span>
        <span className={styles.itemMeta}>
          {item.reviews?.length ? <span className={styles.reviewBadge}>答错 {item.reviews.length} 次</span> : null}
          <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
        </span>
      </div>
      {open && (
        <div className={styles.itemBody}>
          {editing ? (
            <div className={styles.editForm}>
              <label className={styles.editLabel}>题干</label>
              <textarea className={styles.editArea} value={form.stem} rows={3} onChange={e => setForm(f => ({ ...f, stem: e.target.value }))} />
              <label className={styles.editLabel}>选项</label>
              <textarea className={styles.editArea} value={form.options} rows={4} onChange={e => setForm(f => ({ ...f, options: e.target.value }))} />
              <label className={styles.editLabel}>答案</label>
              <input className={styles.editField} value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
              <label className={styles.editLabel}>解析</label>
              <textarea className={styles.editArea} value={form.explanation} rows={4} onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))} />
              <div className={styles.actions}>
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
                <button className={styles.cancelBtn} onClick={() => setEditing(false)}>取消</button>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.stem}>{item.stem}</p>
              {item.options && <pre className={styles.options}>{item.options}</pre>}
              <p className={styles.answer}><strong>答案：</strong>{item.answer}</p>
              <p className={styles.explanation}>{item.explanation}</p>
              {item.reviews && item.reviews.length > 0 && <ReviewList reviews={item.reviews} />}
              <div className={styles.actions}>
                <button className={styles.editBtn} onClick={() => { setForm({ stem: item.stem ?? '', options: item.options ?? '', answer: item.answer, explanation: item.explanation }); setEditing(true) }}>编辑</button>
                <button className={styles.deleteBtn} onClick={handleDelete}>删除</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CalcItem({ item, onDelete }: { item: CalcRecord; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false)

  const handleDelete = async () => {
    if (!confirm('确定删除这条记录？')) return
    const res = await fetch(`/api/wrong-answers/${item.id}`, { method: 'DELETE' })
    if (res.ok) onDelete(item.id)
  }

  return (
    <div className={styles.item}>
      <div className={styles.itemHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.itemTitle}>
          {item.question.type}({item.question.n},{item.question.r}) = {item.userAnswer}（正确：{item.correctAnswer}）
        </span>
        <span className={styles.itemMeta}>
          <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
        </span>
      </div>
      {open && (
        <div className={styles.itemBody}>
          <p className={styles.explanation}>{item.explanation}</p>
          {item.reason && <p className={styles.answer}><strong>我的原因：</strong>{item.reason}</p>}
          <p className={styles.reviewDate}>{new Date(item.date).toLocaleDateString('zh-CN')}</p>
          <div className={styles.actions}>
            <button className={styles.deleteBtn} onClick={handleDelete}>删除</button>
          </div>
        </div>
      )}
    </div>
  )
}

const TAB_CONFIG: { key: BankTab; label: string; apiPath: string }[] = [
  { key: 'idiom', label: '成语辨析', apiPath: '/api/bank/idiom' },
  { key: 'math', label: '数量关系', apiPath: '/api/bank/math' },
  { key: 'judgement', label: '判断推理', apiPath: '/api/bank/judgement' },
  { key: 'analysis', label: '资料分析', apiPath: '/api/bank/analysis' },
  { key: 'calc', label: '速算记录', apiPath: '/api/wrong-answers/speed' },
]

export default function BankPage() {
  const [tab, setTab] = useState<BankTab>('idiom')
  const [list, setList] = useState<BankItem[]>([])
  const [calcList, setCalcList] = useState<CalcRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Partial<Record<BankTab, number>>>({})

  // Load counts for all tabs on mount
  useEffect(() => {
    Promise.all(
      TAB_CONFIG.map(t => fetch(t.apiPath).then(r => r.json()).catch(() => []))
    ).then(results => {
      const newCounts: Partial<Record<BankTab, number>> = {}
      TAB_CONFIG.forEach((t, i) => {
        newCounts[t.key] = Array.isArray(results[i]) ? results[i].length : 0
      })
      setCounts(newCounts)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const config = TAB_CONFIG.find(t => t.key === tab)!
    fetch(config.apiPath)
      .then(r => r.json())
      .then(data => {
        if (tab === 'calc') {
          setCalcList(data)
        } else {
          setList(data)
          setCounts(c => ({ ...c, [tab]: data.length }))
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [tab])

  const handleUpdate = (updated: BankItem) => {
    setList(l => l.map(item => item.id === updated.id ? updated : item))
  }

  const handleDelete = (id: string) => {
    setList(l => {
      const next = l.filter(item => item.id !== id)
      setCounts(c => ({ ...c, [tab]: next.length }))
      return next
    })
  }

  const handleCalcDelete = (id: string) => {
    setCalcList(l => {
      const next = l.filter(item => item.id !== id)
      setCounts(c => ({ ...c, calc: next.length }))
      return next
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>题库</h1>
        <div className={styles.tabs}>
          {TAB_CONFIG.map(t => (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {counts[t.key] != null && counts[t.key]! > 0 && (
                <span className={styles.tabCount}>{counts[t.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className={styles.empty}>加载中...</p>
      ) : tab === 'calc' ? (
        calcList.length === 0
          ? <p className={styles.empty}>暂无速算错题记录</p>
          : <div className={styles.list}>{calcList.map(item => <CalcItem key={item.id} item={item} onDelete={handleCalcDelete} />)}</div>
      ) : list.length === 0 ? (
        <p className={styles.empty}>题库暂无内容</p>
      ) : (
        <div className={styles.list}>
          {list.map(item =>
            tab === 'idiom'
              ? <IdiomBankItem key={item.id} item={item} onUpdate={handleUpdate} onDelete={handleDelete} />
              : <ExamBankItem key={item.id} item={item} bankType={tab} onUpdate={handleUpdate} onDelete={handleDelete} />
          )}
        </div>
      )}
    </div>
  )
}
