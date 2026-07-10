const express = require('express')
const cors = require('cors')
const Database = require('better-sqlite3')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

const db = new Database(path.join(__dirname, 'wrong_answers.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS wrong_answers (
    id TEXT PRIMARY KEY,
    question_type TEXT NOT NULL,
    question_n INTEGER NOT NULL,
    question_r INTEGER NOT NULL,
    user_answer INTEGER NOT NULL,
    correct_answer INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    reason TEXT NOT NULL,
    date INTEGER NOT NULL
  )
`)

app.get('/api/wrong-answers', (req, res) => {
  const rows = db.prepare('SELECT * FROM wrong_answers ORDER BY date DESC').all()
  const list = rows.map(r => ({
    id: r.id,
    question: { type: r.question_type, n: r.question_n, r: r.question_r },
    userAnswer: r.user_answer,
    correctAnswer: r.correct_answer,
    explanation: r.explanation,
    reason: r.reason,
    date: r.date,
  }))
  res.json(list)
})

app.post('/api/wrong-answers', (req, res) => {
  const { id, question, userAnswer, correctAnswer, explanation, reason, date } = req.body
  if (!id || !question || userAnswer == null || correctAnswer == null || !explanation || !reason || !date) {
    return res.status(400).json({ error: '缺少必要字段' })
  }
  db.prepare(`
    INSERT OR REPLACE INTO wrong_answers
    (id, question_type, question_n, question_r, user_answer, correct_answer, explanation, reason, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, question.type, question.n, question.r, userAnswer, correctAnswer, explanation, reason, date)
  res.json({ ok: true })
})

app.delete('/api/wrong-answers', (req, res) => {
  db.prepare('DELETE FROM wrong_answers').run()
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`)
})
