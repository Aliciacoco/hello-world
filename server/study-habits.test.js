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
