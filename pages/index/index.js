// 首页 · 1:1 对应原型 ① 首页
const app = getApp();
const { nextChuHuaYuan, QIXI_RANGE } = require('../../utils/lunar.js');

Page({
  data: {
    statusBarHeight: 20,
    countdownDays: null,      // null 表示日期表已超出覆盖范围，UI 会退化为不显示天数
    cdSub: '距下一个吉日',
    cdNote: '',
    // plan: true 表示该功能规划中（因主体资质限制未开放），入口处就给出标注，
    // 不让用户点进去才发现 —— 进去后是说明页，不是可用的功能。
    entries: [
      { key: 'culture', ch: '文', name: '文化科普', bg: 'rgba(201,160,85,.15)', color: '#B98D3E' },
      { key: 'ritual',  ch: '礼', name: '七步仪式', bg: 'rgba(200,68,60,.12)',  color: '#C8443C' },
      { key: 'quiz',    ch: '答', name: '知识闯关', bg: 'rgba(63,140,118,.13)', color: '#3F8C76' },
      { key: 'service', ch: '约', name: '服务预约', bg: 'rgba(43,35,32,.06)', color: '#A0937F', plan: true }
    ],
    // 「大家都在看」：id 对应 utils/content.js 里的文章，点击进详情页
    // 注：原型的「4.2 万阅读」是演示数字，这里是真实版本，不显示编造的阅读量
    reads: [
      { id: 'why-clogs',      icon: '🪵', t: '为什么出花园要穿红木屐？', s: '明嘉靖状元林大钦的传说', bg: 'rgba(201,160,85,.14)' },
      { id: 'twelve-flowers', icon: '🌺', t: '十二花水到底是哪十二种花', s: '各地略有差异，没有唯一答案', bg: 'rgba(200,68,60,.11)' },
      { id: 'head-dish',      icon: '🐓', t: '头彩食十二碗，每碗都有彩头', s: '猪肚换肠肚 · 豆干做官', bg: 'rgba(63,140,118,.12)' }
    ]
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight });
    this.setCountdown();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 应用可能跨天被重新唤起，重新算一次
    this.setCountdown();
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
        cdSub: '距下一个吉日',
        cdNote: '日期表覆盖 ' + QIXI_RANGE[0] + '–' + QIXI_RANGE[1] + ' 年，请更新 utils/lunar.js'
      });
      return;
    }
    this.setData({
      countdownDays: next.days,
      cdSub: next.days === 0 ? '就是今天 · 出花园正日' : '距下一个吉日',
      cdNote: '下一个吉日 · ' + next.label
    });
  },

  onEntryTap(e) {
    const ds = e.currentTarget.dataset;

    // 「大家都在看」的条目带 data-id → 进文章详情页（这是原本断掉的那一环）
    if (ds.id) {
      return wx.navigateTo({ url: '/pages/article/article?id=' + ds.id });
    }

    const key = ds.key;
    const tabMap = { culture: '/pages/culture/culture', ritual: '/pages/ritual/ritual' };
    const pageMap = { quiz: '/pages/quiz/quiz', service: '/pages/service/service', community: '/pages/community/community' };
    if (tabMap[key]) return wx.switchTab({ url: tabMap[key] });
    if (pageMap[key]) return wx.navigateTo({ url: pageMap[key] });
    // 兜底：正常不会走到（上面的 map 已覆盖全部入口），留作 data-key 写错时的保护
    wx.showToast({ title: '该入口暂不可用', icon: 'none' });
  },

  onShareAppMessage() {
    return { title: '出花园 · 潮汕人的十五岁成人礼', path: '/pages/index/index' };
  }
})
