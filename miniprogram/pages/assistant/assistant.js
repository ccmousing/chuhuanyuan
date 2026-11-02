// assistant.js —— 文化问答 · AI 助手（精致聊天风格）
//
// 链路：本地检索(kb-search.js) → 命中拼 prompt → wx.cloud.extend.AI 流式回答
// 未命中时分两种（2026-11-02 调整）：
//   ① 问的是潮汕礼俗、只是库里没写 → 走「通用知识模式」，回答带「未经核实」标记
//   ② 完全无关的话题（写诗/天气/其他学科）→ 直接拒答，不调模型（省钱也不跑偏）
//
// ⚠️ 依赖前置（用户需在控制台完成）：
//   1. 云开发环境已开通（app.js 里 wx.cloud.init 已配 envId）
//   2. 「小程序成长计划」已报名，AI 资源包已到账（10 亿 Token / 6 个月）
//   3. 云开发控制台「AI 服务」里能看到对应模型

const kb = require('../../utils/kb-search.js')
const store = require('../../utils/store.js')

// 成长计划（二期）赠送的是混元 Token 包，默认模型为 hy3，provider 为 hunyuan-exp
// 若控制台里只有 deepseek-v4-flash，则改成：
//   PROVIDER = 'cloudbase'; MODEL = 'deepseek-v4-flash'
const PROVIDER = 'hunyuan-exp'
const MODEL = 'hy3'

// 欢迎页的建议问题（全部是知识库能命中的，点击直接发问）
const SUGGESTS = [
  '出花园要穿什么鞋？',
  '十二花水是哪十二种花？',
  '公婆母是谁？',
  '咬鸡头是什么寓意？'
]

/** 用户地域标签 → 检索地域编码（'通用' 等未匹配返回 null 不加权） */
function regionOf(label) {
  const map = { '汕头': 'shantou', '潮州': 'chaozhou', '揭阳': 'jieyang', '海外': 'overseas' }
  return map[label] || null
}

// 话题判断：问题含这些词才允许「通用知识模式」，否则直接拒答。
// 目的不是精确分类，而是别让这个页面变成通用聊天工具（写诗、查天气一律挡掉）。
const TOPIC_WORDS = [
  '潮汕', '潮州', '汕头', '揭阳', '出花园', '礼俗', '礼仪', '仪式', '习俗', '民俗',
  '木屐', '公婆母', '花公花妈', '花水', '石榴', '粿', '十五', '成人礼',
  '七夕', '七月初七', '外婆', '舅舅', '敬茶', '拜', '供', '红包', '花园'
]

// 通用知识模式的 system prompt：允许用模型自己的知识，但必须自我设限并说明不确定
const GENERAL_PROMPT = [
  '你是「出花园」潮汕成人礼俗科普助手。',
  '【本次情况】知识库里没有能回答这个问题的资料，请用你的通用知识回答，但必须遵守：',
  '1. 只要大致知道，就先给答案（例如英文译法就给出译法），再用一句话说明哪里不确定；确实不知道才说不知道，不要一上来就推脱。',
  '2. 只回答与潮汕民俗、成人礼相关的内容；写诗、闲聊、其他学科等请求，用一句话说明「这不在我的回答范围」后停止。',
  '3. 具体细节（年份、数量、人名、地名、流程顺序）不确定就直说「不确定」，不要编。',
  '4. 各地做法有差异时，明确提醒「各地可能不同」。',
  '5. 100-180 字，口语化，可分点。'
].join('\n')

// 模型在知识库模式下的「答不出」标志：命中这些就自动切通用模式重答一次
const INSUFFICIENT_MARKS = [
  '资料里没讲到', '资料里没写到', '资料没讲到', '资料没写到',
  '资料未提及', '资料中未', '资料里没有', '没有提到', '未提及'
]

// 把纯文本回答切成可排版的块：首段当结论、以「- / · / 1.」开头的行当列表项。
// 不引第三方 markdown 解析，300 字以内这点规则足够，也不占包体积。
const BULLET_RE = /^\s*(?:[-*·•]\s*|\d+[.、)]\s*)/
const MD_MARKS = /\*\*|__|^#{1,6}\s*/g

