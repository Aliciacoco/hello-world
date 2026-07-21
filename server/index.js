const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const app = express()
const PORT = process.env.PORT || 3001
// DATA_DIR：Railway 上挂载持久化磁盘时设为磁盘路径（如 /data），本地留空用 __dirname
const DATA_DIR = process.env.DATA_DIR || __dirname
const DB_FILE = path.join(DATA_DIR, 'wrong_answers.json')
const QWEN_API_KEY = process.env.QWEN_API_KEY || 'sk-f69ceab683b54d8aaee09f19b947e38f'
// 十章图集生成的插画：下载后落盘存本地，THEME_IMAGE_MAP_FILE 记录 "人物序号-章节序号" -> 图片URL 的映射，
// 避免依赖通义千问返回的临时链接（会过期），也避免每次都重新生成同一张图。
const THEME_IMAGES_DIR = path.join(DATA_DIR, 'theme-images')
const THEME_IMAGE_MAP_FILE = path.join(DATA_DIR, 'theme_images.json')
if (!fs.existsSync(THEME_IMAGES_DIR)) fs.mkdirSync(THEME_IMAGES_DIR, { recursive: true })

const EXPLORE_DATA_FILE = path.join(DATA_DIR, 'explore_data.json')
const EXPLORE_IMAGES_DIR = path.join(DATA_DIR, 'explore-images')
if (!fs.existsSync(EXPLORE_IMAGES_DIR)) fs.mkdirSync(EXPLORE_IMAGES_DIR, { recursive: true })

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

