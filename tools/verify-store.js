/**
 * 存储与内容模块的逻辑自测
 * 运行：node tools/verify-store.js
 *
 * 微信的 wx.* API 在 Node 里不存在，这里用一个**内存替身**顶上，
 * 就能脱离开发者工具验证 utils/store.js 的读写、去重、清除与异常降级。
 *
 * 这个脚本在工程外（chuhuayuan/tools/），不会打进小程序代码包。
 */

const path = require('path');
const MP = path.join(__dirname, '..', 'miniprogram');

let mem = {};
let throwOnWrite = false;

global.wx = {
  getStorageSync(k) { return mem[k]; },
  setStorageSync(k, v) {
    if (throwOnWrite) { const e = new Error('storage full'); e.errMsg = 'setStorageSync:fail'; throw e; }
    mem[k] = JSON.parse(JSON.stringify(v));
  },
  removeStorageSync(k) { delete mem[k]; }
};

const store = require(path.join(MP, 'utils', 'store.js'));
const content = require(path.join(MP, 'utils', 'content.js'));

let fail = 0;
function eq(actual, expect, desc) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expect);
  const ok = a === b;
  if (!ok) fail++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + desc + ' → ' + a + (ok ? '' : '（期望 ' + b + '）'));
}

console.log('A. 内容库');
eq(content.ARTICLES.length, 6, '文章数');
eq(content.getArticle('why-clogs') !== null, true, '按 id 取文章');
eq(content.getArticle('不存在'), null, '不存在的 id 返回 null');
eq(content.listArticles(['three-cities', 'what-is']).map(a => a.id), ['three-cities', 'what-is'], 'listArticles 按传入顺序');
eq(content.listArticles(['three-cities', '不存在']).length, 1, 'listArticles 过滤无效 id');
eq(content.BADGES.length, 4, '徽章数');

console.log('\nB. 初始状态（空存储）');
eq(store.getRitualReached(), 0, '仪式已走步数');
eq(store.isRitualDone(), false, '仪式未完成');
eq(store.getQuiz(), { answered: 0, right: 0 }, '答题记录');
eq(store.getFavorites(), [], '收藏列表');
eq(store.getBadges(), [], '徽章列表');
eq(store.getReadCount(), 0, '阅读篇数');
eq(store.getCardCount(), 0, '祝福卡张数');
eq(store.getProfile(), { nick: '', year: '', region: '通用' }, '个人资料');

console.log('\nC. 仪式进度');
store.setRitualStep(3);
eq(store.getRitualReached(), 4, '设到下标 3 → 走过 4 步');
store.setRitualStep(6);
eq(store.isRitualDone(), true, '下标 6 → 已完成');
store.resetRitual();
eq(store.getRitualStep(), -1, '归零后下标为 -1');
eq(store.getRitualReached(), 0, '归零后进度为 0');
eq(store.isRitualDone(), false, '归零后不再标记完成');
store.setRitualStep(6);

console.log('\nD. 答题记录（累加）');
store.addQuizAnswer(true);
store.addQuizAnswer(false);
store.addQuizAnswer(true);
eq(store.getQuiz(), { answered: 3, right: 2 }, '累加 3 题对 2');
store.resetQuiz();
eq(store.getQuiz(), { answered: 0, right: 0 }, '重置');

console.log('\nE. 收藏（可反复切换）');
eq(store.toggleFavorite('why-clogs'), true, '首次收藏 → 已收藏');
eq(store.isFavorite('why-clogs'), true, '查询为已收藏');
eq(store.toggleFavorite('why-clogs'), false, '再次点击 → 取消收藏');
eq(store.isFavorite('why-clogs'), false, '查询为未收藏');
store.toggleFavorite('gongpopo');
store.toggleFavorite('what-is');
eq(store.getFavorites(), ['gongpopo', 'what-is'], '收藏两个后列表正确');
eq(content.listArticles(store.getFavorites()).map(a => a.title), ['公婆母是谁，为什么要拜？', '出花园到底是什么？'], '收藏可还原成文章对象');

console.log('\nF. 徽章（只解锁一次）');
eq(store.unlockBadge('chushi'), true, '首次解锁返回 true');
eq(store.unlockBadge('chushi'), false, '重复解锁返回 false（不弹二次提示）');
eq(store.getBadges(), ['chushi'], '徽章不重复入列');

console.log('\nG. 阅读记录（去重）');
eq(store.markArticleRead('what-is'), 1, '首次阅读计 1 篇');
eq(store.markArticleRead('what-is'), 1, '重复阅读不增加');
eq(store.markArticleRead('why-clogs'), 2, '换一篇计 2 篇');

console.log('\nH. 个人资料');
store.setProfile({ nick: '阿澄' });
eq(store.getProfile().nick, '阿澄', '只改昵称不动年份');
store.setProfile({ year: '2024' });
eq(store.getProfile(), { nick: '阿澄', year: '2024', region: '通用' }, '三个字段都在，地区默认通用');
store.setProfile({ region: '潮州' });
eq(store.getProfile().region, '潮州', '地区可写入');
eq(store.getProfile().nick, '阿澄', '改地区不影响昵称');
store.setProfile({ region: '通用' });

console.log('\nI. 祝福卡计数');
store.addCard(); store.addCard();
eq(store.getCardCount(), 2, '累计 2 张');

console.log('\nJ. 异常降级（存储写入抛异常时不能崩）');
throwOnWrite = true;
let crashed = false;
try {
  store.setRitualStep(6);
  store.toggleFavorite('head-dish');
  store.unlockBadge('daren');
  store.addQuizAnswer(true);
} catch (e) { crashed = true; }
eq(crashed, false, '写入失败时不抛异常到调用方');
throwOnWrite = false;

console.log('\nK. 一键清除');
store.clearAll();
eq(store.getRitualReached(), 0, '进度已清');
eq(store.getQuiz(), { answered: 0, right: 0 }, '答题已清');
eq(store.getFavorites(), [], '收藏已清');
eq(store.getBadges(), [], '徽章已清');
eq(store.getProfile(), { nick: '', year: '', region: '通用' }, '资料已清（地区回落默认）');
eq(mem['chy_v1'], undefined, 'key 已从存储移除');

console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
