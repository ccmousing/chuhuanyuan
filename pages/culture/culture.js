// 文化馆 · 1:1 对应原型 ② 文化科普馆
const content = require('../../utils/content.js');

// 分段配置：k 必须与 wxml 里各区块的 id 完全一致
const SEGS = [
  { k: 'ct-1', n: '典故' },
  { k: 'ct-2', n: '时间轴' },
  { k: 'ct-3', n: '符号图鉴' },
  { k: 'ct-4', n: '三地差异' }
];

// 激活线偏移（px）：吸顶分段条约 52px 高，再往下留一点余量
const LINE_OFFSET = 70;

/**
 * 搜索文章（B1）：标题、副标题、标签、正文都参与匹配。
 * 只有 6 篇，直接线性扫描即可 —— 不值得为它引入索引结构。
 * 命中正文时给出一小段上下文，比只显示标题有用得多。
 */
function searchArticles(kw) {
  const k = kw.toLowerCase();
  const out = [];
  content.ARTICLES.forEach(function (a) {
    const titleHay = (a.title + ' ' + a.sub + ' ' + a.tag).toLowerCase();
    const text = content.plainParagraphs(a).join(' ');
    const idx = text.toLowerCase().indexOf(k);
    if (titleHay.indexOf(k) === -1 && idx === -1) return;
    out.push({
      id: a.id, title: a.title, icon: a.icon, bg: a.bg, tag: a.tag,
      snippet: idx > -1 ? snippetOf(text, idx, kw.length) : a.sub
    });
  });
  return out;
}

/** 截取命中处前后一小段作为摘要 */
function snippetOf(text, idx, len) {
  const start = Math.max(0, idx - 12);
  const end = Math.min(text.length, idx + len + 30);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

const imgFallback = require('../../utils/img-fallback.js');

Page({
  data: {
    seg: 'ct-1',
    flash: '',
    segs: SEGS,

    // 搜索（B1）：kw 非空时页面切换为搜索结果视图
    kw: '',
    results: [],

    timeline: [
      { t: '周代 · 冠笄之礼', s: '男子二十而冠、女子十五而笄，标志由家庭走向社会' },
      { t: '明嘉靖 · 林大钦传说', s: '穿红木屐获赠公鸡，父以鸡头奖励，后高中状元——遂成咬鸡头、穿红屐之俗' },
      { t: '明清以降 · 民间普及', s: '仪式环节日益完备，随潮人足迹传至东南亚' },
      { t: '2014 / 2018 · 非遗认定', s: '入选汕头市级、广东省第七批省级非物质文化遗产名录' },
      { t: '近年 · 三地联动 + 线上化', s: '汕潮揭各具特色办集体成人礼；已有线上「出花园」先例' }
    ],

    symbols: [
      { e: '🪵', n: '红木屐', d: '脚踏实地 前程开阔' },
      { e: '🌺', n: '石榴花', d: '多籽多福 平安吉祥' },
      { e: '💧', n: '十二花水', d: '洗去稚气 去秽纳新' },
      { e: '🐓', n: '公鸡', d: '独占鳌头 朝气勃发' },
      { e: '🍑', n: '红桃粿', d: '桃形长寿 喜庆吉粿' },
      { e: '🧧', n: '腰兜', d: '桂圆铜钱 贴身祝福' }
    ],

    cities: [
      { n: '汕', title: '汕头 · 规模化集体传承', sub: '老妈宫戏台，单场数十组家庭、跨城参与', bg: 'rgba(200,68,60,.12)' },
      { n: '潮', title: '潮州 · 侨乡 + 歌册「做四句」', sub: '海阳县儒学宫，面向海内外潮籍青少年', bg: 'rgba(201,160,85,.15)' },
      { n: '揭', title: '揭阳 · 学宫文明实践', sub: '挽面插花、敬先贤拜孔子、击鼓明志', bg: 'rgba(63,140,118,.12)' }
    ],

    // 延伸阅读：首页放 3 篇，这里放另外 3 篇，两边不重复
    more: content.listArticles(['gongpopo', 'three-cities', 'what-is'])
  },

  onReady() {
    // 页面渲染完成后量一次各区块的绝对位置（内容是静态的，量一次即可）
    this.measureSections();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  /** 打开文章详情页 */
  goArticle(e) {
    wx.navigateTo({ url: '/pages/article/article?id=' + e.currentTarget.dataset.id });
  },

  /* ---------------- 搜索（B1） ---------------- */

  onSearch(e) {
    const kw = String((e.detail && e.detail.value) || '').trim();
    if (!kw) return this.clearSearch();
    this.setData({ kw: kw, results: searchArticles(kw) });
  },

  clearSearch() {
    if (!this.data.kw) return;
    this.setData({ kw: '', results: [] });
    // 常规内容重新渲染后区块位置变了，得重新量一次，否则分段跳转会跳错位置
    setTimeout(() => this.measureSections(), 0);
  },

  /** 预量各区块纵坐标（px） */
  measureSections() {
    const q = wx.createSelectorQuery();
    SEGS.forEach(s => q.select('#' + s.k).boundingClientRect());
    q.selectViewport().scrollOffset();
    q.exec(res => {
      if (!res || res.length < SEGS.length + 1) return;
      const scrollTop = (res[res.length - 1] || {}).scrollTop || 0;
      const tops = [];
      for (let i = 0; i < SEGS.length; i++) {
        tops.push(res[i] ? res[i].top + scrollTop : 0);
      }
      this._tops = tops;
    });
  },

  /** 点击分段 → 跳转到对应区块 + 目标闪一下 */
  onSegTap(e) {
    const k = e.currentTarget.dataset.k;
    this._lockUntil = Date.now() + 700;   // 跳转动画期间别被 scrollspy 抢走高亮
    this.setData({ seg: k, flash: k });
    wx.pageScrollTo({ selector: '#' + k, duration: 300 });
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => this.setData({ flash: '' }), 1200);
  },

  /** 手动滚动时同步分段高亮 */
  onPageScroll(e) {
    if (this._lockUntil && Date.now() < this._lockUntil) return;
    const tops = this._tops;
    if (!tops || tops.length !== SEGS.length) return;

    const line = e.scrollTop + LINE_OFFSET;
    let idx = 0;
    for (let i = 0; i < tops.length; i++) {
      if (tops[i] <= line) idx = i;
    }
    if (idx === this._segIdx) return;      // 只在变化时 setData，避免滚动抖动
    this._segIdx = idx;
    if (this.data.seg !== SEGS[idx].k) this.setData({ seg: SEGS[idx].k });
  },

  // 本页是 tabBar 页面，分享 path 上的 query 会被微信忽略，因此落到首页。
  // 需要「分享到具体内容」的页面请参考 article / quiz / blessing 的写法。
  /** 配图加载失败 → 依次换扩展名，全失败再回退 emoji（逻辑在 utils/img-fallback.js） */
  onImgErr(e) { imgFallback.handle(this, e); },

  onShareAppMessage() {
    return { title: '出花园 · 潮汕人的十五岁成人礼', path: '/pages/index/index' };
  }
})