function callQwen(messages, maxTokens = 800) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'qwen-plus',
      messages,
      max_tokens: maxTokens,
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
  const { word, answer, id } = req.body
  if (!word || !answer) return res.status(400).json({ error: 'missing params' })

  let stdAnswer = ''
  let stdExplanation = ''
  if (id) {
    const bank = readBank(IDIOM_BANK_FILE)
    const item = bank.find(q => String(q.id) === String(id))
    if (item) {
      stdAnswer = item.answer || ''
      stdExplanation = item.explanation || ''
    }
  }

  const referenceText = [stdAnswer, stdExplanation].filter(Boolean).join('\n')
  try {
    const content = await callQwen([{
      role: 'user',
      content: `成语：${word}
参考答案：${stdAnswer || '（无）'}
参考解析：${stdExplanation || '（无）'}
学生回答：${answer}

你是一个随和的成语老师。判断原则：以参考答案为准，学生答出了核心含义就算对，不要求措辞与参考完全一致；只有答错了方向、望文生义或完全偏离才算错，表述不够完整但方向对也可以给对。不要自己发明含义，严格按参考答案评判。先说"答对了"或"答错了"，再一两句话点出关键或纠错，80字以内，聊天语气，不用列表。
格式（严格JSON，不要有多余文字）：{"correct":true或false,"feedback":"点评"}`,
    }])
    const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
    let newBalance = null
    if (json.correct) newBalance = earnPoints(0.5, 'idiom correct')
    res.json({
      ...json,
      feedback: json.feedback || '',
      referenceAnswer: stdAnswer || referenceText || word,
      referenceExplanation: stdExplanation || '',
      _pts: json.correct ? 0.5 : undefined,
      _balance: newBalance,
    })
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


function dashscopeRequest(pathname, method, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : ''
    const req = https.request({
      hostname: 'dashscope.aliyuncs.com',
      path: pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`,
        'X-DashScope-Async': 'enable',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {}
          if (res.statusCode >= 400) {
            reject(new Error(json.message || json.code || `DashScope ${res.statusCode}`))
            return
          }
          resolve(json)
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readThemeImageMap() {
  try { return JSON.parse(fs.readFileSync(THEME_IMAGE_MAP_FILE, 'utf8')) } catch { return {} }
}

function writeThemeImageMap(map) {
  fs.writeFileSync(THEME_IMAGE_MAP_FILE, JSON.stringify(map, null, 2))
}

function isValidThemeImageFile(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size < 128) return false
    const fd = fs.openSync(filePath, 'r')
    const header = Buffer.alloc(12)
    fs.readSync(fd, header, 0, header.length, 0)
    fs.closeSync(fd)
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
    const isPng = header.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const isWebp = header.slice(0, 4).toString('ascii') === 'RIFF' && header.slice(8, 12).toString('ascii') === 'WEBP'
    return isJpeg || isPng || isWebp
  } catch {
    return false
  }
}

function getCachedThemeImagePath(cachedUrl) {
  if (!cachedUrl || !cachedUrl.startsWith('/theme-images/')) return null
  const filename = path.basename(cachedUrl)
  return path.join(THEME_IMAGES_DIR, filename)
}

function removeThemeImageCache(map, cacheKey) {
  const cachedPath = getCachedThemeImagePath(map[cacheKey])
  if (cachedPath) fs.unlink(cachedPath, () => {})
  delete map[cacheKey]
  writeThemeImageMap(map)
}

function downloadImage(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('图片下载重定向次数过多'))
      return
    }

    let parsed
    try {
      parsed = new URL(url)
    } catch {
      reject(new Error('图片下载地址无效'))
      return
    }
    const client = parsed.protocol === 'http:' ? http : https
    const request = client.get(parsed, (res) => {
      const statusCode = res.statusCode || 0
      const location = res.headers.location
      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume()
        const nextUrl = new URL(location, parsed).toString()
        downloadImage(nextUrl, destPath, redirectCount + 1).then(resolve).catch(reject)
        return
      }

      if (statusCode >= 400) {
        res.resume()
        reject(new Error(`图片下载失败: ${statusCode}`))
        return
      }

      const contentType = String(res.headers['content-type'] || '')
      if (contentType && !contentType.startsWith('image/')) {
        res.resume()
        reject(new Error(`图片下载返回了非图片内容: ${contentType}`))
        return
      }

      const tempPath = `${destPath}.tmp-${Date.now()}`
      const file = fs.createWriteStream(tempPath)
      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          if (!isValidThemeImageFile(tempPath)) {
            fs.unlink(tempPath, () => {})
            reject(new Error('图片文件无效'))
            return
          }
          fs.rename(tempPath, destPath, err => {
            if (err) reject(err)
            else resolve()
          })
        })
      })
      file.on('error', (err) => { fs.unlink(tempPath, () => {}); reject(err) })
    })
    request.on('error', reject)
    request.setTimeout(60000, () => {
      request.destroy(new Error('图片下载超时'))
    })
  })
}

async function generateThemeImage({ figure, chapter, fact, importance, detail, visual }) {
  const prompt = `高质量历史绘本插画，中国宋代背景，细腻线稿，柔和淡彩，宣纸质感，色彩低饱和。人物：${figure}。章节：${chapter}。史实依据：${fact}。必须按这个具体画面来画：${visual || ''}。如果没有具体画面，则让人物处在与该历史节点直接相关的地点，正在进行能体现事件的具体动作，并加入可识别事件的物件或环境。人物神情克制，服饰朴素，构图有留白。不要写实照片感，不要影视剧海报感，不要卡通萌化，不要近距离大头照，不要现代物品，不要画面文字，不要两个人站着摆拍，不要通用古装人物肖像，不要与章节无关的山水背景。辅助理解：${detail || importance}`
  const create = await dashscopeRequest('/api/v1/services/aigc/text2image/image-synthesis', 'POST', {
    model: 'wanx2.1-t2i-turbo',
    input: { prompt },
    parameters: {
      size: '1024*1024',
      n: 1,
    },
  })
  const taskId = create.output?.task_id
  if (!taskId) throw new Error('missing image task id')

  for (let i = 0; i < 18; i++) {
    await sleep(2500)
    const task = await dashscopeRequest(`/api/v1/tasks/${taskId}`, 'GET')
    const status = task.output?.task_status
    if (status === 'SUCCEEDED') {
      const url = task.output?.results?.[0]?.url
      if (!url) throw new Error('missing generated image url')
      return url
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(task.output?.message || 'image generation failed')
    }
  }
  throw new Error('image generation timeout')
}

// ——— 探索功能辅助 ———
function readExploreData() {
  try {
    const data = JSON.parse(fs.readFileSync(EXPLORE_DATA_FILE, 'utf8'))
    // 迁移旧格式 URL：/explore-images/ → /api/explore-images/
    // 旧数据里图片文件本身还在，只是 URL 前缀需要更新
    if (data.current?.scenes) {
      let changed = false
      Object.values(data.current.scenes).forEach(scene => {
        if (scene.imageUrl && scene.imageUrl.startsWith('/explore-images/')) {
          scene.imageUrl = '/api/explore-images/' + scene.imageUrl.slice('/explore-images/'.length)
          changed = true
        }
      })
      if (changed) fs.writeFileSync(EXPLORE_DATA_FILE, JSON.stringify(data, null, 2))
    }
    return data
  } catch { return {} }
}
function writeExploreData(data) {
  fs.writeFileSync(EXPLORE_DATA_FILE, JSON.stringify(data, null, 2))
}
function calcNextThreshold(balance) {
  // 向上取到下一个10的倍数：35→40, 40→50, 0→10
  return Math.floor(balance / 10) * 10 + 10
}
function getTodayStr() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
function parseJsonSafe(text) {
  try { return JSON.parse(text.trim().replace(/```json|```/g, '')) } catch { return null }
}
// 根据提示词生成图片并保存到本地路径（供 explore 功能使用）
async function generateImageFromPrompt(prompt, destPath) {
  const create = await dashscopeRequest('/api/v1/services/aigc/text2image/image-synthesis', 'POST', {
    model: 'wanx2.1-t2i-turbo',
    input: { prompt },
    parameters: { size: '1024*1024', n: 1 },
  })
  const taskId = create.output?.task_id
  if (!taskId) throw new Error('missing image task id')
  for (let i = 0; i < 18; i++) {
    await sleep(2500)
    const task = await dashscopeRequest(`/api/v1/tasks/${taskId}`, 'GET')
    const status = task.output?.task_status
    if (status === 'SUCCEEDED') {
      const url = task.output?.results?.[0]?.url
      if (!url) throw new Error('missing generated image url')
      await downloadImage(url, destPath)
      return
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(task.output?.message || 'image generation failed')
    }
  }
  throw new Error('image generation timeout')
}

app.post('/api/theme-image', async (req, res) => {
  const { figure, chapter, fact, importance, detail, visual, figureIndex, chapterIndex } = req.body
  if (!figure || !chapter || !fact) return res.status(400).json({ error: 'missing params' })

  const cacheKey = figureIndex != null && chapterIndex != null ? `${figureIndex}-${chapterIndex}` : null
  if (cacheKey) {
    const map = readThemeImageMap()
    const cached = map[cacheKey]
    const cachedPath = getCachedThemeImagePath(cached)
    if (cachedPath && isValidThemeImageFile(cachedPath)) {
      return res.json({ url: cached })
    }
    if (cached) removeThemeImageCache(map, cacheKey)
  }

  try {
    const remoteUrl = await generateThemeImage({ figure, chapter, fact, importance: importance || '', detail: detail || '', visual: visual || '' })
    let url = remoteUrl
    if (cacheKey) {
      const filename = `${cacheKey}.jpg`
      await downloadImage(remoteUrl, path.join(THEME_IMAGES_DIR, filename))
      url = `/theme-images/${filename}`
      const map = readThemeImageMap()
      map[cacheKey] = url
      writeThemeImageMap(map)
    }
    res.json({ url })
  } catch (e) {
    res.status(500).json({ error: e.message || 'image generation failed' })
  }
})

// 拉取某个人物已经生成好的全部章节插画（{ chapterIndex: url }），供前端水合图集，不再依赖浏览器本地存储
app.get('/api/theme-image/:figureIndex', (req, res) => {
  const map = readThemeImageMap()
  const prefix = `${req.params.figureIndex}-`
  const result = {}
  let changed = false
  Object.keys(map).forEach(key => {
    if (!key.startsWith(prefix)) return
    const imagePath = getCachedThemeImagePath(map[key])
    if (imagePath && isValidThemeImageFile(imagePath)) {
      result[key.slice(prefix.length)] = map[key]
    } else {
      delete map[key]
      changed = true
    }
  })
  if (changed) writeThemeImageMap(map)
  res.json(result)
})

app.use('/theme-images', express.static(THEME_IMAGES_DIR))
// /explore-images 走 /api/ 前缀，确保 Nginx 代理转发到 Express 而不是被前端 catch-all 拦截
app.get('/api/explore-images/:filename', (req, res) => {
  const filename = path.basename(req.params.filename) // 防路径穿越
  res.sendFile(path.join(EXPLORE_IMAGES_DIR, filename), err => {
    if (err) res.status(404).send('not found')
  })
})

// ——— 每日探索模块 ———
app.post('/api/explore/preview', async (req, res) => {
  const today = getTodayStr()
  try {
    const content = await callQwen([{
      role: 'user',
      content: `今天是${today}。请推荐一位与今日有历史关联的中国历史人物（生卒日、重要事件日、节气相关人物等），每次可以不同，可以随机一些。返回严格JSON，不要有多余文字：
{"figure":"人物姓名","dateContext":"为什么今天和此人有关，1-2句生动有趣的描述","imagePrompt":"英文文生图提示词，中国古风工笔画/水墨画风格，包含人物、具体道具、环境细节，80词以内"}`,
    }], 600)
    const json = parseJsonSafe(content)
    if (!json || !json.figure) return res.status(500).json({ error: 'AI返回格式错误' })
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/explore/confirm', async (req, res) => {
  const allData = readExploreData()
  const { figure, dateContext, imagePrompt } = req.body
  if (!figure || !dateContext) return res.status(400).json({ error: '缺少人物信息' })

  try {
    // 第一步：生成根场景旁白 + 线索坐标
    const sceneContent = await callQwen([{
      role: 'user',
      content: `历史人物：${figure}
背景：${dateContext}

请生成一个这个人物的代表性场景，并在场景中设计3-4个有趣的可探索线索点。线索要和这个人物的生平、著作、事迹相关，位置要分散在画面各处（用百分比表示）。

返回严格JSON，不要有多余文字：
{"narration":"场景旁白，2-3句生动描述当前画面，80字以内","imagePrompt":"英文文生图提示词，中国古风工笔画，具体描述场景中可见的人物、道具、环境，确保线索物品在画面中清晰可见，100词以内","clues":[{"id":"英文小写id（如juhua/nanshan）","name":"线索名称2-4字","x":图片中横向位置百分比数字,"y":图片中纵向位置百分比数字,"hint":"鼠标悬停时显示的一句话，描述这个线索"}]}`,
    }], 800)
    const sceneJson = parseJsonSafe(sceneContent)
    if (!sceneJson || !sceneJson.narration || !Array.isArray(sceneJson.clues)) {
      return res.status(500).json({ error: '场景生成失败，请重试' })
    }

    // 第二步：生成根场景图片（用时间戳做文件名，避免换主题时覆盖旧图）
    const finalPrompt = sceneJson.imagePrompt || imagePrompt || `${figure} in traditional Chinese painting style, ancient setting`
    const filename = `root-${Date.now()}.jpg`
    const destPath = path.join(EXPLORE_IMAGES_DIR, filename)
    await generateImageFromPrompt(finalPrompt, destPath)

    // 第三步：计算首次探索积分门槛
    const pointsData = readPoints()
    const nextThreshold = calcNextThreshold(pointsData.balance)

    // 第四步：构建并保存，覆盖 current（不再按日期锁定）
    const rootScene = {
      id: 'root',
      imageUrl: `/api/explore-images/${filename}`,
      narration: sceneJson.narration,
      clues: sceneJson.clues.map(c => ({
        id: String(c.id),
        name: String(c.name),
        x: Number(c.x),
        y: Number(c.y),
        hint: String(c.hint || ''),
        childSceneId: null,
      })),
    }
    const currentData = {
      figure,
      dateContext,
      nextThreshold,
      explorationCount: 0,
      scenes: { root: rootScene },
    }
    allData.current = currentData
    writeExploreData(allData)
    res.json(currentData)
  } catch (e) {
    res.status(500).json({ error: e.message || '确认失败' })
  }
})

app.get('/api/explore/today', (req, res) => {
  const allData = readExploreData()
  res.json(allData.current || null)
})

app.post('/api/explore/clue', async (req, res) => {
  const { clueId, sceneId } = req.body
  if (!clueId || !sceneId) return res.status(400).json({ error: '缺少参数' })

  const allData = readExploreData()
  const todayData = allData.current
  if (!todayData) return res.status(404).json({ error: '当前没有激活的探索主题' })

  const parentScene = todayData.scenes[sceneId]
  if (!parentScene) return res.status(404).json({ error: '场景不存在' })

  const clue = parentScene.clues.find(c => c.id === clueId)
  if (!clue) return res.status(404).json({ error: '线索不存在' })

  // 检查积分
  const pointsData = readPoints()
  if (pointsData.balance < todayData.nextThreshold) {
    return res.status(403).json({
      error: 'insufficient_points',
      required: todayData.nextThreshold,
      current: pointsData.balance,
    })
  }

  // 子场景已存在，直接返回（不重复生成，不消耗积分门槛）
  if (clue.childSceneId && todayData.scenes[clue.childSceneId]) {
    return res.json({ scene: todayData.scenes[clue.childSceneId], nextThreshold: todayData.nextThreshold })
  }

  // 生成子场景
  try {
    const childContent = await callQwen([{
      role: 'user',
      content: `历史人物：${todayData.figure}
当前场景旁白：${parentScene.narration}
玩家点击了线索「${clue.name}」（${clue.hint}）

请生成探索这个线索后的新场景，深入挖掘线索背后的历史故事和文化内涵。同样要设计3-4个新的可探索线索点。

返回严格JSON，不要有多余文字：
{"narration":"深入探索后的旁白，讲述线索背后的历史故事和文化内涵，150字以内，用讲故事的语气","imagePrompt":"英文文生图提示词，聚焦这个线索相关的具体画面，中国古风工笔画，100词以内","clues":[{"id":"英文小写id","name":"线索名称2-4字","x":数字,"y":数字,"hint":"悬停提示一句话"}]}`,
    }], 900)
    const childJson = parseJsonSafe(childContent)
    if (!childJson || !childJson.narration || !Array.isArray(childJson.clues)) {
      return res.status(500).json({ error: '子场景生成失败' })
    }

    // 生成图片（时间戳文件名）
    const childId = `${clueId}-${Date.now()}`
    const filename = `${childId}.jpg`
    const destPath = path.join(EXPLORE_IMAGES_DIR, filename)
    await generateImageFromPrompt(childJson.imagePrompt, destPath)

    const childScene = {
      id: childId,
      imageUrl: `/api/explore-images/${filename}`,
      narration: childJson.narration,
      clues: childJson.clues.map(c => ({
        id: String(c.id),
        name: String(c.name),
        x: Number(c.x),
        y: Number(c.y),
        hint: String(c.hint || ''),
        childSceneId: null,
      })),
    }

    // 更新数据
    clue.childSceneId = childId
    todayData.scenes[childId] = childScene
    todayData.nextThreshold += 10
    todayData.explorationCount += 1
    allData.current = todayData
    writeExploreData(allData)

    res.json({ scene: childScene, nextThreshold: todayData.nextThreshold })
  } catch (e) {
    res.status(500).json({ error: e.message || '探索失败' })
  }
})

const EXAM_EXTRACT_PROMPT = `请从这道行测题中提取以下信息，严格按JSON格式输出，不要有多余文字：
{"stem":"题干（不含选项）","options":"A. … B. … C. … D. …（如果有选项，每个选项之间用\\n分隔）","answer":"答案字母，只能填A/B/C/D，若题目用甲乙丙丁或①②③④等符号，必须对应转换为A/B/C/D","explanation":"解析内容"}`

const CHANGSHI_EXTRACT_PROMPT = `请从这道常识题中提取信息，并丰富解析内容，严格按JSON格式输出，不要有多余文字：
{"stem":"题干（不含选项）","options":"A. … B. … C. … D. …（若有选项则填，每个选项用\\n分隔；没有选项则填空字符串）","answer":"正确答案——若是选择题填对应字母（A/B/C/D，甲乙丙丁等符号需转换），若是问答题直接填答案文字","explanation":"解析要求：①先说清楚为什么是这个答案——给出背景、原因、事件来龙去脉；②再补充1-2个帮助记忆的联想或规律，比如时间节点的故事背景、对比记忆法、关键词联想等；③语言口语化自然，整体150字以内。"}`

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
  return data.balance  // 返回最新余额供接口带给前端
}

function readBank(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] }
}

function writeBank(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

function selectPracticePool(bank, excludeId) {
  const available = excludeId && bank.length > 1
    ? bank.filter(q => String(q.id) !== String(excludeId))
    : bank
  const unpracticed = available.filter(q => !Array.isArray(q.reviews) || q.reviews.length === 0)
  return unpracticed.length > 0 ? unpracticed : available
}

function createReviewRecord(body) {
  const record = {
    date: body.date || Date.now(),
    userAnswer: body.userAnswer,
  }
  if (typeof body.correct === 'boolean') record.correct = body.correct
  if (body.feedback) record.feedback = body.feedback
  return record
}
// 修复 AI 重复输出选项前缀的问题，如 "A. A. 11" → "A. 11"
function fixDuplicateOptionLetters(options) {
  if (!options) return options
  return options.split('\n').map(line =>
    line.replace(/^([A-D][.、．]\s*)[A-D][.、．]\s*/, '$1')
  ).join('\n')
}

function hasChoiceOptions(item) {
  return !!item.options && /^[A-D]$/i.test(String(item.answer || '').trim())
}

function inferNumericAnswer(item) {
  const directAnswer = String(item.answer || '').trim()
  if (/^-?\d+(?:\.\d+)?/.test(directAnswer)) return directAnswer.match(/^-?\d+(?:\.\d+)?/)?.[0]

  const text = String(item.explanation || '')
  const matches = text.match(/-?\d+(?:\.\d+)?/g)
  return matches ? matches[matches.length - 1] : undefined
}

function buildNumericOptions(answerText) {
  const answer = Number(answerText)
  if (!Number.isFinite(answer)) return null
  const step = Number.isInteger(answer) ? Math.max(1, Math.round(Math.abs(answer) * 0.08)) : Math.max(0.1, Math.abs(answer) * 0.08)
  const format = (n) => Number.isInteger(answer) ? String(Math.max(0, Math.round(n))) : String(Math.round(n * 10) / 10)
  const values = [answer - step, answer, answer + step, answer + step * 2].map(format)
  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length < 4) return null
  return {
    options: 'A. ' + uniqueValues[0] + '\nB. ' + uniqueValues[1] + '\nC. ' + uniqueValues[2] + '\nD. ' + uniqueValues[3],
    answer: 'B',
  }
}

function normalizeMathChoiceQuestion(item) {
  if (hasChoiceOptions(item)) {
    item.options = fixDuplicateOptionLetters(item.options)
    item.answer = String(item.answer).trim().toUpperCase()
    return true
  }

  const numericAnswer = inferNumericAnswer(item)
  const generated = numericAnswer ? buildNumericOptions(numericAnswer) : null
  if (!generated) return false
  item.options = generated.options
  item.answer = generated.answer
  return true
}

function cleanupBankOptions() {
  const files = [MATH_BANK_FILE, JUDGEMENT_BANK_FILE, ANALYSIS_BANK_FILE, CHANGSHI_BANK_FILE]
  files.forEach(file => {
    try {
      const bank = readBank(file)
      let changed = false
      bank.forEach(item => {
        if (!item.options) return
        const fixed = fixDuplicateOptionLetters(item.options)
        if (fixed !== item.options) { item.options = fixed; changed = true }
      })
      if (changed) { writeBank(file, bank); console.log(`[startup] 修复选项格式：${path.basename(file)}`) }
    } catch {}
  })
}

// 数量关系题库
function normalizeMathBankChoices() {
  try {
    const bank = readBank(MATH_BANK_FILE)
    let changed = false
    bank.forEach(item => {
      const beforeOptions = item.options
      const beforeAnswer = item.answer
      if (normalizeMathChoiceQuestion(item) && (item.options !== beforeOptions || item.answer !== beforeAnswer)) {
        changed = true
      }
    })
    if (changed) {
      writeBank(MATH_BANK_FILE, bank)
      console.log('[startup] normalized math choice questions')
    }
  } catch {}
}

app.get('/api/bank/math/random', (req, res) => {
  const bank = readBank(MATH_BANK_FILE)
  const choiceBank = bank.filter(hasChoiceOptions)
  if (choiceBank.length === 0) return res.status(404).json({ error: 'No choice questions available' })
  const pool = selectPracticePool(choiceBank, req.query.exclude)
  res.json(pool[Math.floor(Math.random() * pool.length)])
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
    if (!normalizeMathChoiceQuestion(extracted)) {
      return res.status(400).json({ error: 'Could not extract A/B/C/D options' })
    }
    const bank = readBank(MATH_BANK_FILE)
    const newItem = { id: `${Date.now()}`, ...extracted, reviews: [] }
    bank.push(newItem)
    writeBank(MATH_BANK_FILE, bank)
    const mathBalance = earnPoints(1, '录入数量关系题')
    res.json({ ...newItem, _pts: 1, _balance: mathBalance })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/bank/math/:id/review', (req, res) => {
  const bank = readBank(MATH_BANK_FILE)
  const item = bank.find(q => q.id === req.params.id)
  if (!item) return res.status(404).json({ error: '题目不存在' })
  if (!item.reviews) item.reviews = []
  item.reviews.push(createReviewRecord(req.body))
  writeBank(MATH_BANK_FILE, bank)
  res.json({ ok: true })
})

// 成语题库
app.get('/api/bank/idiom/random', (req, res) => {
  const bank = readBank(IDIOM_BANK_FILE)
  if (bank.length === 0) return res.status(404).json({ error: '题库为空，请先上传题目' })
  const pool = selectPracticePool(bank, req.query.exclude)
  res.json(pool[Math.floor(Math.random() * pool.length)])
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
    const idiomBalance = earnPoints(1, '录入成语')
    res.json({ ...newItem, _pts: 1, _balance: idiomBalance })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/bank/idiom/:id/review', (req, res) => {
  const bank = readBank(IDIOM_BANK_FILE)
  const item = bank.find(q => q.id === req.params.id)
  if (!item) return res.status(404).json({ error: '题目不存在' })
  if (!item.reviews) item.reviews = []
  item.reviews.push(createReviewRecord(req.body))
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
    const pool = selectPracticePool(bank, req.query.exclude)
    res.json(pool[Math.floor(Math.random() * pool.length)])
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
      let newBalance = null
      if (!req.body.silent) newBalance = earnPoints(uploadPoints, `录入${subjectName}题`)
      res.json({ ...newItem, _pts: newBalance !== null ? uploadPoints : undefined, _balance: newBalance })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.patch(`/api/bank/${prefix}/:id/review`, (req, res) => {
    const bank = readBank(file)
    const item = bank.find(q => q.id === req.params.id)
    if (!item) return res.status(404).json({ error: '题目不存在' })
    if (!item.reviews) item.reviews = []
    item.reviews.push(createReviewRecord(req.body))
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
背景解析：${explanation || ''}
学生回答：${userAnswer}

你是一个随和的常识老师。判断原则：只要学生答出了核心知识点就算对，不要求措辞与参考答案完全一致；只有答错了方向、张冠李戴或完全偏离才算错，答案不完整但方向对也可以给对。先说"答对了"或"答错了"，再一两句话点出关键或纠错，答对了顺带一个记忆要点。80字以内，聊天语气，不用列表。
格式（严格JSON，不要有多余文字）：{"correct":true或false,"feedback":"点评"}`,
        }])
        const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
        let newBalance = null
        if (json.correct) newBalance = earnPoints(judgeConfig.answerPoints, `${judgeConfig.subjectName} correct`)
        res.json({ ...json, _pts: json.correct ? judgeConfig.answerPoints : undefined, _balance: newBalance })
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
  const { topic, title, article } = req.body
  if (!topic || !title || !article) {
    return res.status(400).json({ error: '缺少参数' })
  }
  const essay = `标题：${title}\n\n${article}`
  try {
    const content = await callQwen([{
      role: 'user',
      content: `你是一位严格的申论阅卷老师。请对以下申论大作文进行批改。

题目：${topic}

学生作文：
${essay}

评分标准（满分10分）：
- 6分：结构完整，但论证空洞，主题切合但表达平庸，缺乏具体论据
- 7分：论点较清晰，有一定论证内容，但缺乏金句或具体案例支撑
- 8分：结构完整，论据有力，语言流畅，有至少1句金句自然融入
- 9分：论证充分，金句运用得当，逻辑严密，首尾呼应，整体质量高
- 10分：思想深刻，语言精炼，论证无懈可击，堪称范文

批改要求：
- 按上述标准客观给分，不要虚高
- 重点考察：主题切合度、论点清晰度、论证有力性、结构完整性、语言表达
- feedback 用口语化方式指出主要优点和不足，200字以内
- 范文写在 ---EXEMPLAR--- 分隔符之后（纯文本，不要用JSON包裹），要求：
  * 字数1000-1200字
  * 首段首句一句话亮明总论点
  * 每个分论点段首句即为该分论点核心观点，中间展开论据（事例/数据/分析）
  * 尾段总结升华，呼应首段总论点
  * 自然融入金句（古语、习近平总书记的话、典型案例、排比句等）

请严格按此格式输出（两部分之间只有一行 ---EXEMPLAR--- 分隔符）：
{"score":数字,"feedback":"批改意见"}
---EXEMPLAR---
范文正文`,
    }], 4000)  // 范文需要更多 token
    const sepIdx = content.indexOf('---EXEMPLAR---')
    let score, feedback, exemplar
    if (sepIdx !== -1) {
      const jsonPart = content.slice(0, sepIdx).trim().replace(/```json|```/g, '')
      const json = JSON.parse(jsonPart)
      score = json.score
      feedback = json.feedback
      exemplar = content.slice(sepIdx + 14).trim()
    } else {
      // 降级：尝试直接解析整个响应为 JSON
      const json = JSON.parse(content.trim().replace(/```json|```/g, ''))
      score = json.score
      feedback = json.feedback
      exemplar = json.exemplar || ''
    }
    const pts = Math.round(score * 0.5 * 10) / 10
    earnPoints(pts, `申论练习得${score}分`)
    res.json({ score, feedback, exemplar })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/shenlun/save', (req, res) => {
  const { topic, title, article, score, feedback, exemplar } = req.body
  if (!topic) return res.status(400).json({ error: '缺少题目' })
  const bank = readShenlun()
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    topic,
    title: title || '',
    article: article || '',
    score,
    feedback,
    exemplar,
    date: Date.now(),
  }
  bank.unshift(item)
  writeShenlun(bank)
  res.json({ ok: true })
})

