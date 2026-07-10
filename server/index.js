const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const https = require('https')

const app = express()
const PORT = process.env.PORT || 3001
const DB_FILE = path.join(__dirname, 'wrong_answers.json')
const QWEN_API_KEY = process.env.QWEN_API_KEY || ''

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

function callQwen(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'qwen-plus',
      messages,
      max_tokens: 800,
    })
    const req = https.request({
      hostname: 'dashscope.aliyuncs.com',
      path: '/compatible-mode/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.choices?.[0]?.message?.content || '')
        } catch {
          reject(new Error('解析响应失败'))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

app.get('/api/idiom/question', async (req, res) => {
  try {
    const content = await callQwen([{
      role: 'user',
      content: `请从行测考试中出一道容易混淆或出错的成语辨析题。
格式要求（严格JSON，不要有多余文字）：
{"idiom":"成语","prompt":"请解释这个成语的意思及用法"}`,
    }])
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/idiom/check', async (req, res) => {
  const { idiom, userAnswer } = req.body
  if (!idiom || !userAnswer) return res.status(400).json({ error: '缺少参数' })
  try {
    const content = await callQwen([{
      role: 'user',
      content: `成语：${idiom}
用户的解释：${userAnswer}

请判断用户的解释是否正确（可以语义相近，不需要完全一致）。
格式要求（严格JSON，不要有多余文字）：
{"correct":true或false,"explanation":"正确含义及典型用法，100字左右"}`,
    }])
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`)
})
