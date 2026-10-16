const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const express = require('express')
const { attachStudyHabits, beijingDate } = require('./study-habits')

async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-habits-test-'))
  const app = express()
  app.use(express.json())
  attachStudyHabits(app, { dataDir, now: () => new Date('2026-10-16T23:30:00+08:00') })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(dataDir, { recursive: true, force: true })
  })
  return {
    dataDir,
    get: async () => (await fetch(`${origin}/api/habits`)).json(),
    put: async (date, data) => {
      const res = await fetch(`${origin}/api/habits/${date}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      return { status: res.status, data: await res.json() }
    },
  }
}
const entry = { studyCompleted: true, minutes: 60, summary: '今天练习了排列组合，明天继续错题。', bedtime: '21:55' }

test('Beijing date uses the correct day around midnight', () => {
  assert.equal(beijingDate(new Date('2026-10-15T16:00:00Z')), '2026-10-16')
  assert.equal(beijingDate(new Date('2026-10-15T15:59:59Z')), '2026-10-15')
})

test('study completion, editable summary and sleep record survive reload without duplicating a date', async t => {
  const f = await fixture(t)
  assert.deepEqual(await f.get(), { today: '2026-10-16', records: {} })
  const first = await f.put('2026-10-16', entry)
  assert.equal(first.status, 200)
  const edited = await f.put('2026-10-16', { ...entry, summary: '修改后的小结', bedtime: '22:15' })
  assert.equal(edited.data.completedAt, first.data.completedAt)
  const loaded = await f.get()
  assert.equal(Object.keys(loaded.records).length, 1)
  assert.equal(loaded.records['2026-10-16'].summary, '修改后的小结')
  assert.equal(loaded.records['2026-10-16'].bedtime, '22:15')
  const stored = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'study_habits.json'), 'utf8'))
  assert.deepEqual(stored, loaded.records)
  assert.equal((await f.put('2026-10-16', { ...entry, studyCompleted: false })).data.completedAt, null)
})

test('reject invalid/future dates and incomplete study, allow weekend sleep and past summaries', async t => {
  const f = await fixture(t)
  for (const date of ['2026-02-30', '2026-10-17', 'invalid']) {
    assert.equal((await f.put(date, entry)).status, 400)
  }
  for (const patch of [{ minutes: 59 }, { minutes: -1 }, { minutes: 60.5 }, { summary: '  ' }, { summary: 'x'.repeat(5001) }, { bedtime: '25:00' }]) {
    assert.equal((await f.put('2026-10-16', { ...entry, ...patch })).status, 400)
  }
  assert.equal((await f.put('2026-10-11', entry)).status, 400)
  assert.equal((await f.put('2026-10-11', { ...entry, studyCompleted: false, minutes: 0, summary: '' })).status, 200)
  assert.equal((await f.put('2026-10-15', entry)).status, 200)
})

test('damaged data fails visibly and is never replaced by a new check-in', async t => {
  const f = await fixture(t)
  const file = path.join(f.dataDir, 'study_habits.json')
  fs.writeFileSync(file, '{damaged')
  assert.equal((await f.put('2026-10-16', entry)).status, 500)
  assert.equal(fs.readFileSync(file, 'utf8'), '{damaged')
})

test('morning and bedtime each award 20, and retries, edits and re-check-ins never award twice', async t => {
  const f = await fixture(t)
  const pointsFile = path.join(f.dataDir, 'points.json')
  fs.writeFileSync(pointsFile, JSON.stringify({ balance: 3.5, history: [] }))
  const morning = await f.put('2026-10-16', { ...entry, bedtime: '', rewards: { study: false, sleep: false } })
  assert.equal(morning.data._pts, 20)
  assert.equal(morning.data._balance, 23.5)
  const evening = await f.put('2026-10-16', entry)
  assert.equal(evening.data._pts, 20)
  assert.equal(evening.data._balance, 43.5)
  const repeated = await Promise.all(Array.from({ length: 5 }, () => f.put('2026-10-16', { ...entry, summary: '改了一下小结' })))
  assert.ok(repeated.every(result => result.data._pts === 0))
  await f.put('2026-10-16', { ...entry, studyCompleted: false, bedtime: '' })
  assert.equal((await f.put('2026-10-16', entry)).data._pts, 0)
  let points = JSON.parse(fs.readFileSync(pointsFile, 'utf8'))
  assert.equal(points.balance, 43.5)
  assert.equal(points.history.length, 2)
  assert.match(points.history[0].reason, /睡前打卡奖励/)
  assert.match(points.history[1].reason, /晨学打卡奖励/)
  // Removing a ledger entry must not clear a reward already claimed for that day.
  fs.writeFileSync(pointsFile, JSON.stringify({ balance: 3.5, history: [] }))
  await f.put('2026-10-16', { ...entry, studyCompleted: false, bedtime: '' })
  assert.equal((await f.put('2026-10-16', entry)).data._pts, 0)
  points = JSON.parse(fs.readFileSync(pointsFile, 'utf8'))
  assert.equal(points.balance, 3.5)
})

test('reward transactions recover safely after a partial write and a different date has separate rewards', async t => {
  const f = await fixture(t)
  const pointsFile = path.join(f.dataDir, 'points.json')
  fs.writeFileSync(pointsFile, JSON.stringify({ balance: 20, history: [
    { id: 'habit:2026-10-16:study', type: 'earn', amount: 20 },
  ] }))
  const recovered = await f.put('2026-10-16', entry)
  assert.equal(recovered.data._pts, 20) // Only bedtime is new.
  assert.equal(recovered.data._balance, 40)
  assert.deepEqual(recovered.data.rewards, { study: true, sleep: true })
  assert.equal((await f.put('2026-10-15', entry)).data._pts, 40)
  const points = JSON.parse(fs.readFileSync(pointsFile, 'utf8'))
  assert.equal(points.balance, 80)
  assert.equal(points.history.length, 4)
})

test('legacy completed records do not earn for summary edits and corrupt points never get overwritten', async t => {
  const f = await fixture(t)
  fs.writeFileSync(path.join(f.dataDir, 'study_habits.json'), JSON.stringify({ '2026-10-16': entry }))
  assert.equal((await f.put('2026-10-16', { ...entry, summary: '修改旧记录' })).data._pts, 0)
  const pointsFile = path.join(f.dataDir, 'points.json')
  fs.writeFileSync(pointsFile, '{broken')
  assert.equal((await f.put('2026-10-15', entry)).status, 500)
  assert.equal(fs.readFileSync(pointsFile, 'utf8'), '{broken')
})
