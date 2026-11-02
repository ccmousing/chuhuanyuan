/**
 * 页面级集成测试
 * 运行：node tools/verify-flow.js
 *
 * 思路：把 wx / Page / getApp 全部替身掉，然后**直接 require 真实的页面 js**，
 * 实例化后调用它的生命周期与事件处理函数，检查页面与 utils/store.js 之间的链路。
 *
 * 这样能覆盖"页面代码到底有没有正确调用存储"这件事 ——
 * 单元测试只测得到 store，测不到页面有没有真的用它。
 *
 * 脚本在工程外（chuhuayuan/tools/），不会打进小程序代码包。
 */

const path = require('path');
const MP = path.join(__dirname, '..', 'miniprogram');

/* ============ 1. 环境替身 ============ */
let mem = {};
const log = [];

global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); },
  removeStorageSync: (k) => { delete mem[k]; },

  showToast: (o) => log.push('toast: ' + (o && o.title)),
  showModal: (o) => { log.push('modal: ' + (o && o.title)); if (o && o.success) o.success({ confirm: true }); },
  pageScrollTo: () => {},
  switchTab: (o) => log.push('switchTab: ' + o.url),
  navigateTo: (o) => log.push('navigateTo: ' + o.url),
  redirectTo: (o) => log.push('redirectTo: ' + o.url),
  setNavigationBarTitle: (o) => log.push('title: ' + o.title),
  getWindowInfo: () => ({ statusBarHeight: 24, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 24, pixelRatio: 2 })
};

global.getApp = () => ({ globalData: { statusBarHeight: 24, userRegion: '通用' } });
global.getCurrentPages = () => [{}];

let captured = null;
global.Page = (o) => { captured = o; };
global.App = (o) => { captured = o; };
global.Component = (o) => { captured = o; };

/** 加载页面定义（每次清缓存，避免模块级状态串味） */
function loadPage(rel) {
  const abs = path.join(MP, rel);
  delete require.cache[require.resolve(abs)];
  captured = null;
  require(abs);
  if (!captured) throw new Error('未捕获到 Page(): ' + rel);
  return captured;
}

/** 按 Page 的形态造一个实例：带 data / setData / getTabBar */
function instantiate(pageObj) {
  const inst = Object.assign({}, pageObj);
  inst.data = JSON.parse(JSON.stringify(pageObj.data || {}));
  inst.setData = function (patch) {
    for (const k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      if (k.indexOf('.') > -1) {
        const seg = k.split('.');
        let cur = this.data;
        for (let i = 0; i < seg.length - 1; i++) cur = cur[seg[i]];
        cur[seg[seg.length - 1]] = patch[k];
      } else {
        this.data[k] = patch[k];
      }
    }
  };
  inst.getTabBar = () => null;   // 测试环境下没有真实 tabBar 组件
  return inst;
}

const store = require(path.join(MP, 'utils', 'store.js'));
const content = require(path.join(MP, 'utils', 'content.js'));
const bank = require(path.join(MP, 'utils', 'quiz-bank.js'));

let fail = 0;
function eq(actual, expect, desc) {
  const a = JSON.stringify(actual), b = JSON.stringify(expect);
  const ok = a === b;
  if (!ok) fail++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + desc + ' → ' + a + (ok ? '' : '（期望 ' + b + '）'));
}

/* ============ 2. 文章详情页 ============ */
console.log('A. 文章详情页（pages/article）');
const art = instantiate(loadPage('pages/article/article.js'));
art.onLoad({ id: 'why-clogs' });
eq(art.data.notFound, false, '能找到文章');
eq(art.data.a.id, 'why-clogs', '文章 id');
eq(art.data.mins >= 1, true, '阅读时长已计算');
// A1 正文扩写后的结构：sections（小标题 + 段落），篇幅达标
eq(Array.isArray(art.data.a.sections) && art.data.a.sections.length > 0, true, '正文按 sections 组织');
eq(art.data.words, content.wordCount(art.data.a), '字数由 content.wordCount 得出');
eq(art.data.words >= 600, true, '正文达到 600 字以上（实际 ' + art.data.words + ' 字）');
eq(art.data.a.sections.every(s => s.h && s.p && s.p.length), true, '每节都有小标题与段落');
// 正文是纯文本渲染，混入 markdown 会原样显示出来
eq(/\*\*|\|/.test(content.plainParagraphs(art.data.a).join('')), false, '正文不含 markdown 标记');
eq(art.data.related.length, 3, '延伸阅读 3 篇');
eq(art.data.related.some(r => r.id === 'why-clogs'), false, '延伸阅读不含自己');
eq(store.getReadCount(), 1, '阅读记录已写入');
eq(store.hasBadge('chushi'), true, '首次阅读解锁「初识花园」');

