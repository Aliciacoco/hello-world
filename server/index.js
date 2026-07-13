const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const https = require('https')

const app = express()
const PORT = process.env.PORT || 3001
// DATA_DIR：Railway 上挂载持久化磁盘时设为磁盘路径（如 /data），本地留空用 __dirname
const DATA_DIR = process.env.DATA_DIR || __dirname
const DB_FILE = path.join(DATA_DIR, 'wrong_answers.json')
const QWEN_API_KEY = process.env.QWEN_API_KEY || 'sk-f69ceab683b54d8aaee09f19b947e38f'

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

app.get('/api/wrong-answers/speed', (req, res) => {
  res.json(readData().filter(item => !item.type || item.type === 'math'))
})

app.post('/api/wrong-answers', (req, res) => {
  const body = req.body
  if (!body.id || body.userAnswer == null || !body.explanation || !body.date) {
    return res.status(400).json({ error: '缺少必要字段' })
  }
  const list = readData()
  list.unshift(body)
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

app.post('/api/math/explain', async (req, res) => {
  const { type, n, r, userAnswer, correctAnswer, reason } = req.body
  if (!type || n == null || r == null || userAnswer == null || correctAnswer == null) {
    return res.status(400).json({ error: '缺少参数' })
  }
  const notation = `${type}(${n}, ${r})`
  const reasonLine = reason ? `\n学生自己觉得出错的原因：${reason}` : ''
  try {
    const content = await callQwen([{
      role: 'user',
      content: `排列组合题：${notation} = ?
正确答案：${correctAnswer}
学生的答案：${userAnswer}${reasonLine}

你是一个聊天式的数学老师，用口语化、面对面的方式点评这个回答。
- 结合学生自己说的原因（如果有），直接指出他哪里想错了
- 用一两句话说清楚正确的计算思路
- 不要用列表，像聊天一样说话，整体100字以内
只输出点评文字，不要JSON格式。`,
    }])
    res.json({ explanation: content.trim() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const IDIOM_CATEGORIES = ['褒贬误用', '对象误用', '望文生义', '语境混淆', '近义混淆']

app.get('/api/idiom/question', async (req, res) => {
  const category = IDIOM_CATEGORIES[Math.floor(Math.random() * IDIOM_CATEGORIES.length)]
  try {
    const content = await callQwen([{
      role: 'user',
      content: `从行测常考成语中，随机选一个属于"${category}"类型的易错成语，要求每次都不同，不要总选同一个。只输出成语本身。
格式要求（严格JSON，不要有多余文字）：
{"word":"成语"}`,
    }])
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/idiom/judge', async (req, res) => {
  const { word, answer } = req.body
  if (!word || !answer) return res.status(400).json({ error: '缺少参数' })
  try {
    const content = await callQwen([{
      role: 'user',
      content: `成语：${word}
学生的回答：${answer}

你是一个严格的语文老师，用口语化方式点评这个回答。
判断标准（必须同时满足才算对）：
1. 答出了这个成语的核心含义（不能只写笼统大意或近义词替换）
2. 答出了典型的使用场景或对象（用于什么情境/什么人）
3. 没有明显的误解或方向错误

只要有一条没达到就判错，不要因为"方向对"或"差不多"就判对。

点评方式：如果答错了，直接说"你是不是以为……其实……"，指出最关键的误区，再用一两句说清楚正确含义和用法；如果答对了，简单肯定并补充一个容易混淆的词。不要用列表，像聊天一样说话，整体100字以内。

格式要求（严格JSON，不要有多余文字）：
{"correct":true或false,"feedback":"你的点评"}`,
    }])
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    if (json.correct) earnPoints(0.5, '成语辨析答对')
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function callQwenVL(prompt, base64Image) {
  return new Promise((resolve, reject) => {
    const messages = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
        { type: 'text', text: prompt },
      ],
    }]
    const body = JSON.stringify({ model: 'qwen-vl-plus', messages, max_tokens: 1000 })
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

const EXAM_EXTRACT_PROMPT = `请从这道行测题中提取以下信息，严格按JSON格式输出，不要有多余文字：
{"stem":"题干（不含选项）","options":"A. … B. … C. … D. …（如果有选项）","answer":"正确答案，如A","explanation":"解析内容"}`

const CHANGSHI_EXTRACT_PROMPT = `请从这道常识题中提取信息，并丰富解析内容，严格按JSON格式输出，不要有多余文字：
{"stem":"题干（不含选项）","options":"A. … B. … C. … D. …（如果有选项）","answer":"正确答案，如A","explanation":"解析要求：①先说清楚为什么是这个答案——给出背景、原因、事件来龙去脉；②再补充1-2个帮助记忆的联想或规律，比如时间节点的故事背景、对比记忆法、关键词联想等；③语言口语化自然，整体150字以内。"}`

app.post('/api/exam/extract', async (req, res) => {
  const { text, image } = req.body
  if (!text && !image) return res.status(400).json({ error: '请提供文字或图片' })
  try {
    let content
    if (image) {
      content = await callQwenVL(EXAM_EXTRACT_PROMPT, image)
    } else {
      content = await callQwen([{ role: 'user', content: `${EXAM_EXTRACT_PROMPT}\n\n题目内容：\n${text}` }])
    }
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const MATH_BANK_FILE = path.join(DATA_DIR, 'question_bank.json')
const IDIOM_BANK_FILE = path.join(DATA_DIR, 'idiom_bank.json')
const JUDGEMENT_BANK_FILE = path.join(DATA_DIR, 'judgement_bank.json')
const ANALYSIS_BANK_FILE = path.join(DATA_DIR, 'analysis_bank.json')
const CHANGSHI_BANK_FILE = path.join(DATA_DIR, 'changshi_bank.json')
const POINTS_FILE = path.join(DATA_DIR, 'points.json')

function readPoints() {
  try { return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8')) } catch { return { balance: 0, history: [] } }
}

function writePoints(data) {
  fs.writeFileSync(POINTS_FILE, JSON.stringify(data, null, 2))
}

function earnPoints(amount, reason) {
  const data = readPoints()
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type: 'earn', amount, reason, date: Date.now() }
  data.balance = Math.round((data.balance + amount) * 100) / 100
  data.history.unshift(entry)
  writePoints(data)
}

function readBank(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] }
}

function writeBank(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

// 数量关系题库
app.get('/api/bank/math/random', (req, res) => {
  const bank = readBank(MATH_BANK_FILE)
  if (bank.length === 0) return res.status(404).json({ error: '题库为空，请先上传题目' })
  res.json(bank[Math.floor(Math.random() * bank.length)])
})

app.post('/api/bank/math', async (req, res) => {
  const { text, image } = req.body
  if (!text && !image) return res.status(400).json({ error: '请提供文字或图片' })
  try {
    let content
    if (image) {
      content = await callQwenVL(EXAM_EXTRACT_PROMPT, image)
    } else {
      content = await callQwen([{ role: 'user', content: `${EXAM_EXTRACT_PROMPT}\n\n题目内容：\n${text}` }])
    }
    const extracted = JSON.parse(content.trim().replace(/```json|```/g, ''))
    const bank = readBank(MATH_BANK_FILE)
    const newItem = { id: `${Date.now()}`, ...extracted, reviews: [] }
    bank.push(newItem)
    writeBank(MATH_BANK_FILE, bank)
    earnPoints(1, '录入数量关系题')
    res.json(newItem)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/bank/math/:id/review', (req, res) => {
  const bank = readBank(MATH_BANK_FILE)
  const item = bank.find(q => q.id === req.params.id)
  if (!item) return res.status(404).json({ error: '题目不存在' })
  if (!item.reviews) item.reviews = []
  item.reviews.push({ date: Date.now(), userAnswer: req.body.userAnswer })
  writeBank(MATH_BANK_FILE, bank)
  res.json({ ok: true })
})

// 成语题库
app.get('/api/bank/idiom/random', (req, res) => {
  const bank = readBank(IDIOM_BANK_FILE)
  if (bank.length === 0) return res.status(404).json({ error: '题库为空，请先上传题目' })
  res.json(bank[Math.floor(Math.random() * bank.length)])
})

app.post('/api/bank/idiom', async (req, res) => {
  const { text, image } = req.body
  if (!text && !image) return res.status(400).json({ error: '请提供文字或图片' })
  try {
    const IDIOM_EXTRACT_PROMPT = `请从这道成语题中提取信息，严格按JSON格式输出，不要有多余文字：
{"word":"成语","stem":"题干或语境","answer":"正确答案或含义","explanation":"解析"}`
    let content
    if (image) {
      content = await callQwenVL(IDIOM_EXTRACT_PROMPT, image)
    } else {
      content = await callQwen([{ role: 'user', content: `${IDIOM_EXTRACT_PROMPT}\n\n题目内容：\n${text}` }])
    }
    const extracted = JSON.parse(content.trim().replace(/```json|```/g, ''))
    const bank = readBank(IDIOM_BANK_FILE)
    const newItem = { id: `${Date.now()}`, ...extracted, reviews: [] }
    bank.push(newItem)
    writeBank(IDIOM_BANK_FILE, bank)
    earnPoints(1, '录入成语')
    res.json(newItem)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/bank/idiom/:id/review', (req, res) => {
  const bank = readBank(IDIOM_BANK_FILE)
  const item = bank.find(q => q.id === req.params.id)
  if (!item) return res.status(404).json({ error: '题目不存在' })
  if (!item.reviews) item.reviews = []
  item.reviews.push({ date: Date.now(), userAnswer: req.body.userAnswer, feedback: req.body.feedback })
  writeBank(IDIOM_BANK_FILE, bank)
  res.json({ ok: true })
})

app.get('/api/bank/idiom', (req, res) => {
  res.json(readBank(IDIOM_BANK_FILE))
})

app.get('/api/bank/math', (req, res) => {
  res.json(readBank(MATH_BANK_FILE))
})

// ——— 通用题库工厂（判断推理 / 资料分析）———
function makeExamBankRoutes(prefix, file, extractPrompt = EXAM_EXTRACT_PROMPT, judgeConfig = null) {
  app.get(`/api/bank/${prefix}/random`, (req, res) => {
    const bank = readBank(file)
    if (bank.length === 0) return res.status(404).json({ error: '题库为空，请先上传题目' })
    res.json(bank[Math.floor(Math.random() * bank.length)])
  })

  app.get(`/api/bank/${prefix}`, (req, res) => {
    res.json(readBank(file))
  })

  app.post(`/api/bank/${prefix}`, async (req, res) => {
    const { text, image } = req.body
    if (!text && !image) return res.status(400).json({ error: '请提供文字或图片' })
    try {
      let content
      if (image) {
        content = await callQwenVL(extractPrompt, image)
      } else {
        content = await callQwen([{ role: 'user', content: `${extractPrompt}\n\n题目内容：\n${text}` }])
      }
      const extracted = JSON.parse(content.trim().replace(/```json|```/g, ''))
      const bank = readBank(file)
      const newItem = { id: `${Date.now()}`, ...extracted, reviews: [] }
      bank.push(newItem)
      writeBank(file, bank)
      const subjectName = { judgement: '判断推理', analysis: '资料分析', changshi: '常识' }[prefix] || prefix
      const uploadPoints = prefix === 'changshi' ? 0.5 : 1
      if (!req.body.silent) earnPoints(uploadPoints, `录入${subjectName}题`)
      res.json(newItem)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.patch(`/api/bank/${prefix}/:id/review`, (req, res) => {
    const bank = readBank(file)
    const item = bank.find(q => q.id === req.params.id)
    if (!item) return res.status(404).json({ error: '题目不存在' })
    if (!item.reviews) item.reviews = []
    item.reviews.push({ date: Date.now(), userAnswer: req.body.userAnswer })
    writeBank(file, bank)
    res.json({ ok: true })
  })

  app.delete(`/api/bank/${prefix}/:id/reviews/:index`, (req, res) => {
    const bank = readBank(file)
    const idx = bank.findIndex(q => q.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: '题目不存在' })
    const ri = parseInt(req.params.index)
    if (!Array.isArray(bank[idx].reviews) || ri < 0 || ri >= bank[idx].reviews.length) {
      return res.status(404).json({ error: '记录不存在' })
    }
    bank[idx].reviews.splice(ri, 1)
    writeBank(file, bank)
    res.json(bank[idx])
  })

  app.put(`/api/bank/${prefix}/:id`, (req, res) => {
    const bank = readBank(file)
    const idx = bank.findIndex(q => q.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: '题目不存在' })
    const { stem, options, answer, explanation } = req.body
    if (stem != null) bank[idx].stem = stem
    if (options != null) bank[idx].options = options
    if (answer != null) bank[idx].answer = answer
    if (explanation != null) bank[idx].explanation = explanation
    writeBank(file, bank)
    res.json(bank[idx])
  })

  app.delete(`/api/bank/${prefix}/:id`, (req, res) => {
    const bank = readBank(file)
    const filtered = bank.filter(q => q.id !== req.params.id)
    if (filtered.length === bank.length) return res.status(404).json({ error: '题目不存在' })
    writeBank(file, filtered)
    res.json({ ok: true })
  })

  if (judgeConfig) {
    app.post(`/api/bank/${prefix}/judge`, async (req, res) => {
      const { stem, userAnswer, correctAnswer, explanation } = req.body
      if (!stem || !userAnswer) return res.status(400).json({ error: '缺少参数' })
      try {
        const content = await callQwen([{
          role: 'user',
          content: `题目：${stem}
参考答案：${correctAnswer}
学生回答：${userAnswer}
背景解析：${explanation || ''}

你是一个严格的常识老师。判断标准：学生回答必须与参考答案高度吻合——核心知识点要答到位，方向偏差、答案不完整、只说大概意思都算错。先说"答对了"或"答错了"，再用一两句话点出关键或纠错，答对了顺带补充一个记忆要点。整体80字以内，像聊天一样说话，不用列表。
格式（严格JSON，不要有多余文字）：{"correct":true或false,"feedback":"点评"}`,
        }])
        const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
        if (json.correct) earnPoints(judgeConfig.answerPoints, `${judgeConfig.subjectName}答对`)
        res.json(json)
      } catch (e) {
        res.status(500).json({ error: e.message })
      }
    })
  }
}

makeExamBankRoutes('judgement', JUDGEMENT_BANK_FILE)
makeExamBankRoutes('analysis', ANALYSIS_BANK_FILE)
makeExamBankRoutes('changshi', CHANGSHI_BANK_FILE, CHANGSHI_EXTRACT_PROMPT, { answerPoints: 0.5, subjectName: '常识' })

// 编辑/删除接口
app.put('/api/bank/math/:id', (req, res) => {
  const bank = readBank(MATH_BANK_FILE)
  const idx = bank.findIndex(q => q.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: '题目不存在' })
  const { stem, options, answer, explanation } = req.body
  if (stem != null) bank[idx].stem = stem
  if (options != null) bank[idx].options = options
  if (answer != null) bank[idx].answer = answer
  if (explanation != null) bank[idx].explanation = explanation
  writeBank(MATH_BANK_FILE, bank)
  res.json(bank[idx])
})

app.delete('/api/bank/math/:id', (req, res) => {
  const bank = readBank(MATH_BANK_FILE)
  const filtered = bank.filter(q => q.id !== req.params.id)
  if (filtered.length === bank.length) return res.status(404).json({ error: '题目不存在' })
  writeBank(MATH_BANK_FILE, filtered)
  res.json({ ok: true })
})

app.put('/api/bank/idiom/:id', (req, res) => {
  const bank = readBank(IDIOM_BANK_FILE)
  const idx = bank.findIndex(q => q.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: '题目不存在' })
  const { word, answer, explanation } = req.body
  if (word != null) bank[idx].word = word
  if (answer != null) bank[idx].answer = answer
  if (explanation != null) bank[idx].explanation = explanation
  writeBank(IDIOM_BANK_FILE, bank)
  res.json(bank[idx])
})

app.delete('/api/bank/idiom/:id/reviews/:index', (req, res) => {
  const bank = readBank(IDIOM_BANK_FILE)
  const idx = bank.findIndex(q => q.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: '题目不存在' })
  const ri = parseInt(req.params.index)
  if (!Array.isArray(bank[idx].reviews) || ri < 0 || ri >= bank[idx].reviews.length) {
    return res.status(404).json({ error: '记录不存在' })
  }
  bank[idx].reviews.splice(ri, 1)
  writeBank(IDIOM_BANK_FILE, bank)
  res.json(bank[idx])
})

app.delete('/api/bank/idiom/:id', (req, res) => {
  const bank = readBank(IDIOM_BANK_FILE)
  const filtered = bank.filter(q => q.id !== req.params.id)
  if (filtered.length === bank.length) return res.status(404).json({ error: '题目不存在' })
  writeBank(IDIOM_BANK_FILE, filtered)
  res.json({ ok: true })
})

// 积分接口
app.get('/api/points', (req, res) => {
  res.json(readPoints())
})

app.post('/api/points/earn', (req, res) => {
  const { amount, reason } = req.body
  if (!amount || !reason) return res.status(400).json({ error: '缺少参数' })
  earnPoints(amount, reason)
  res.json(readPoints())
})

app.post('/api/points/redeem', (req, res) => {
  const { amount, reason, image, link } = req.body
  if (!amount || !reason) return res.status(400).json({ error: '缺少参数' })
  const data = readPoints()
  if (amount > data.balance) return res.status(400).json({ error: '余额不足' })
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type: 'redeem', amount, reason, date: Date.now() }
  if (image) entry.image = image
  if (link) entry.link = link
  data.balance = Math.round((data.balance - amount) * 100) / 100
  data.history.unshift(entry)
  writePoints(data)
  res.json(data)
})

app.delete('/api/points/history/:id', (req, res) => {
  const data = readPoints()
  const filtered = data.history.filter(h => h.id !== req.params.id)
  if (filtered.length === data.history.length) return res.status(404).json({ error: '记录不存在' })
  // 如果删的是 earn 记录，还原余额
  const deleted = data.history.find(h => h.id === req.params.id)
  if (deleted.type === 'earn') {
    data.balance = Math.round((data.balance - deleted.amount) * 100) / 100
  } else {
    data.balance = Math.round((data.balance + deleted.amount) * 100) / 100
  }
  data.history = filtered
  writePoints(data)
  res.json(data)
})

app.delete('/api/wrong-answers/:id', (req, res) => {
  const list = readData()
  const filtered = list.filter(r => r.id !== req.params.id)
  if (filtered.length === list.length) return res.status(404).json({ error: '记录不存在' })
  writeData(filtered)
  res.json({ ok: true })
})

// ——— 申论模块 ———
const SHENLUN_BANK_FILE = path.join(DATA_DIR, 'shenlun_bank.json')

function readShenlun() {
  try { return JSON.parse(fs.readFileSync(SHENLUN_BANK_FILE, 'utf8')) } catch { return [] }
}
function writeShenlun(data) {
  fs.writeFileSync(SHENLUN_BANK_FILE, JSON.stringify(data, null, 2))
}

app.post('/api/shenlun/topic', async (req, res) => {
  try {
    const content = await callQwen([{
      role: 'user',
      content: `你是申论出题老师。请随机生成一道申论大作文题目，要求：
- 主题贴近国考/省考真题风格（如：乡村振兴、数字经济、基层治理、生态文明、科技创新等）
- 每次题目不同，不要重复
- 只输出题目本身，不要解析，不要提示词
- 题目长度50-100字，包含背景材料和写作要求

格式要求（严格JSON，不要有多余文字）：
{"topic":"题目内容"}`,
    }])
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/shenlun/judge', async (req, res) => {
  const { topic, title, intro, points, conclusion } = req.body
  if (!topic || !title || !intro || !points || !conclusion) {
    return res.status(400).json({ error: '缺少参数' })
  }
  const pointsText = points.map((p, i) =>
    `分论点${i + 1}：${p.claim}\n论证${i + 1}：${p.argument}`
  ).join('\n')
  const essay = `标题：${title}\n首段：${intro}\n${pointsText}\n尾段：${conclusion}`
  try {
    const content = await callQwen([{
      role: 'user',
      content: `你是一位严格的申论阅卷老师。请对以下申论大作文进行批改。

题目：${topic}

学生作文：
${essay}

批改要求：
- 满分10分，客观给分，不要虚高
- 重点考察：主题切合度、论点清晰度、论证有力性、结构完整性、语言表达
- feedback 用口语化方式指出主要优点和不足，200字以内
- exemplar 提供一篇含金句的范文，金句可以是：古语、习近平总书记的话、典型案例开头、排比句等；范文600字左右，结构与题目要求对应

格式要求（严格JSON，不要有多余文字）：
{"score":数字,"feedback":"批改意见","exemplar":"范文内容"}`,
    }])
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    const pts = Math.round(json.score * 0.5 * 10) / 10
    earnPoints(pts, `申论练习得${json.score}分`)
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/shenlun/save', (req, res) => {
  const { topic, title, intro, points, conclusion, score, aiFeedback, exemplar } = req.body
  if (!topic) return res.status(400).json({ error: '缺少题目' })
  const bank = readShenlun()
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    topic, title, intro, points, conclusion, score, aiFeedback, exemplar,
    date: Date.now(),
  }
  bank.unshift(item)
  writeShenlun(bank)
  res.json({ ok: true })
})

// 生产环境：服务 Vite 打包好的前端静态文件
const FRONTEND_DIST = path.join(__dirname, '../dist')
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST))
  // 所有非 API 路由返回 index.html（支持前端路由）
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