app.get('/api/shenlun', (req, res) => {
  res.json(readShenlun())
})

app.delete('/api/shenlun/:id', (req, res) => {
  const bank = readShenlun()
  const filtered = bank.filter(item => item.id !== req.params.id)
  if (filtered.length === bank.length) return res.status(404).json({ error: '记录不存在' })
  writeShenlun(filtered)
  res.json({ ok: true })
})

const FRONTEND_DIST = path.join(__dirname, '../dist')
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST))
  // 所有非 API 路由返回 index.html（支持前端路由）
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
  })
}

// 启动时清理题库中的重复选项前缀

function cleanupRemovedFeatureData() {
  const removedFiles = ['zhengzhi_bank.json']
  removedFiles.forEach(name => {
    try { fs.rmSync(path.join(DATA_DIR, name), { force: true }) } catch {}
  })

  try {
    const data = readPoints()
    const keyword = '\u653f\u6cbb\u7406\u8bba'
    let delta = 0
    const history = Array.isArray(data.history) ? data.history : []
    data.history = history.filter(entry => {
      const hit = String(entry.reason || '').includes(keyword)
      if (hit) delta += Number(entry.amount || 0)
      return !hit
    })
    if (delta) {
      data.balance = Math.round((Number(data.balance || 0) - delta) * 100) / 100
      writePoints(data)
    }
  } catch {}
}
cleanupRemovedFeatureData()
cleanupBankOptions()
normalizeMathBankChoices()

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
