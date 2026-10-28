// 首页 · 1:1 对应原型 ① 首页
const app = getApp();
const { nextChuHuaYuan, QIXI_RANGE } = require('../../utils/lunar.js');
const content = require('../../utils/content.js');
const { signOfDay } = require('../../utils/daily-copy.js');

// 「编辑推荐」的固定选题。标题/副标题/图标都从 content.js 取，
// 不在页面里复制一份 —— 否则改文章标题时首页不会跟着变。
const PICKED_IDS = ['why-clogs', 'twelve-flowers', 'head-dish'];

const imgFallback = require('../../utils/img-fallback.js');

Page({
  data: {
    statusBarHeight: 20,
    countdownDays: null,      // null 表示日期表已超出覆盖范围，UI 会退化为不显示天数
    cdSub: '距下一个七月初七',
    cdNote: '',
    sign: null,               // 每日民俗一签（按日期轮换，见 utils/daily-copy.js）
    // plan: true 表示该功能规划中（因主体资质限制未开放），入口处就给出标注，
    // 不让用户点进去才发现 —— 进去后是说明页，不是可用的功能。
    entries: [
      { key: 'culture', ch: '文', name: '文化科普', bg: 'rgba(201,160,85,.15)', color: '#B98D3E' },
      { key: 'ritual',  ch: '礼', name: '七步仪式', bg: 'rgba(200,68,60,.12)',  color: '#C8443C' },
      { key: 'quiz',    ch: '答', name: '知识闯关', bg: 'rgba(63,140,118,.13)', color: '#3F8C76' },
      { key: 'service', ch: '约', name: '服务预约', bg: 'rgba(43,35,32,.06)', color: '#A0937F', plan: true }
    ],
    // 「编辑推荐」：内容来自 utils/content.js，点击进详情页
    // 不显示编造的阅读量 —— 那是原型的演示数字
    reads: content.listArticles(PICKED_IDS).map(function (a) {
      return { id: a.id, icon: a.icon, t: a.title, s: a.sub, bg: a.bg };
    })
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight });
    this.setCountdown();
    this.setSign();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 应用可能跨天被重新唤起，倒计时与每日一签都重新算一次
    this.setCountdown();
    this.setSign();
  },

  /** 每日民俗一签：按本地日期轮换，7 条循环 */
  setSign() {
    const s = signOfDay();
    if (!this.data.sign || this.data.sign.quote !== s.quote) {
      this.setData({ sign: s });
    }
  },

  /**
   * 出花园正日倒计时
   * 数据来自 utils/lunar.js（逐年核对过的七夕公历日期表），不是写死的常量。
   */
  setCountdown() {
    const next = nextChuHuaYuan();
    if (!next) {
      // 超出覆盖范围：宁可显示「待更新」，也不显示一个算错的日子
      this.setData({
        countdownDays: null,
        cdSub: '距下一个七月初七',
        cdNote: '日期表覆盖 ' + QIXI_RANGE[0] + '–' + QIXI_RANGE[1] + ' 年，请更新 utils/lunar.js'
      });
      return;
    }
    this.setData({
      countdownDays: next.days,
      cdSub: next.days === 0 ? '就是今天 · 农历七月初七' : '距下一个七月初七',
      cdNote: '下一个正日 · ' + next.label
    });
  },

  onEntryTap(e) {
    const ds = e.currentTarget.dataset;

    // 「大家都在看」的条目带 data-id → 进文章详情页（这是原本断掉的那一环）
    if (ds.id) {
      return wx.navigateTo({ url: '/pages/article/article?id=' + ds.id });
    }

    const key = ds.key;
    const tabMap = { culture: '/pages/culture/culture', ritual: '/pages/ritual/ritual', assistant: '/pages/assistant/assistant' };
    const pageMap = { quiz: '/pages/quiz/quiz', service: '/pages/service/service', community: '/pages/community/community' };
    if (tabMap[key]) return wx.switchTab({ url: tabMap[key] });
    if (pageMap[key]) return wx.navigateTo({ url: pageMap[key] });
    // 兜底：正常不会走到（上面的 map 已覆盖全部入口），留作 data-key 写错时的保护
    wx.showToast({ title: '该入口暂不可用', icon: 'none' });
  },

  /** 配图加载失败 → 依次换扩展名，全失败再回退 emoji（逻辑在 utils/img-fallback.js） */
  onImgErr(e) { imgFallback.handle(this, e); },

  onShareAppMessage() {
    return { title: '出花园 · 潮汕人的十五岁成人礼', path: '/pages/index/index' };
  }
})
