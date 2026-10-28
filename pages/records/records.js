// 学习记录 · B2 阅读记录 + B3 错题本
//
// 数据全部来自本机存储（utils/store.js）：
//   readCounts —— 每篇读了几次      → 阅读记录
//   wrongSet   —— 待订正的错题 id   → 错题本
//   wrongCounts—— 每题累计错几次    → 错题排序（错了越多的排越前）
//
// 两个 tab 共用一个页面：内容都是"本机学习痕迹"，分两页反而更难找。

const store = require('../../utils/store.js');
const content = require('../../utils/content.js');
const bank = require('../../utils/quiz-bank.js');

/** 按 id 找题（不用 Array.prototype.find，避免个别旧机型不支持） */
function qById(id) {
  for (let i = 0; i < bank.QUIZ.length; i++) {
    if (bank.QUIZ[i].id === id) return bank.QUIZ[i];
  }
  return null;
}

const imgFallback = require('../../utils/img-fallback.js');

Page({
  data: {
    tab: 'read',

    // 阅读记录
    readList: [],
    readCount: 0,
    totalArticles: 0,
    readPercent: 0,

    // 错题本
    wrongList: []
  },

  onLoad(options) {
    // 从「我的花园」两个入口进来，用 tab 参数指定初始视图
    const tab = (options && options.tab) === 'quiz' ? 'quiz' : 'read';
    this.setData({ tab: tab });
    this.refresh();
  },

  onShow() {
    // 从文章详情页 / 闯关页返回时刷新，数据始终最新
    this.refresh();
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.t });
  },

  refresh() {
    const arts = content.ARTICLES;

    const readList = arts.map(function (a) {
      const times = store.readTimes(a.id);
      const read = times > 0 || store.isArticleRead(a.id);
      return {
        id: a.id, title: a.title, icon: a.icon, bg: a.bg,
        read: read,
        status: read
          ? (a.tag + ' · 读过 ' + times + ' 次')
          : (a.tag + ' · ' + a.sub)
      };
    });
    const readCount = readList.filter(function (x) { return x.read; }).length;

    // 错题本：按累计错误次数降序 —— 错得最多的排最前，最该先订正
    const wrongList = store.getWrongSet().map(function (id) {
      const q = qById(id);
      if (!q) return null;                       // 题目被删掉时不至于报错
      const art = content.getArticle(q.art);
      return {
        id: q.id,
        q: q.q,
        art: q.art,
        title: art ? art.title : '文化科普馆',
        times: store.wrongTimes(q.id)
      };
    }).filter(Boolean).sort(function (a, b) { return b.times - a.times; });

    this.setData({
      readList: readList,
      readCount: readCount,
      totalArticles: arts.length,
      readPercent: arts.length ? Math.round(readCount / arts.length * 100) : 0,
      wrongList: wrongList
    });
  },

  goArticle(e) {
    wx.navigateTo({ url: '/pages/article/article?id=' + e.currentTarget.dataset.id });
  },

  /** 只重练错题（quiz 页支持 mode=wrong） */
  retryWrong() {
    wx.navigateTo({ url: '/pages/quiz/quiz?mode=wrong' });
  },

  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  /** 配图加载失败 → 依次换扩展名，全失败再回退 emoji（逻辑在 utils/img-fallback.js） */
  onImgErr(e) { imgFallback.handle(this, e); },

  onShareAppMessage() {
    return { title: '出花园 · 潮汕人的十五岁成人礼', path: '/pages/index/index' };
  }
});
