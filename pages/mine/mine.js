// 我的花园 · 1:1 对应原型 ⑦ 我的花园
// 页面上所有数字都来自本机存储（utils/store.js），没有写死的演示数据。

const app = getApp();
const store = require('../../utils/store.js');
const content = require('../../utils/content.js');

const TOTAL_STEPS = 7;

Page({
  data: {
    statusBarHeight: 20,
    avatar: '花',
    nick: '',
    sub: '',
    stats: [],
    progress: { reached: 0, done: false, percent: 0 },
    badges: [],
    menu: []
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.refresh();   // 从别的页面回来时刷新，数字始终是最新的
  },

  refresh() {
    const reached = store.getRitualReached();          // 0..7
    const done = store.isRitualDone();
    const q = store.getQuiz();
    const owned = store.getBadges();
    const favs = store.getFavorites();
    const readCount = store.getReadCount();
    const cards = store.getCardCount();
    const p = store.getProfile();
    const rate = q.answered ? Math.round(q.right / q.answered * 100) : 0;
    const wrongCount = store.getWrongSet().length;   // 待订正的错题数

    // 徽章：解锁的亮起，未解锁的灰显并显示解锁条件
    const badges = [];
    for (let i = 0; i < content.BADGES.length; i++) {
      const b = content.BADGES[i];
      badges.push({
        id: b.id, e: b.e, n: b.n, hint: b.hint,
        locked: owned.indexOf(b.id) === -1
      });
    }

    this.setData({
      // 头像取昵称首字；没设置就用「花」。在 JS 里算好，不在 WXML 里写字符串下标
      avatar: p.nick ? p.nick.charAt(0) : '花',
      nick: p.nick || '未设置',
      sub: p.nick
        ? (p.year ? p.year + ' 年出花园' : '点击可修改资料')
        : '点击设置昵称',

      stats: [
        { n: String(reached), l: '走过仪式步骤' },
        { n: String(owned.length), l: '获得徽章' },
        { n: String(q.right), l: '累计答对' }
      ],

      progress: {
        reached: reached,
        done: done,
        percent: Math.round(reached / TOTAL_STEPS * 100)
      },

      badges: badges,

      menu: [
        { e: '⭐', t: '我的收藏', v: favs.length + ' 篇 ›', act: 'favorites' },
        { e: '📖', t: '阅读进度', v: readCount + ' / ' + content.ARTICLES.length + ' 篇 ›', act: 'records' },
        { e: '🎯', t: '闯关记录', v: wrongCount ? wrongCount + ' 道错题待订正 ›' : (q.answered ? '正确率 ' + rate + '% ›' : '还没闯过关 ›'), act: 'recordsQuiz' },
        { e: '🎴', t: '生成的祝福卡', v: cards + ' 张 ›', act: 'blessing' },
        // off: true → 整行弱化显示，提示这是规划中、尚未开放的功能
        { e: '📋', t: '我的预约', v: '规划中 · 需个体工商户', act: '', off: true },
        { e: '🌸', t: '我发布的', v: '规划中 · 需内容安全机制', act: '', off: true },
        { e: '🧹', t: '清除本机数据', v: '›', act: 'clear' }
      ]
    });
  },

  /* ---------------- 资料 ---------------- */
  editProfile() {
    const p = store.getProfile();
    wx.showModal({
      title: '设置昵称',
      editable: true,
      placeholderText: '如：阿澄',
      content: p.nick || '',
      success: (r) => {
        if (!r.confirm) return;
        store.setProfile({ nick: (r.content || '').trim().slice(0, 8) });
        this.refresh();
      },
      fail: () => wx.showToast({ title: '当前微信版本不支持编辑，请升级', icon: 'none' })
    });
  },

  editYear() {
    const p = store.getProfile();
    wx.showModal({
      title: '出花园年份（可留空）',
      editable: true,
      placeholderText: '如：2024',
      content: p.year || '',
      success: (r) => {
        if (!r.confirm) return;
        store.setProfile({ year: (r.content || '').replace(/[^0-9]/g, '').slice(0, 4) });
        this.refresh();
      }
    });
  },

  /* ---------------- 跳转 ---------------- */
  goBlessing() {
    wx.navigateTo({ url: '/pages/blessing/blessing' });
  },

  onMenu(e) {
    const act = e.currentTarget.dataset.act;
    if (act === 'favorites') return wx.navigateTo({ url: '/pages/favorites/favorites' });
    if (act === 'blessing') return wx.navigateTo({ url: '/pages/blessing/blessing' });
    if (act === 'records') return wx.navigateTo({ url: '/pages/records/records?tab=read' });
    if (act === 'recordsQuiz') return wx.navigateTo({ url: '/pages/records/records?tab=quiz' });
    if (act === 'clear') return this.clearData();

    // 规划中的功能（预约 / 社区）——如实说明原因，不假装能用
    wx.showModal({
      title: '该功能未开放',
      content: '服务预约属经营类目、社区发帖属社交类目，个人主体小程序不予开放，需先注册个体工商户或企业主体。详见交付目录里的《上线实操路线图》。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /** 一键清除本机数据（隐私合规要求） */
  clearData() {
    wx.showModal({
      title: '清除本机数据？',
      content: '将删除仪式进度、徽章、收藏、答题记录与昵称。此操作不可撤销，云端无备份。',
      confirmText: '清除',
      confirmColor: '#C8443C',
      success: (r) => {
        if (!r.confirm) return;
        store.clearAll();
        this.refresh();
        wx.showToast({ title: '已清除', icon: 'success' });
      }
    });
  },

  onShareAppMessage() {
    return { title: '出花园 · 潮汕人的十五岁成人礼', path: '/pages/index/index' };
  }
});
