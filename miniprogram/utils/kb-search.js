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
const TITLE_BOOST = 0.4     // 标题命中加成（20 题评估：0.4 最优，65%→75%；0.8 过度加权会回落）
const OOV_MAX = 0.5         // 库外词比例上限：超过则拒答（拦住「XX 的英文怎么说」这类问法）
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
const tf = []       // 每 chunk 的词频表
const len = []      // 每 chunk 的 term 数
const df = {}       // term 出现在多少 chunk
const globalTerms = {} // 全库出现过的 term（用于判断「问的是不是库外话题」）
const titleSet = [] // 每 chunk「标题」的 term 集合（文章标题 + 小节标题）
let n = 0

function buildIndex() {
  for (let i = 0; i < chunks.length; i++) {
    const terms = bigrams(chunks[i].text)
    const f = {}
    for (let j = 0; j < terms.length; j++) f[terms[j]] = (f[terms[j]] || 0) + 1
    tf.push(f)
    len.push(terms.length)
    for (const t in f) {
      df[t] = (df[t] || 0) + 1
      globalTerms[t] = true
    }

    // 标题索引：正文里「出花园」出现几十次，纯 BM25 会让泛泛的段落压过专文；
    // 标题才是「这篇讲什么」的最强信号，命中标题应额外加分。
    const ts = {}
    const tTerms = bigrams(chunks[i].articleTitle + ' ' + chunks[i].sectionTitle)
    for (let j = 0; j < tTerms.length; j++) ts[tTerms[j]] = true
    titleSet.push(ts)
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
function search(query, region, opts) {
  // opts 只给评估脚本扫参用（minCover / floor / unigramW）；业务代码不传，行为与常量一致
  const o = opts || {}
  const minCover = o.minCover === undefined ? MIN_COVER : o.minCover
  const floor = o.floor === undefined ? DEFAULT_FLOOR : o.floor
  const unigramW = o.unigramW === undefined ? UNIGRAM_W : o.unigramW
  const titleBoost = o.titleBoost === undefined ? TITLE_BOOST : o.titleBoost
  const oovMax = o.oovMax === undefined ? OOV_MAX : o.oovMax

  const qTerms = bigrams(query || '')
  if (!qTerms.length) return { hits: [], reached: false }

  const qFreq = {}
  for (let i = 0; i < qTerms.length; i++) qFreq[qTerms[i]] = (qFreq[qTerms[i]] || 0) + 1

  const qSetLen = Object.keys(qFreq).length
  const scored = []
  for (let i = 0; i < n; i++) {
    let s = 0
    const f = tf[i]
    const dl = len[i] || 1
    for (const t in qFreq) {
      if (!f[t]) continue
      const w = t.charAt(0) === '_' ? unigramW : 1.0
      const idfV = idf(t)
      const tfn = f[t]
      const denom = tfn + K1 * (1 - B + B * dl / (avgLen || 1))
      s += w * idfV * (tfn * (K1 + 1)) / denom * qFreq[t]
    }

    // 标题加权：问题词命中文章/小节标题的比例越高，越可能是用户在问的主题
    if (s > 0 && titleBoost > 0) {
      let hit = 0
      const ts = titleSet[i]
      for (const t in qFreq) if (ts[t]) hit++
      s *= (1 + titleBoost * hit / (qSetLen || 1))
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
    // 覆盖率取 top3 里的最高值，而不是只看 top1：
    // 同一篇文章的第二段常常覆盖更高（「十二花水是哪十二种花」top1=0.47 被误拒、
    // top2=0.53 才是真正对上的那段）。分数仍以 top1 为准，避免噪声段落顶上来。
    let bestCover = 0
    for (let k = 0; k < hits.length; k++) {
      if (hits[k].cover > bestCover) bestCover = hits[k].cover
    }
    reached = hits[0].score > floor && bestCover >= minCover
  }

  // 库外词判定：问题里的实词有多大比例在全库从未出现。
  // 用来拦住「出花园的英文怎么说」「潮汕还有什么别的民俗」这类 —— 它们含「出花园」这种
  // 全库高频词，覆盖率能骗过阈值，但问的东西库里根本没有。
  if (reached && oovMax > 0) {
    let total = 0
    let unseen = 0
    for (const t in qFreq) {
      if (t.charAt(0) === '_') continue   // 单字噪声大，不计入
      total++
      if (!globalTerms[t]) unseen++
    }
    if (total > 0 && unseen / total > oovMax) reached = false
  }

  return { hits: hits, reached: reached }
}

module.exports = {
  search: search,
  stats: KB.stats,
  chunks: chunks
}