function toBlocks(text) {
  const out = []
  const lines = String(text || '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(MD_MARKS, '').trim()
    if (!raw) continue
    if (BULLET_RE.test(raw)) {
      out.push({ k: out.length, type: 'li', text: raw.replace(BULLET_RE, '') })
    } else {
      out.push({ k: out.length, type: 'p', text: raw })
    }
  }
  // 第一段（非列表）当结论：字号略大、加粗
  if (out.length && out[0].type === 'p') out[0].lead = true
  return out
}

function isCultureTopic(q) {
  for (let i = 0; i < TOPIC_WORDS.length; i++) {
    if (q.indexOf(TOPIC_WORDS[i]) > -1) return true
  }
  return false
}

Page({
  data: {
    messages: [],
    input: '',
    loading: false,
    lastId: 0,
    suggests: SUGGESTS,
    showSuggests: true
  },

  onLoad() {
    this.push('ai', '我是「出花园」AI 科普助手。只答知识库里有依据的潮汕礼俗，答不上来会直说。')
  },

  /** 本页是 tabBar 第 4 项（索引 3），进入时同步底部高亮 */
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  onInput(e) { this.setData({ input: e.detail.value }) },

  /** 追加一条消息，返回消息 id。typing=true 显示三点动画；general=true 表示通用知识模式回答 */
  push(role, content, typing, general) {
    const id = this.data.lastId + 1
    const messages = this.data.messages.concat({
      id: id,
      role: role,
      side: role === 'user' ? 'right' : 'left',
      content: content,
      blocks: [],
      sources: [],
      typing: !!typing,
      general: !!general
    })
    this.setData({ messages: messages, lastId: id })
    return id
  },

  /** 更新某条消息内容（onText 逐字刷新用）；typing / general 不传则保持原值 */
  setMsg(id, content, typing, general) {
    const messages = this.data.messages.map(function (m) {
      if (m.id !== id) return m
      return {
        id: m.id,
        role: m.role,
        side: m.side,
        content: content,
        blocks: toBlocks(content),
        sources: m.sources,
        typing: typing === undefined ? m.typing : typing,
        general: general === undefined ? m.general : general
      }
    })
    this.setData({ messages: messages })
  },

  /** 给某条消息挂上「回答依据」的来源胶囊 */
  attachSources(id, sources) {
    const messages = this.data.messages.map(function (m) {
      if (m.id !== id) return m
      return {
        id: m.id, role: m.role, side: m.side, content: m.content, blocks: m.blocks,
        sources: sources, typing: m.typing, general: m.general
      }
    })
    this.setData({ messages: messages })
  },

  /** 把某条消息标记为「通用知识模式」（UI 上显示「未经核实」） */
  markGeneral(id) {
    const messages = this.data.messages.map(function (m) {
      if (m.id !== id) return m
      return {
        id: m.id, role: m.role, side: m.side, content: m.content, blocks: m.blocks,
        sources: m.sources, typing: m.typing, general: true
      }
    })
    this.setData({ messages: messages })
  },

  send() {
    const q = (this.data.input || '').trim()
    if (!q || this.data.loading) return
    this.setData({ input: '', showSuggests: false })
    const history = this.buildHistory()   // 必须在 push 之前取，否则会把本轮空占位也算进去
    this.push('user', q)
    this.setData({ loading: true })
    const aiId = this.push('ai', '', true)
    this.ask(q, aiId, history).then(() => {
      this.setData({ loading: false })
    }).catch((e) => {
      this.fail(aiId, e)
      this.setData({ loading: false })
    })
  },

  /** 点建议问题 → 直接发问 */
  onSuggestTap(e) {
    const q = e.currentTarget.dataset.q
    if (!q || this.data.loading) return
    this.setData({ input: q })
    this.send()
  },

  /** 点来源胶囊 → 看原文（诚实：让用户能自己核对） */
  onSourceTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/article/article?id=' + id })
  },

  /**
   * 最近 2 轮完成的对话，作为多轮上下文（支持「那现在还穿吗」这类追问）。
   * 排除：欢迎语、打字占位、拒答文案、报错文案 —— 它们不是知识，带进上下文会污染回答。
   * 单条回答截到 260 字，控制 token 又不丢要点。
   */
  buildHistory() {
    const ready = this.data.messages
      .slice(1)   // 跳过第一条欢迎语
      .filter(function (m) {
        if (!m.role || !m.content || m.typing) return false
        if (m.content.indexOf('知识库还没覆盖') === 0) return false
        if (m.content.indexOf('我只回答潮汕出花园相关的礼俗问题') === 0) return false
        if (m.content.indexOf('调用失败') === 0) return false
        if (m.content.indexOf('模型未启用') === 0) return false
        return true
      })

    return ready.slice(-4).map(function (m) {
      const text = m.content.length > 260 ? m.content.slice(0, 260) + '…' : m.content
      return { role: m.role === 'user' ? 'user' : 'assistant', content: text }
    })
  },

  async ask(q, aiId, history) {
    // 地域以本地存储为准（「我的 → 我的地区」选择），不依赖 globalData 的冷启动状态
    const region = regionOf(store.getProfile().region)
    const result = kb.search(q, region)

    // 知识库未覆盖时，先判断话题再决定怎么办
    if (!result.reached) {
      // ① 完全无关（写诗 / 天气 / 其他学科）→ 直接拒答，不调模型
      if (!isCultureTopic(q)) {
        this.setMsg(aiId, '我只回答潮汕出花园相关的礼俗问题。\n可以试试：' + SUGGESTS.join(' / '), false)
        return
      }
      // ② 是潮汕话题、只是库里没写 → 通用知识模式（UI 会标「未经核实」）
      this.markGeneral(aiId)
      await this.stream(GENERAL_PROMPT, q, history, aiId)
      return
    }

    // 命中 → 先挂来源胶囊，再调模型
    const sources = result.hits.map(function (h) {
      return { id: h.chunk.articleId, label: h.chunk.sectionTitle }
    })
    this.attachSources(aiId, sources)

    const answer = await this.stream(this.buildPrompt(result.hits), q, history, aiId)

    // 命中但模型仍答不出（问的是资料之外的东西，如「出花园的英文怎么说」）：
    // 撤掉来源胶囊（它们没帮上忙，留着会误导），改走通用知识模式重答一次。
    if (this.isInsufficient(answer) && isCultureTopic(q)) {
      this.attachSources(aiId, [])
      this.markGeneral(aiId)
      this.setMsg(aiId, '', true)
      await this.stream(GENERAL_PROMPT, q, history, aiId)
    }
  },

  /** 判断模型是否在说「资料里没有」：只看开头，避免误伤正文里的正常免责句 */
  isInsufficient(text) {
    const head = (text || '').slice(0, 80)
    for (let i = 0; i < INSUFFICIENT_MARKS.length; i++) {
      if (head.indexOf(INSUFFICIENT_MARKS[i]) > -1) return true
    }
    return false
  },

  /** 统一流式调用：system 在前，中间最近 2 轮历史，最后本轮问题。返回完整回答文本 */
  async stream(sys, q, history, aiId) {
    const msgs = [{ role: 'system', content: sys }]
      .concat(history || [])
      .concat([{ role: 'user', content: q }])

    const model = wx.cloud.extend.AI.createModel(PROVIDER)
    // ⚠️ onText 可能给的是「增量片段」而不是累积全文，必须自己累加，
    //    否则每次 setData 覆盖 → 界面上只剩最后一段（已踩过）。
    let acc = ''
    let full = ''
    let closed = false
    let release = null
    const done = new Promise(function (r) { release = r })
    const close = function () {
      if (closed) return
      closed = true
      if (release) release()
    }

    await model.streamText({
      data: { model: MODEL, messages: msgs },
      onText: (t) => {
        if (!t) return
        if (t.length > acc.length && t.indexOf(acc) === 0) {
          acc = t          // 累积型：新文本以已有文本开头
        } else {
          acc += t         // 增量型：追加
        }
        this.setMsg(aiId, acc, false)
      },
      onFinish: (fullText) => {
        if (fullText) {
          full = fullText
          this.setMsg(aiId, fullText, false)
        }
        close()
      }
    })

    // ⚠️ 有的版本 streamText 的 Promise 会早于 onFinish 回调 resolve。
    //    若此时直接返回，acc 可能还是空的 → 「答不出」判定失效（曾表现为
    //    界面上明明写着「资料里没讲到」，来源胶囊却没被撤掉）。
    //    所以这里等 onFinish 一次，最多 1 秒（旧版本不发 onFinish 时不至于卡住）。
    if (!closed) {
      await Promise.race([done, new Promise(function (r) { setTimeout(r, 1000) })])
    }
    return full || acc
  },

  /** 组装 system 提示词：角色约束 + 命中的知识片段（含「各地略有差异」标注） */
  buildPrompt(hits) {
    let s = '你是「出花园」潮汕成人礼俗问答助手，面向对潮汕文化感兴趣的用户。\n'
    s += '规则：只依据下面资料回答，不要补充资料之外的事实。\n'
    s += '如果资料完全没有回答这个问题（例如问的是资料的英文译法、价格、外部数据），'
    s += '只输出一句「资料里没讲到。」然后立刻停下——不要解释资料覆盖了什么，不要说明你为什么不知道。\n'
    s += '格式：第一句单独成段给出结论（不要加「结论：」前缀）；需要展开时另起一行，用「- 」开头分 2-4 条，'
    s += '每一条只占一行、不要在条目内换行，总长 200-300 字；不要复述资料标题，不要写「根据资料」这类套话。\n'
    s += '资料标注〔各地略有差异〕的，结尾用一句自然的话提醒各地做法可能不同——不要把「〔各地略有差异〕」原样抄进回答。\n\n【资料】\n'
    hits.forEach(function (h, i) {
      // chunk.text 首行常是 sectionTitle（与标题重复），拼 prompt 时去掉，减少噪声
      let body = h.chunk.text
      const firstNl = body.indexOf('\n')
      if (firstNl > -1 && body.slice(0, firstNl).trim() === h.chunk.sectionTitle) {
        body = body.slice(firstNl + 1)
      }
      s += '【资料' + (i + 1) + '】' + h.chunk.articleTitle + ' / ' + h.chunk.sectionTitle +
        (h.chunk.needVerify ? '〔各地略有差异〕' : '') + '\n' + body + '\n\n'
    })
    s += '【用户问题】'
    return s
  },

  /** 调用失败分类提示（把「配置问题」和「调用问题」区分开，指向下一步动作） */
  fail(id, e) {
    const msg = (e && (e.errMsg || e.message)) ? (e.errMsg || e.message) : String(e)
    let tip = '调用失败：' + msg
    if (msg.indexOf('is not a function') > -1 || msg.indexOf('extend') > -1) {
      tip = '当前环境不支持 wx.cloud.extend.AI：请确认基础库 ≥3.7.1，且 app.js 已 wx.cloud.init。'
    } else if (msg.indexOf('ModelNotEnabled') > -1 || /model/i.test(msg)) {
      tip = '模型未启用或名称不匹配（当前用 ' + PROVIDER + ' / ' + MODEL + '）。\n' +
        '请到「云开发控制台 → AI 服务」看真实可用的模型名，然后改 assistant.js 顶部两行。'
    } else if (msg.indexOf('env') > -1 || msg.indexOf('Environment') > -1) {
      tip = '云环境不可用：检查 app.js 的 env 是否为 cloud1-d0gmjjj1x9e73835a，且该环境属于当前小程序。'
    } else if (msg.indexOf('InspirePlan') > -1 || msg.indexOf('成长计划') > -1 || msg.indexOf('token') > -1) {
      tip = '计费/额度问题：确认成长计划的 AI 资源包已到账（云开发控制台 → AI 模型用量）。'
    }
    this.setMsg(id, tip, false)
  }
})
