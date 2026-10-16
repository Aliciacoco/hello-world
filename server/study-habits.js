const fs = require('fs')
const path = require('path')

function beijingDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}

function isWeekday(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day >= 1 && day <= 5
}

function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}

function attachStudyHabits(app, { dataDir, now = () => new Date() }) {
  const file = path.join(dataDir, 'study_habits.json')
  const pointsFile = path.join(dataDir, 'points.json')
  // A stable transaction ID makes retries safe if the check-in write fails after points are saved.
  function award(date, kind) {
    const points = fs.existsSync(pointsFile)
      ? JSON.parse(fs.readFileSync(pointsFile, 'utf8')) : { balance: 0, history: [] }
    if (!Number.isFinite(points.balance) || !Array.isArray(points.history)) throw new Error('积分数据格式异常')
    const id = `habit:${date}:${kind}`
    if (points.history.some(entry => entry.id === id)) return { amount: 0, balance: points.balance }
    points.balance = Math.round((points.balance + 20) * 100) / 100
    points.history.unshift({
      id, type: 'earn', amount: 20,
      reason: `${date} ${kind === 'study' ? '晨学' : '睡前'}打卡奖励`, date: now().getTime(),
    })
    fs.writeFileSync(`${pointsFile}.tmp`, JSON.stringify(points, null, 2))
    fs.renameSync(`${pointsFile}.tmp`, pointsFile)
    return { amount: 20, balance: points.balance }
  }
  function read() {
    if (!fs.existsSync(file)) return {}
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('打卡数据格式异常')
    return data
  }
  const route = handler => (req, res) => {
    try { handler(req, res) } catch (error) {
      console.error('[study-habits]', error.message)
      res.status(500).json({ error: '打卡数据读取或保存失败，请重试' })
    }
  }
  app.get('/api/habits', route((req, res) => {
    res.set('Cache-Control', 'no-store').json({ today: beijingDate(now()), records: read() })
  }))
  app.put('/api/habits/:date', route((req, res) => {
    const date = req.params.date
    if (!validDate(date) || date > beijingDate(now())) {
      return res.status(400).json({ error: '请选择今天或过去的有效日期' })
    }
    const { studyCompleted, minutes, summary, bedtime } = req.body || {}
    if (typeof studyCompleted !== 'boolean' || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440
      || typeof summary !== 'string' || summary.length > 5000
      || !(bedtime === '' || (typeof bedtime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(bedtime)))) {
      return res.status(400).json({ error: '请检查学习时长、小结（最多 5000 字）和就寝时间' })
    }
    if (studyCompleted && (!isWeekday(date) || minutes < 60 || !summary.trim())) {
      return res.status(400).json({ error: '晨学打卡限周一至周五，请确认学习满 60 分钟并填写小结' })
    }
    const data = read()
    const previous = data[date] || {}
    let earned = 0
    let balance
    const rewards = { study: !!previous.rewards?.study, sleep: !!previous.rewards?.sleep }
    for (const kind of ['study', 'sleep']) {
      const newlyCompleted = kind === 'study'
        ? studyCompleted && !previous.studyCompleted : !!bedtime && !previous.bedtime
      if (newlyCompleted && !rewards[kind]) {
        const result = award(date, kind)
        earned += result.amount
        balance = result.balance
        rewards[kind] = true
      }
    }
    data[date] = {
      date, studyCompleted, minutes, summary, bedtime, rewards,
      completedAt: studyCompleted ? previous.completedAt || now().toISOString() : null,
      updatedAt: now().toISOString(),
    }
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2))
    fs.renameSync(`${file}.tmp`, file)
    res.json({ ...data[date], _pts: earned, ...(balance !== undefined ? { _balance: balance } : {}) })
  }))
}

module.exports = { attachStudyHabits, beijingDate, isWeekday }