art.onToggleFav();
eq(art.data.fav, true, '点收藏 → 已收藏');
eq(store.getFavorites(), ['why-clogs'], '收藏已落盘');
art.onToggleFav();
eq(art.data.fav, false, '再点 → 取消收藏');
eq(store.getFavorites(), [], '取消后列表为空');

art.onToggleFav();   // 重新收藏，供收藏页测试
art.goArticle({ currentTarget: { dataset: { id: 'gongpopo' } } });
eq(log[log.length - 1], 'navigateTo: /pages/article/article?id=gongpopo', '跳转另一篇');
eq(art.goArticle({ currentTarget: { dataset: { id: 'why-clogs' } } }), undefined, '点自己不发跳转');

const art2 = instantiate(loadPage('pages/article/article.js'));
art2.onLoad({ id: '不存在' });
eq(art2.data.notFound, true, '无效 id → 显示未找到');
eq(art2.data.a, null, '未找到时文章为空');

console.log('\nB. 收藏页（pages/favorites）');
const fav = instantiate(loadPage('pages/favorites/favorites.js'));
fav.onShow();
eq(fav.data.empty, false, '有收藏时不显示空状态');
eq(fav.data.list.map(a => a.id), ['why-clogs'], '列出收藏的文章');
fav.onRemove({ currentTarget: { dataset: { id: 'why-clogs' } } });
eq(store.getFavorites(), [], '取消收藏后已移除');
eq(fav.data.empty, true, '空了以后切到空状态');
fav.onShow();
eq(fav.data.list.length, 0, '重新刷新仍为空');

console.log('\nC. 仪式页（pages/ritual）');
const rit = instantiate(loadPage('pages/ritual/ritual.js'));
rit.onLoad();
eq(rit.data.step, 0, '首次进入从第 1 步开始');
eq(rit.data.no, '01', '序号补零');
eq(store.getRitualStep(), -1, '★ 只是打开页面不写进度（否则「我的花园」会显示假的 1/7）');
eq(store.getRitualReached(), 0, '此时进度为 0/7');
eq(rit.onPrev(), undefined, '第 1 步点「上一步」不动');

for (let i = 0; i < 4; i++) rit.onNext();
eq(rit.data.step, 4, '走 4 步到第 5 步（咬鸡头）');
eq(rit.data.no, '05', '序号 05');
eq(store.hasBadge('yaojitou'), true, '第 5 步解锁「咬鸡头」');
eq(store.hasBadge('licheng'), false, '此时还没「礼成」');
eq(store.getRitualStep(), 4, '进度已写入存储');

rit.onNext(); rit.onNext();
eq(rit.data.step, 6, '走到第 7 步');
eq(store.hasBadge('licheng'), true, '走完解锁「礼成」');
eq(store.isRitualDone(), true, '标记为已完成');

rit.onNext();
eq(log[log.length - 1], 'switchTab: /pages/mine/mine', '最后一步 → 去我的花园');

rit.onPrev();
eq(rit.data.step, 5, '上一步可用');

// 恢复进度：重新加载页面应接着上次继续
const rit2 = instantiate(loadPage('pages/ritual/ritual.js'));
rit2.onLoad();
eq(rit2.data.step, 5, '重新进入恢复到上次进度');
eq(rit2.data.resumed, true, '并标记为「已恢复」');

// 重新走一遍
rit2.onReset();
eq(rit2.data.step, 0, '确认后回到第 1 步');
eq(store.getRitualStep(), -1, '存储也已归零');
eq(store.getRitualReached(), 0, '进度回到 0/7');
eq(store.hasBadge('licheng'), true, '重置进度不影响已得徽章');

