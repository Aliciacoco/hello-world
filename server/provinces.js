// ——— 申论省份命题素材 ———
//
// 前端下拉从 PROVINCES 取（全国 = 不注入地域约束，即原有行为）。
// 出题时素材查找顺序：运行时缓存 province_materials.json → 本文件 SEED_MATERIALS
//   → 都没有则调 AI 现场生成并写入缓存（这样以后加省份不用手工维护素材）。
//
// SEED_MATERIALS 是预热素材（AI 生成初稿），内置在代码里随部署上线，
// 避免线上第一次使用某省时要现场等 AI 生成。
//
// 素材编写原则：只放长期稳定的锚点（地理文化、产业特色、国家级战略定位、经典案例），
// 不写具体年度政策口号 / 政策文件编号 / 统计数字，避免过时。

const PROVINCES = [
  { code: 'national', name: '全国' },
  { code: 'zj', name: '浙江省' },
  { code: 'js', name: '江苏省' },
]

const SEED_MATERIALS = {
  zj: {
    code: 'zj',
    name: '浙江省',
    topics: [
      '绿水青山就是金山银山',
      '新时代枫桥经验',
      '数字经济发展',
      '千万工程与乡村振兴',
      '宋韵文化传承',
      '山海协作与共同富裕',
    ],
    cases: ['安吉余村', '诸暨枫桥镇', '杭州云栖小镇', '宁波舟山港', '温州民营经济'],
    keywords: ['两山理念', '枫桥经验', '数字浙江', '千万工程', '浙商精神'],
  },
  js: {
    code: 'js',
    name: '江苏省',
    topics: [
      '苏南模式转型升级',
      '长江大保护',
      '大运河文化带建设',
      '县域经济高质量发展',
      '张謇精神传承',
      '沿海地区高质量发展',
    ],
    cases: ['苏州工业园区', '南通张謇故里', '扬州中国大运河博物馆', '南京长江大桥', '盐城黄海湿地'],
    keywords: ['苏南模式', '张謇精神', '大运河文化带', '长江经济带', '黄海湿地'],
  },
}

// 生成某省素材用的提示词（供服务端按需生成时调用）
function buildMaterialPrompt(name) {
  return `你是申论命题研究员。请为「${name}」整理一套申论大作文命题素材库。

要求：
1. topics（话题方向，6条）：该省在公务员考试中常见、且具有本省辨识度的申论命题方向。每条 4-12 字。
2. cases（典型案例，5条）：该省最具代表性、可写入申论论据的实践案例或品牌地标。每条 4-15 字，必须是真实存在、长期稳定的案例。
3. keywords（关键词，5条）：能与该省强关联、可用于论述的核心概念词。每条 2-10 字。

硬约束：
- 只收录长期稳定的内容（地理文化、产业特色、国家级战略定位、经典案例、地方精神）
- 禁止编造：不要写具体年度政策口号、政策文件编号、统计数字、领导人讲话原文
- 案例必须真实存在（例如浙江的安吉余村、枫桥经验；江苏的苏州工业园区、南通张謇）
- 突出「本省独有」的辨识度，不要与相邻省份混淆

严格按 JSON 输出，不要任何多余文字：
{"topics":["","","","","",""],"cases":["","","","",""],"keywords":["","","","",""]}`
}

// 校验 AI 生成的素材是否可用
function isValidMaterial(m) {
  return !!m
    && Array.isArray(m.topics) && m.topics.filter(Boolean).length >= 5
    && Array.isArray(m.cases) && m.cases.filter(Boolean).length >= 4
    && Array.isArray(m.keywords) && m.keywords.filter(Boolean).length >= 3
}

module.exports = { PROVINCES, SEED_MATERIALS, buildMaterialPrompt, isValidMaterial }
