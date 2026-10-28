// assistant.js —— 文化问答 · AI 助手（精致聊天风格）
//
// 链路：本地检索(kb-search.js) → 命中拼 prompt → wx.cloud.extend.AI 流式回答
// 未命中：直接拒答 + 给建议（不浪费 token、不硬编答案 —— 诚实原则）
//
// ⚠️ 依赖前置（用户需在控制台完成）：
//   1. 云开发环境已开通（app.js 里 wx.cloud.init 已配 envId）
//   2. 「小程序成长计划」已报名，AI 资源包已到账（10 亿 Token / 6 个月）
//   3. 云开发控制台「AI 服务」里能看到对应模型

const kb = require('../../utils/kb-search.js')

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

  /** 追加一条消息，返回消息 id。typing=true 时显示三点动画而非文字 */
  push(role, content, typing) {
    const id = this.data.lastId + 1
    const messages = this.data.messages.concat({
      id: id,
      role: role,
      side: role === 'user' ? 'right' : 'left',
      content: content,
      sources: [],
      typing: !!typing
    })
    this.setData({ messages: messages, lastId: id })
    return id
  },

  /** 更新某条消息内容（onText 逐字刷新用）；typing 不传则保持原值 */
  setMsg(id, content, typing) {
    const messages = this.data.messages.map(function (m) {
      if (m.id !== id) return m
      return {
        id: m.id,
        role: m.role,
        side: m.side,
        content: content,
        sources: m.sources,
        typing: typing === undefined ? m.typing : typing
      }
    })
    this.setData({ messages: messages })
  },

  /** 给某条消息挂上「回答依据」的来源胶囊 */
  attachSources(id, sources) {
    const messages = this.data.messages.map(function (m) {
      if (m.id !== id) return m
      return { id: m.id, role: m.role, side: m.side, content: m.content, sources: sources, typing: m.typing }
    })
    this.setData({ messages: messages })
  },

  send() {
    const q = (this.data.input || '').trim()
    if (!q || this.data.loading) return
    this.setData({ input: '', showSuggests: false })
    this.push('user', q)
    this.setData({ loading: true })
    const aiId = this.push('ai', '', true)
    this.ask(q, aiId).then(() => {
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

  async ask(q, aiId) {
    const app = getApp()
    const region = regionOf(app.globalData && app.globalData.userRegion)
    const result = kb.search(q, region)

    // 知识库未覆盖 → 拒答，不调 LLM（诚实原则：答不上就答不上）
    if (!result.reached) {
      const hint = result.hits.length
        ? '\n（最接近的是「' + result.hits[0].chunk.sectionTitle + '」，但相关度不够，不硬答）'
        : ''
      this.setMsg(aiId, '知识库还没覆盖到这个问题' + hint + '。\n换个问法试试，比如问木屐、十二花水、公婆母。', false)
      return
    }

    // 命中 → 先挂来源胶囊，再调模型
    const sources = result.hits.map(function (h) {
      return { id: h.chunk.articleId, label: h.chunk.sectionTitle }
    })
    this.attachSources(aiId, sources)

    const sys = this.buildPrompt(result.hits)
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: q }]

    const model = wx.cloud.extend.AI.createModel(PROVIDER)
    // ⚠️ onText 可能给的是「增量片段」而不是累积全文，必须自己累加，
    //    否则每次 setData 覆盖 → 界面上只剩最后一段（已踩过）。
    //    这里同时兼容两种实现，并用 onFinish 的完整文本兜底。
    let acc = ''
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
        if (fullText) this.setMsg(aiId, fullText, false)
      }
    })
  },

  /** 组装 system 提示词：角色约束 + 命中的知识片段（含「各地略有差异」标注） */
  buildPrompt(hits) {
    let s = '你是「出花园」潮汕成人礼俗问答助手，面向对潮汕文化感兴趣的用户。\n'
    s += '规则：只依据下面资料回答，不要补充资料之外的事实；资料没写到的，直接说「资料里没写到」。\n'
    s += '格式：第一句先给结论；然后分 2-4 点展开，总长 200-300 字；不要复述资料标题，不要写「根据资料」这类套话。\n'
    s += '资料标注〔各地略有差异〕的，结尾用一句话提醒各地做法可能不同。\n\n【资料】\n'
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
