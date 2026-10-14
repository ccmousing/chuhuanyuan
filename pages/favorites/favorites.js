// 我的收藏 · 读本机存储中的收藏 id，再从内容库取文章
const store = require('../../utils/store.js');
const content = require('../../utils/content.js');

Page({
  data: {
    list: [],
    empty: true
  },

  // 用 onShow 而不是 onLoad：从文章页取消收藏后返回，列表要立刻更新
  onShow() {
    this.refresh();
  },

  refresh() {
    const list = content.listArticles(store.getFavorites());
    this.setData({ list: list, empty: list.length === 0 });
  },

  goArticle(e) {
    wx.navigateTo({ url: '/pages/article/article?id=' + e.currentTarget.dataset.id });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消收藏？',
      content: '将从收藏列表移除这篇文章。',
      success: (r) => {
        if (!r.confirm) return;
        store.toggleFavorite(id);
        this.refresh();
      }
    });
  },

  goCulture() {
    wx.switchTab({ url: '/pages/culture/culture' });
  },

  onShareAppMessage() {
    return { title: '出花园 · 潮汕人的十五岁成人礼', path: '/pages/index/index' };
  }
});
