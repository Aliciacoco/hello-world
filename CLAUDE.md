# 项目说明

## 这是什么

行测备考学习网站，功能包括：
- 排列组合速算练习
- 成语辨析练习
- 数量关系 / 判断推理 / 资料分析 / 常识 题库练习（从题库随机抽题）
- 申论大作文出题 + AI批改 + 范文
- 错题本 / 题库查询（/bank 页面）
- 积分系统

## 技术栈

- 前端：React + TypeScript + Vite，CSS Modules
- 后端：Node.js + Express，JSON 文件存储
- AI：阿里云通义千问（qwen-plus / qwen-vl-plus）
- 部署：GitHub Actions → 腾讯云轻量服务器，pm2 管理进程

## 部署方式

推送到 main 分支会自动触发 `.github/workflows/deploy.yml`：
1. GitHub Actions 构建前端（`npm run build`）
2. rsync 把 `dist/` 同步到服务器（有 `--delete`，会删旧文件）
3. rsync 把 `server/` 同步到服务器 `/home/$SSH_USER/api/`（**没有 `--delete`**）
4. 服务器执行 `npm install --production` 并 pm2 重启

## ⚠️ 数据文件说明（重要）

数据存在服务器 `/home/$SSH_USER/api/` 目录下的 JSON 文件里：

```
wrong_answers.json      错题记录
question_bank.json      数量关系题库
idiom_bank.json         成语题库
judgement_bank.json     判断推理题库
analysis_bank.json      资料分析题库
changshi_bank.json      常识题库
verbal_bank.json        言语理解题库
shenlun_bank.json       申论练习记录
points.json             积分余额和历史
round_practice.json     各题库的练习轮次进度（跨浏览器/设备恢复用）
shenlun_draft.json      申论进行中的题目草稿（跨浏览器/设备恢复用）
```

**这些文件已从 git 移除（.gitignore 里有），不会被 rsync 覆盖。**

### 新题库的初始数据：seeds 播种

数据文件不进 git 的代价是「新题库首次上线时线上是空的」。解决办法是 `server/seeds/`：

- 初始题库放在 `server/seeds/<name>_seed.json`（**进 git**，随 `server/` 一起 rsync 到服务器）
- 服务端启动时调用 `seedBankIfMissing(目标文件, seed 文件名)`：**目标文件不存在、内容为空、或还是空数组时**复制一份过去
- 已经有题目（非空数组）就绝不会再动，用户后续增删改不受影响；pm2 重启同理

新增题库时：把初始数据放进 `server/seeds/`，再在 `server/index.js` 的路径定义区加一行 `seedBankIfMissing(XXX_BANK_FILE, 'xxx_seed.json')`。

### 练习轮次进度（round_practice.json）

成语辨析 / 数量关系 / 判断推理 / 资料分析 / 常识 / 言语理解 的「第一遍顺序刷完 → 之后只练上轮错题 → 全对完成」轮次状态：

- 前端 `src/hooks/useRoundPractice.ts`，**双写**：localStorage（即时、离线可用）+ 服务端 `PUT /api/round/:bankType`（防抖 400ms）
- 进页面时 `GET /api/round/:bankType`，与本地缓存按 `updatedAt` 择新恢复
- 目的：刷新、换浏览器、换设备都能接着上次的轮次继续（只靠 localStorage 换浏览器就会丢）

### 申论题目草稿（shenlun_draft.json）

申论是 AI 实时出题（无题库），出过的题只存 React state，刷新就没了。现改为：

- `GET/PUT /api/shenlun/draft`，存 `{topic, title, article, province, provinceName, updatedAt}`
- 前端 `src/pages/Shenlun.tsx` 双写（同轮次进度机制）：本地即时 + 服务端防抖 400ms；进页面择新恢复并显示「已恢复上次未完成的题目」提示
- 清空时机：点「换一题」→ 新题生成成功后覆盖；点「提交批改」→ 判卷成功后清空（PUT topic 为空即删除文件）
- 出题失败不丢旧题：generateTopic 失败时恢复原 phase，旧题/草稿原样保留

### 曾经踩过的坑

2026年7月，数据文件被误提交进了 git。每次部署 rsync 都会把 git 里的旧版本覆盖掉服务器上的最新数据，导致用户积分和题库记录反复丢失。已修复：把所有 JSON 数据文件加入 .gitignore 并从 git 移除。

**绝对不要** 把上述 JSON 文件重新 `git add` 进去。

## 积分系统

- 前端：`src/utils/points.ts`，调用 `POST /api/points/earn`
- 后端：`server/index.js` 里的 `earnPoints()` 函数，直接写文件
- 注意：申论批改时**前端和后端都会调用积分接口**，存在重复计算问题（待修复）

## AI 接口

统一用阿里云 DashScope，兼容 OpenAI 格式：
- 文字：`qwen-plus`，max_tokens 800
- 图片识别：`qwen-vl-plus`，max_tokens 1000
- API Key 存在环境变量 `QWEN_API_KEY`，也有硬编码兜底（不安全，后续应去掉）

## 服务器信息

- 平台：腾讯云轻量服务器
- 进程管理：pm2，进程名 `combinatorics-api`
- 前端静态文件路径：`$DEPLOY_PATH`（GitHub Secrets 里）
- 后端路径：`/home/$SSH_USER/api/`
- SSH 密钥等存在 GitHub Secrets：`SSH_PRIVATE_KEY`、`SSH_HOST`、`SSH_USER`、`DEPLOY_PATH`
