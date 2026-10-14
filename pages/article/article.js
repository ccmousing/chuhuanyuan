// 文章详情 · 内容来自 utils/content.js
// 页面只认 id，正文改在 content.js，不需要动这里。

const content = require('../../utils/content.js');
const store = require('../../utils/store.js');

Page({
  data: {
    a: null,
    notFound: false,
    fav: false,
    words: 0,
    mins: 1,
    related: []
  },

  onLoad(options) {
    this.showArticle((options && options.id) || '');
  },

  showArticle(id) {
    const a = content.getArticle(id);
    if (!a) {
      this.setData({ notFound: true, a: null });
      wx.setNavigationBarTitle({ title: '出花园' });
      return;
    }

    const words = content.wordCount(a);
    const related = content.listArticles()
      .filter(function (x) { return x.id !== id; })
      .slice(0, 3);

    this.setData({
      a: a,
      notFound: false,
      fav: store.isFavorite(id),
      words: words,
      // 按中文约 300 字/分钟估阅读时长
      mins: Math.max(1, Math.round(words / 300)),
      related: related
    });

    wx.setNavigationBarTitle({ title: a.tag + ' · 出花园' });

    // 记录阅读进度，首次阅读解锁「初识花园」
    store.markArticleRead(id);
    store.bumpRead(id);   // B7：本机阅读次数埋点，学习记录页读它
    if (store.unlockBadge('chushi')) {
      wx.showToast({ title: '解锁徽章：初识花园', icon: 'none', duration: 2000 });
    }
  },

  onToggleFav() {
    if (!this.data.a) return;
    const fav = store.toggleFavorite(this.data.a.id);
    this.setData({ fav: fav });
    wx.showToast({ title: fav ? '已加入收藏' : '已取消收藏', icon: 'none' });
  },

  // 详情页之间互跳：层级过深时改用 redirectTo，避免页面栈超 10 层后跳不动
  goArticle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || (this.data.a && id === this.data.a.id)) return;
    const url = '/pages/article/article?id=' + id;
    if (getCurrentPages().length >= 9) {
      wx.redirectTo({ url: url });
    } else {
      wx.navigateTo({ url: url });
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 分享带 id —— 对方点开直接落到这篇文章（详情页是非 tabBar 页，参数有效）
  onShareAppMessage() {
    const a = this.data.a;
    return {
      title: a ? a.title : '出花园 · 潮汕人的十五岁成人礼',
      path: a ? ('/pages/article/article?id=' + a.id) : '/pages/index/index'
    };
  }
});
