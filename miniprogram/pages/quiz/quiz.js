// 知识闯关 · 对应原型 ④ 知识闯关
//
// 题库在 utils/quiz-bank.js（30 题 / 三档难度），本页只管流程与展示。
// 每轮抽 10 题，答错可跳到对应文章回看原文。
//
// 答题记录写入 utils/store.js，「我的花园」读的是同一份数据。

const store = require('../../utils/store.js');
const content = require('../../utils/content.js');
const bank = require('../../utils/quiz-bank.js');

const ROUND_SIZE = bank.ROUND_SIZE;

Page({
  data: {
    qi: 0,
    total: ROUND_SIZE,
    qRight: 0,
    picked: -1,
    percent: 0,
    letters: ['A', 'B', 'C'],
    item: null,
    diffName: '',
    expText: '',
    artTitle: '',        // 本题关联文章标题（答后可回看）
    canRead: false,

    wrongMode: false,    // 错题重练模式

    wrongList: [],       // 本轮错题，结果页可逐一回看

    finished: false,
    rate: 0,
    resEmoji: '',
    resText: '',
    history: { answered: 0, right: 0 }
  },

  onLoad(options) {
    const mode = (options && options.mode) === 'wrong' ? 'wrong' : 'normal';
    this._mode = mode;
    // 错题重练没题可出时退回常规闯关，避免抽到空池
    if (mode === 'wrong' && store.getWrongSet().length === 0) {
      this._mode = 'normal';
      wx.showToast({ title: '还没有错题，先做一轮常规闯关', icon: 'none' });
    }
    this._round = this.pickQuestions();
    this.setData({
      history: store.getQuiz(),
      total: this._round.length,
      wrongMode: this._mode === 'wrong'
    });
    this.loadQ(0);
  },

  /** 抽本轮题：错题模式只出待订正的错题；常规模式按轮次抽 */
  pickQuestions() {
    if (this._mode === 'wrong') {
      return bank.pickByIds(store.getWrongSet());
    }
    const rounds = Math.floor(store.getQuiz().answered / ROUND_SIZE);
    return bank.pickRound(rounds);
  },

  /** 装载第 i 题 */
  loadQ(i) {
    const it = this._round[i];
    const art = it.art ? content.getArticle(it.art) : null;
    this.setData({
      qi: i,
      item: it,
      letters: bank.lettersOf(it.o.length),
      picked: -1,
      expText: '',
      diffName: bank.DIFF_NAME[it.lv] || '',
      artTitle: art ? art.title : '',
      canRead: !!art,
      percent: this._round.length ? Math.round((i + 1) / this._round.length * 100) : 0
    });
  },

  onPick(e) {
    if (this.data.picked >= 0) return;   // 已作答就不再响应
    const i = Number(e.currentTarget.dataset.i);
    const item = this.data.item;
    const right = i === item.a;

    // 落盘：累计答对 8 题解锁「花园达人」
    const h = store.addQuizAnswer(right);
    if (right) store.resolveWrong(item.id);   // 答对即订正（常规与错题模式都适用）
    const gotBadge = h.right >= 8 && store.unlockBadge('daren');

    // 错题记下来，结果页可逐一回看原文
    const wrongList = this.data.wrongList.slice();
    if (!right && item.art) {
      wrongList.push({
        q: item.q, art: item.art, title: this.data.artTitle,
        yours: bank.ALL_LETTERS[i], correct: bank.ALL_LETTERS[item.a]
      });
    }

    this.setData({
      picked: i,
      qRight: this.data.qRight + (right ? 1 : 0),
      history: h,
      wrongList: wrongList,
      expText: (right ? '✓ 答对了。' : '✗ 正确答案是 ' + bank.ALL_LETTERS[item.a] + '。') + item.e
    });

    if (gotBadge) {
      wx.showToast({ title: '解锁徽章：花园达人', icon: 'none', duration: 2000 });
    }
  },

  onNext() {
    if (this.data.qi === this._round.length - 1) return this.finish();
    this.loadQ(this.data.qi + 1);
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  /** 跳到本题关联的文章回看原文 */
  goArt() {
    const it = this.data.item;
    if (!it || !it.art) return;
    wx.navigateTo({ url: '/pages/article/article?id=' + it.art });
  },

  /** 结果页里点某道错题，跳对应文章 */
  goWrongArt(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/article/article?id=' + id });
  },

  /** 出结果页，而不是直接跳走 */
  finish() {
    const right = this.data.qRight;
    const rate = Math.round(right / this._round.length * 100);

    let emoji = '💪';
    let text = '别急。先去文化科普馆读一遍那几篇短文，回来会顺手很多。';
    if (rate === 100) { emoji = '🏆'; text = '全对。你对出花园的了解已经超过大多数人。'; }
    else if (rate >= 80) { emoji = '🎉'; text = '很扎实。个别细节再补一下就完整了。'; }
    else if (rate >= 60) { emoji = '👍'; text = '及格了。下面列出的错题，点进去读一读就补上了。'; }

    this.setData({
      finished: true, rate: rate, resEmoji: emoji, resText: text,
      history: store.getQuiz()
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onRestart() {
    // 错题模式：从「当前」错题池重抽（已订正的不再出现）；常规模式按轮次换批
    this._round = this.pickQuestions();
    this.setData({
      qRight: 0, picked: -1, expText: '', wrongList: [],
      total: this._round.length,
      finished: false, rate: 0
    });
    this.loadQ(0);
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  // 本页是非 tabBar 页面，query 参数有效：对方点开直接进闯关（带来源标记便于统计）
  onShareAppMessage() {
    return {
      title: '出花园知识闯关 · 你能答对几题？',
      path: '/pages/quiz/quiz?from=share'
    };
  }
});
