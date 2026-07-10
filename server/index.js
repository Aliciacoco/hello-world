const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3001
const DB_FILE = path.join(__dirname, 'wrong_answers.json')

app.use(cors())
app.use(express.json())

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch {
    return []
  }
}

function writeData(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2))
}

app.get('/api/wrong-answers', (req, res) => {
  res.json(readData())
})

app.post('/api/wrong-answers', (req, res) => {
  const { id, question, userAnswer, correctAnswer, explanation, reason, date } = req.body
  if (!id || !question || userAnswer == null || correctAnswer == null || !explanation || !reason || !date) {
    return res.status(400).json({ error: '缺少必要字段' })
  }
  const list = readData()
  list.unshift({ id, question, userAnswer, correctAnswer, explanation, reason, date })
  writeData(list)
  res.json({ ok: true })
})

app.delete('/api/wrong-answers', (req, res) => {
  writeData([])
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`)
})