console.log('\nD. 闯关页（pages/quiz）');
const quiz = instantiate(loadPage('pages/quiz/quiz.js'));
quiz.onLoad();
eq(quiz.data.total, bank.ROUND_SIZE, '每轮 ' + bank.ROUND_SIZE + ' 题（题库共 ' + bank.QUIZ.length + ' 题，分三档）');
eq(quiz.data.item.lv >= 1 && quiz.data.item.lv <= 3, true, '每道题都带难度档');
eq(quiz.data.diffName.length > 0, true, '难度档有中文名：' + quiz.data.diffName);
eq(quiz.data.letters.length, quiz.data.item.o.length, '字母数与选项数一致');
eq(quiz.data.finished, false, '初始未结束');
eq(quiz.data.canRead, true, '本题关联了文章（答完可回看）');

// 全答对一整轮
const ROUND = bank.ROUND_SIZE;
for (let i = 0; i < ROUND; i++) {
  quiz.onPick({ currentTarget: { dataset: { i: quiz.data.item.a } } });
  const picked = quiz.data.picked;
  const rightCount = quiz.data.qRight;
  const other = (quiz.data.item.a + 1) % quiz.data.item.o.length;
  quiz.onPick({ currentTarget: { dataset: { i: other } } });   // 已作答后再点别的选项
  if (i === 0) {
    eq(quiz.data.picked, picked, '已作答后再点其它选项不改变选择');
    eq(quiz.data.qRight, rightCount, '已作答后再点不重复计分');
  }
  quiz.onNext();
}
eq(quiz.data.finished, true, '答完一整轮出结果页');
eq(quiz.data.rate, 100, '正确率 100%');
eq(quiz.data.resEmoji, '🏆', '满分显示 🏆');
eq(quiz.data.wrongList.length, 0, '全对时错题列表为空');
eq(store.getQuiz(), { answered: ROUND, right: ROUND }, '答题记录累计 ' + ROUND + ' 对 ' + ROUND);
eq(store.hasBadge('daren'), true, '累计答对 8 题解锁「花园达人」');

quiz.onRestart();
eq(quiz.data.qi, 0, '再来一轮回到第 1 题');
eq(quiz.data.qRight, 0, '本轮计分清零');
eq(quiz.data.wrongList.length, 0, '错题列表也清零');
eq(store.getQuiz().right, ROUND, '累计成绩不受本轮影响');

// 答错：解析 + 错题入列 + 可回看原文（A3 的三条验收）
const q2 = instantiate(loadPage('pages/quiz/quiz.js'));
q2.onLoad();
const wrongIdx = (q2.data.item.a + 1) % q2.data.item.o.length;
q2.onPick({ currentTarget: { dataset: { i: wrongIdx } } });
eq(q2.data.expText.indexOf('✗') === 0, true, '答错时解析以 ✗ 开头');
eq(q2.data.expText.indexOf('正确答案是') > -1, true, '解析里给出正确选项');
eq(q2.data.wrongList.length, 1, '答错后进入错题列表');
eq(q2.data.wrongList[0].art, q2.data.item.art, '错题带着对应文章 id');
eq(q2.data.wrongList[0].correct, bank.ALL_LETTERS[q2.data.item.a], '错题记录了正确答案');

q2.goArt();
eq(log[log.length - 1], 'navigateTo: /pages/article/article?id=' + q2.data.item.art,
   '点「读这篇文章」跳到对应文章');
q2.goWrongArt({ currentTarget: { dataset: { id: 'why-clogs' } } });
eq(log[log.length - 1], 'navigateTo: /pages/article/article?id=why-clogs', '结果页点错题也能跳文章');

// 抽题应随轮次变化（否则「再来一轮」等于重做同一套）
const r0 = bank.pickRound(0).map(q => q.q).join('|');
const r1 = bank.pickRound(1).map(q => q.q).join('|');
eq(r0 !== r1, true, '不同轮次抽到不同题目');
eq(bank.pickRound(0).map(q => q.q).join('|') === r0, true, '同一轮次结果稳定（中途退出再进不换题）');

