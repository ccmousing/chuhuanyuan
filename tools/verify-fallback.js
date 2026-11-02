// verify-fallback.js —— 问答页「兜底链路」校验（假模型，不联网、不耗 token）
//
// 验三件事：
//   A. 知识库命中但模型答不出（如问英文译法）→ 自动切通用模式重答，并撤掉来源胶囊
//   B. 正常命中 → 只调一次模型，来源胶囊保留
//   C. 完全无关（写诗/天气）→ 不调模型，直接拒答
//
// 原理：把 Page() / wx 打桩，require 真实的 assistant.js，用假 streamText 驱动。
// 用法：node tools/verify-fallback.js

const path = require('path')
const MINI = path.join(__dirname, '..', 'miniprogram')

let page = null
global.Page = function (cfg) { page = cfg }

let calls = 0
let LATE_MODE = false
const REPLY_ICHI = '红木屐是出花园的必备。\n· 木屐以竹为底，「竹」与潮汕话的「德」同音；\n· 红屐寓意踏出前程。'
const REPLY_INSUFFICIENT = '资料里没写到。\n\n资料只介绍了出花园是潮汕孩子十五岁举行的成人礼，未提及英文表述。'
const REPLY_GENERAL = '「出花园」一般译作 "coming out of the garden"。\n⚑ 以上为通用译法。'

global.wx = {
  cloud: {
    extend: {
      AI: {
        createModel: function () {
          return {
            streamText: async function (opt) {
              calls++
              const sys = opt.data.messages[0].content
              const q = opt.data.messages[opt.data.messages.length - 1].content
              const isGeneral = sys.indexOf('本次情况') > -1
              let reply
              if (isGeneral) reply = REPLY_GENERAL
              else if (q.indexOf('鞋') > -1) reply = REPLY_ICHI
              else reply = REPLY_INSUFFICIENT

              if (LATE_MODE) {
                // 模拟「streamText 的 Promise 先 resolve、回调后到」的 SDK 行为：
                // 立刻返回，回调放到 40ms 后再触发
                setTimeout(function () {
                  for (let i = 0; i < reply.length; i += 8) {
                    opt.onText && opt.onText(reply.slice(0, Math.min(i + 8, reply.length)))
                  }
                  opt.onFinish && opt.onFinish(reply)
                }, 40)
                return
              }

              for (let i = 0; i < reply.length; i += 8) {
                opt.onText && opt.onText(reply.slice(0, Math.min(i + 8, reply.length)))
              }
              opt.onFinish && opt.onFinish(reply)
            }
          }
        }
      }
    }
  },
  navigateTo: function () {},
  getStorageSync: function () { return '' },
  setStorageSync: function () {},
  removeStorageSync: function () {}
}

require(path.join(MINI, 'pages', 'assistant', 'assistant.js'))

function newInst() {
  const inst = Object.assign({}, page)
  inst.data = JSON.parse(JSON.stringify(page.data))
  inst.setData = function (patch) { Object.assign(inst.data, patch) }
  inst.getTabBar = function () { return null }
  inst.onLoad()
  return inst
}

function ask(inst, q) {
  const id = inst.push('ai', '', true)
  return Promise.resolve(inst.ask(q, id, [])).then(function () {
    return inst.data.messages.find(function (m) { return m.id === id })
  })
}

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  ← ' + extra : '')) }
}

;(async function () {
  console.log('A. 命中但答不出 → 自动切通用模式')
  let inst = newInst()
  calls = 0
  let m = await ask(inst, '出花园的英文怎么说？')
  ok(calls === 2, '调了两次模型（知识库 + 通用）', '实际 ' + calls)
  ok(m.general === true, '标记为通用模式（UI 显示「未经核实」）')
  ok(m.sources.length === 0, '来源胶囊已清空（它们没帮上忙）', '仍有 ' + m.sources.length + ' 个')
  ok(m.content.indexOf('coming out') > -1, '最终是通用模式的答案', m.content.slice(0, 20))
  ok(m.typing === false, '打字动画已结束')

  console.log('\nB. 正常命中 → 保持原链路')
  inst = newInst()
  calls = 0
  m = await ask(inst, '出花园要穿什么鞋？')
  ok(calls === 1, '只调一次模型', '实际 ' + calls)
  ok(m.general === false, '不标通用模式')
  ok(m.sources.length === 3, '来源胶囊保留 3 个', '实际 ' + m.sources.length)
  ok(m.content.indexOf('木屐') > -1, '回答是知识库内容')

  console.log('\nC. 完全无关 → 直接拒答')
  inst = newInst()
  calls = 0
  m = await ask(inst, '帮我写一首诗')
  ok(calls === 0, '没有调用模型（不烧 token）', '实际 ' + calls)
  ok(m.content.indexOf('我只回答潮汕') === 0, '给出范围提示')
  ok(m.sources.length === 0, '无来源胶囊')

  console.log('\nD. isInsufficient 边界')
  inst = newInst()
  ok(inst.isInsufficient('资料里没讲到。') === true, '开头就答不出 → true')
  ok(inst.isInsufficient('红木屐是必备。资料里有些细节没写到。') === false, '正文后才出现 → false（不误伤）')
  ok(inst.isInsufficient('') === false, '空文本 → false')

  console.log('\nE. 回答分块排版（toBlocks 经 setMsg 走真实路径）')
  inst = newInst()
  let id = inst.push('ai', '', true)
  inst.setMsg(id, '出花园当天穿红皮木屐。\n- 如今多数改穿红皮鞋\n- 木屐由外婆家送来\n\n**红**是最正的颜色。', false)
  let mm = inst.data.messages.find(function (x) { return x.id === id })
  ok(mm.blocks.length === 4, '切成 4 块（1 结论 + 2 列表 + 1 段落）', '实际 ' + mm.blocks.length)
  ok(mm.blocks[0].type === 'p' && mm.blocks[0].lead === true, '首段标记为结论（lead）')
  ok(mm.blocks[1].type === 'li' && mm.blocks[1].text === '如今多数改穿红皮鞋', '「- 」被识别成列表并去掉符号')
  ok(mm.blocks[3].text === '红是最正的颜色。', 'markdown 的 ** 已剥掉', mm.blocks[3].text)
  ok(mm.blocks[1].k !== mm.blocks[2].k, '每块有唯一 key（wx:key 不重复）')

  inst = newInst()
  id = inst.push('ai', '', true)
  inst.setMsg(id, '1. 择日\n2. 沐浴', false)
  mm = inst.data.messages.find(function (x) { return x.id === id })
  ok(mm.blocks.length === 2 && mm.blocks[1].type === 'li', '数字序号也识别为列表', JSON.stringify(mm.blocks.map(function (b) { return b.type })))

  console.log('\nF. SDK 时序：Promise 先 resolve、onFinish 后到')
  LATE_MODE = true
  inst = newInst()
  calls = 0
  m = await ask(inst, '出花园的英文怎么说？')
  ok(calls === 2, '仍能拿到完整文本并触发兜底（曾经这里会漏）', '实际 ' + calls)
  ok(m.general === true && m.sources.length === 0, '胶囊清空 + 标通用模式')
  LATE_MODE = false

  console.log('\n' + (fail === 0 ? '全部通过' : '失败 ' + fail + ' 项') + '：' + pass + ' 通过 / ' + fail + ' 失败')
  process.exit(fail === 0 ? 0 : 1)
})()
