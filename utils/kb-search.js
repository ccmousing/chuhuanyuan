// kb-search.js —— 知识库本地检索（移植自 rag/retrieve.py，保持一致）
//
// 为什么在端上做检索而不是调云端：
//   测试号阶段先跑通链路；31 chunks 数据量小，端上 BM25 毫秒级完成，
//   命中结果拼进 prompt 再调 wx.cloud.extend.AI，省去云函数/正式域名依赖。
//
// 对外接口：search(query, region)
//   region: 'general' | 'shantou' | 'chaozhou' | 'jieyang' | 'overseas' | null
//   返回 { hits: [{chunk, score, cover}], reached: Boolean }
//   reached=false 表示知识库未覆盖，上层应拒答而不是硬答。

const KB = require('./kb-data.js')

// —— BM25 参数（与 retrieve.py 完全一致，未针对本数据集调优）——
const K1 = 1.5
const B = 0.75
const REGION_BOOST = 1.35   // 命中调用方地域的 chunk 得分乘此系数
const UNIGRAM_W = 0.55      // 单字回退词权重折扣
const DEFAULT_FLOOR = 1.0   // 绝对分数下限
const MIN_COVER = 0.5       // 查询实词在命中 chunk 中的最低覆盖率

// —— 功能词表（与 retrieve.py 刻意保持一致：不收 穿/吃/办 等民俗实义动词）——
const STOP_MULTI = [
  '是什么', '为什么', '哪些', '哪个', '怎么', '怎样', '如何', '什么',
  '多少', '请问', '一下', '告诉', '想知道', '了解', '介绍', '区别', '不同', '一样',
  '应该', '需要', '可以', '是不是', '有没有'
]
const STOP_CHAR = new Set('的了在是和与或及有就也不都还很吗呢吧啊这那之为以被把从到于而但却还又再可能会要很非常之乎者也其')

function bigrams(text) {
  // 中文按字二元组；英文/数字单独保留（避免 '15' 被切碎失配）。
  // 两步过滤顺序不能反：先删多字功能词，再逐字删单字功能词，最后切二元组。
  text = text.toLowerCase()
  const latin = []
  text = text.replace(/[a-z0-9]+/gi, function (m) {
    latin.push(m)
    return ' '
  })
  for (let i = 0; i < STOP_MULTI.length; i++) {
    text = text.split(STOP_MULTI[i]).join(' ')
  }
  const out = []
  const segRe = /[\u4e00-\u9fff]+/g
  let m
  while ((m = segRe.exec(text)) !== null) {
    let seg = ''
    for (let i = 0; i < m[0].length; i++) {
      if (!STOP_CHAR.has(m[0][i])) seg += m[0][i]
    }
    if (!seg) continue
    if (seg.length === 1) {
      out.push(seg) // 单字直接作词（权重 1.0），与 retrieve.py 一致
      continue
    }
    for (let i = 0; i < seg.length - 1; i++) out.push(seg.slice(i, i + 2))
    for (let i = 0; i < seg.length; i++) out.push('_' + seg[i]) // 单字回退，打分打折
  }
  for (let i = 0; i < latin.length; i++) out.push(latin[i])
  return out
}

// —— 模块级索引（require 时一次性构建，31 chunks 开销可忽略）——
const chunks = KB.chunks
const tf = []   // 每 chunk 的词频表
const len = []  // 每 chunk 的 term 数
const df = {}   // term 出现在多少 chunk
let n = 0

function buildIndex() {
  for (let i = 0; i < chunks.length; i++) {
    const terms = bigrams(chunks[i].text)
    const f = {}
    for (let j = 0; j < terms.length; j++) f[terms[j]] = (f[terms[j]] || 0) + 1
    tf.push(f)
    len.push(terms.length)
    for (const t in f) df[t] = (df[t] || 0) + 1
  }
}
buildIndex()
n = chunks.length

let avgLen = 0
for (let i = 0; i < len.length; i++) avgLen += len[i]
avgLen = avgLen / (len.length || 1)

function idf(term) {
  const d = df[term] || 0
  if (d === 0) return 0
  return Math.log(1 + (n - d + 0.5) / (d + 0.5))
}

/**
 * 检索最相关的 chunk。
 * @param {string} query 用户问题
 * @param {string|null} region 地域（general/shantou/chaozhou/jieyang/overseas/null）
 * @returns {{hits: Array, reached: Boolean}}
 */
function search(query, region) {
  const qTerms = bigrams(query || '')
  if (!qTerms.length) return { hits: [], reached: false }

  const qFreq = {}
  for (let i = 0; i < qTerms.length; i++) qFreq[qTerms[i]] = (qFreq[qTerms[i]] || 0) + 1

  const scored = []
  for (let i = 0; i < n; i++) {
    let s = 0
    const f = tf[i]
    const dl = len[i] || 1
    for (const t in qFreq) {
      if (!f[t]) continue
      const w = t.charAt(0) === '_' ? UNIGRAM_W : 1.0
      const idfV = idf(t)
      const tfn = f[t]
      const denom = tfn + K1 * (1 - B + B * dl / (avgLen || 1))
      s += w * idfV * (tfn * (K1 + 1)) / denom * qFreq[t]
    }
    if (s > 0 && region && region !== 'general' && chunks[i].regions.indexOf(region) !== -1) {
      s *= REGION_BOOST
    }
    if (s > 0) scored.push({ s: s, i: i })
  }

  scored.sort(function (a, b) { return b.s - a.s })

  const hits = []
  for (let k = 0; k < scored.length && k < 3; k++) {
    const item = scored[k]
    const topTerms = {}
    for (const t in tf[item.i]) topTerms[t] = true
    let cover = 0
    const qSetLen = Object.keys(qFreq).length
    for (const t in qFreq) if (topTerms[t]) cover++
    cover = qSetLen ? cover / qSetLen : 0
    hits.push({
      chunk: chunks[item.i],
      score: Math.round(item.s * 10000) / 10000,
      cover: Math.round(cover * 100) / 100
    })
  }

  let reached = false
  if (hits.length) {
    reached = hits[0].score > DEFAULT_FLOOR && hits[0].cover >= MIN_COVER
  }
  return { hits: hits, reached: reached }
}

module.exports = {
  search: search,
  stats: KB.stats,
  chunks: chunks
}