console.log('\nE. 我的花园（pages/mine）');
store.toggleFavorite('what-is');          // 先造一条收藏，让「我的收藏」有非零值可测
const mine = instantiate(loadPage('pages/mine/mine.js'));
mine.onLoad();
mine.onShow();
eq(mine.data.nick, '未设置', '默认未设置昵称');
eq(mine.data.avatar, '花', '默认头像字');
eq(mine.data.progress.reached, 0, '重置后进度为 0（只是打开页面不算走过）');
eq(mine.data.progress.percent, 0, '进度条 0%');
eq(mine.data.badges.length, 4, '徽章列表 4 个');
eq(mine.data.badges.filter(b => !b.locked).length, store.getBadges().length, '解锁状态与存储一致');
eq(mine.data.stats[1].n, String(store.getBadges().length), '统计里的徽章数来自存储');
eq(mine.data.stats[2].n, String(store.getQuiz().right), '统计里的累计答对来自存储');

const expFav = store.getFavorites().length + ' 篇 ›';
const expRate = '正确率 ' + Math.round(store.getQuiz().right / store.getQuiz().answered * 100) + '% ›';
eq(mine.data.menu.find(m => m.t === '我的收藏').v, expFav, '收藏篇数与存储一致');
eq(mine.data.menu.find(m => m.t === '闯关记录').v, expRate, '闯关正确率与存储一致');

// 编辑昵称（showModal 替身会自动确认，content 为空）
mine.editProfile();
eq(mine.data.nick, '未设置', '模态返回空内容时保持原样');

// 一键清除
mine.clearData();
eq(store.getBadges(), [], '清除后徽章为空');
eq(store.getQuiz(), { answered: 0, right: 0 }, '清除后答题为零');
eq(store.getFavorites(), [], '清除后收藏为空');
eq(mine.data.progress.reached, 0, '清除后页面也刷新了');
eq(mine.data.menu.find(m => m.t === '闯关记录').v, '还没闯过关 ›', '答完清零后文案回到未闯关态');

console.log('\nF. 首页（pages/index）');
const idx = instantiate(loadPage('pages/index/index.js'));
idx.onLoad();
eq(idx.data.reads.length, 3, '「大家都在看」3 条');
eq(idx.data.reads.every(r => content.getArticle(r.id)), true, '每条都指向真实存在的文章');
eq(idx.data.countdownDays > 0, true, '倒计时已算（今天距下个七夕）');
eq(typeof idx.data.cdNote === 'string' && idx.data.cdNote.length > 0, true, '倒计时说明已填');

idx.onEntryTap({ currentTarget: { dataset: { id: 'why-clogs' } } });
eq(log[log.length - 1], 'navigateTo: /pages/article/article?id=why-clogs', '文章条目 → 进详情页');
idx.onEntryTap({ currentTarget: { dataset: { key: 'ritual' } } });
eq(log[log.length - 1], 'switchTab: /pages/ritual/ritual', 'tab 条目 → switchTab');
idx.onEntryTap({ currentTarget: { dataset: { key: 'quiz' } } });
eq(log[log.length - 1], 'navigateTo: /pages/quiz/quiz', '二级页 → navigateTo');

console.log('\nG. 文化馆（pages/culture）');
const cul = instantiate(loadPage('pages/culture/culture.js'));
eq(cul.data.more.length, 3, '延伸阅读 3 篇');
eq(cul.data.more.every(a => content.getArticle(a.id)), true, '延伸阅读指向真实文章');
eq(cul.data.more.map(a => a.id).some(id => idx.data.reads.some(r => r.id === id)), false,
   '与文化馆延伸阅读不重复');
cul.onSegTap({ currentTarget: { dataset: { k: 'ct-3' } } });
eq(cul.data.seg, 'ct-3', '点分段切换高亮');
eq(cul.data.flash, 'ct-3', '并触发目标闪烁');
cul.goArticle({ currentTarget: { dataset: { id: 'gongpopo' } } });
eq(log[log.length - 1], 'navigateTo: /pages/article/article?id=gongpopo', '延伸阅读可跳详情');

console.log('\nH. 规划中的功能（pages/service、pages/community）');
// 这两个页面整体未开放（经营类目 / 社交类目，个人主体不予开放），
// 关键是：不能留「点了没反应」的死按钮，也不能有编造的互动数据。
const svc = instantiate(loadPage('pages/service/service.js'));
eq(typeof svc.onPlanTap, 'function', '服务页有「规划中」点击处理');
svc.onPlanTap({ currentTarget: { dataset: { t: '仪式操办 · 全套流程指导' } } });
eq(log[log.length - 1], 'modal: 尚未开放预约', '点「规划中」弹说明，不是死按钮');
const svcTxt = JSON.stringify(svc.data);
eq(/已服务|260\+|3 个工作日|已预约/.test(svcTxt), false, '服务页无编造的经营数据');
eq(svc.data.cats.length > 0, true, '分类可浏览（浏览行为不具欺骗性）');

const com = instantiate(loadPage('pages/community/community.js'));
eq(typeof com.onPlanTap, 'function', '社区页有「规划中」点击处理');
com.onPlanTap({ currentTarget: { dataset: { a: '点赞' } } });
eq(log[log.length - 1], 'modal: 尚未开放', '点互动按钮弹说明');
const comTxt = JSON.stringify(com.data);
eq(/"like"|"reply"/.test(comTxt), false, '社区页已删除点赞 / 评论数');
eq(/示例用户/.test(comTxt), true, '社区页人物标注为示例，不冒充真实用户');

console.log('\nI. 学习记录页 + 错题重练 + 本机埋点（B1/B2/B3/B7）');

// ---- 埋点（store 级，B7）----
eq(store.readTimes('what-is'), 0, '初始阅读次数为 0');
store.bumpRead('what-is');
store.bumpRead('what-is');
eq(store.readTimes('what-is'), 2, 'bumpRead 累加阅读次数');

store.bumpWrong(1);
store.bumpWrong(1);
store.bumpWrong(5);
eq(store.wrongTimes(1), 2, 'bumpWrong 累加错误次数');
eq(store.getWrongSet().sort(), [1, 5], '错题集去重（题 1 错两次只记一次）');

// ---- 学习记录页（B2+B3）----
const rec = instantiate(loadPage('pages/records/records.js'));
rec.onLoad({ tab: 'read' });
eq(rec.data.tab, 'read', '默认进入阅读记录 tab');
eq(rec.data.totalArticles, content.ARTICLES.length, '阅读列表共 6 篇');
eq(rec.data.readCount, 1, '已读 1 篇（what-is）');
eq(rec.data.readList.find(x => x.id === 'what-is').read, true, 'what-is 标记为已读');
eq(rec.data.readList.find(x => x.id === 'why-clogs').read, false, '未读的标记为未读');

rec.onTab({ currentTarget: { dataset: { t: 'quiz' } } });
eq(rec.data.tab, 'quiz', '切到错题本 tab');
eq(rec.data.wrongList.length, 2, '错题本 2 条');
eq(rec.data.wrongList[0].id, 1, '错得多的排前面（题 1 错 2 次）');
eq(rec.data.wrongList[0].art, 'what-is', '错题关联了对应文章');
rec.retryWrong();
eq(log[log.length - 1], 'navigateTo: /pages/quiz/quiz?mode=wrong', '「重练错题」跳错题模式');
rec.goArticle({ currentTarget: { dataset: { id: 'why-clogs' } } });
eq(log[log.length - 1], 'navigateTo: /pages/article/article?id=why-clogs', '点错题跳对应文章');

// ---- quiz 错题模式（B3）----
const qw = instantiate(loadPage('pages/quiz/quiz.js'));
qw.onLoad({ mode: 'wrong' });
eq(qw.data.wrongMode, true, '错题模式已生效');
eq(qw.data.total, 2, '错题模式只出 2 道待订正题');
eq(qw.data.item.id, 1, '第一题是错得最多的题 1');
qw.onPick({ currentTarget: { dataset: { i: qw.data.item.a } } });
eq(store.getWrongSet(), [5], '答对后从错题本移除（题 1 已订正）');
eq(store.wrongTimes(1), 2, '累计错误次数保留，统计不丢');

// 空池退回
store.resolveWrong(5);
const qw2 = instantiate(loadPage('pages/quiz/quiz.js'));
qw2.onLoad({ mode: 'wrong' });
eq(qw2.data.wrongMode, false, '没有错题时退回常规模式');
eq(qw2.data.total, bank.ROUND_SIZE, '退回后是常规一轮题量');
eq(log[log.length - 1], 'toast: 还没有错题，先做一轮常规闯关', '并提示原因');

console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
