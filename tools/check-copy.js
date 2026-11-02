/**
 * 内容约束检查
 * 运行：node tools/check-copy.js
 *
 * 内容是这个产品的核心交付物，也是最容易「悄悄出错」的部分：
 * 改一句文案可能就超了画布宽度，加一道题可能就漏了关联文章。
 * 这些错在小程序里不会报错，只会静默地排版错乱或跳转失灵，所以固化成脚本。
 *
 * 三组检查（三个内容模块都是纯数据，可以直接 require）：
 *   A. 祝福卡文案 utils/blessing-copy.js
 *   B. 题库       utils/quiz-bank.js
 *   C. 文章       utils/content.js
 *
 * 脚本在工程外（chuhuayuan/tools/），不会打进小程序代码包。
 */

const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram', 'utils');
const content = require(path.join(MP, 'content.js'));
const bank = require(path.join(MP, 'quiz-bank.js'));
const copy = require(path.join(MP, 'blessing-copy.js'));
const daily = require(path.join(MP, 'daily-copy.js'));

let fail = 0;
function bad(msg) { console.log('   ✗ ' + msg); fail++; }
function ok(msg) { console.log('   ✓ ' + msg); }

/* ============================================================
 * A. 祝福卡文案
 * ============================================================ */
console.log('A. 祝福卡文案（utils/blessing-copy.js）');

// 画布宽 600px、左右各留 48px → 可用 504px；正文 34px/字 → 单行上限 14 字
const CARD_PAD = 48;
const CARD_W = 600;
const BODY_FONT = 34;
const MAX_PER_LINE = Math.floor((CARD_W - CARD_PAD * 2) / BODY_FONT);

const T = copy.TEMPLATES;
if (T.length < 12) bad('文案只有 ' + T.length + ' 条，要求 ≥ 12');
else ok('文案 ' + T.length + ' 条');

const scenes = {};
T.forEach(function (t, i) {
  const tag = '[' + (i + 1) + ']';
  if (!t.scene) bad(tag + ' 缺 scene');
  if (!Array.isArray(t.lines) || !t.lines.length) { bad(tag + ' 缺 lines'); return; }
  if (t.t !== t.lines.join('')) bad(tag + ' t 与 lines 拼接不一致：' + t.t);
  t.lines.forEach(function (ln) {
    const n = [...ln].length;           // 按字符数算（中文与全角标点都算一个字）
    if (n > MAX_PER_LINE) bad(tag + ' 单行 ' + n + ' 字超上限 ' + MAX_PER_LINE + '：' + ln);
  });
  if (t.lines.length > 3) bad(tag + ' 行数 ' + t.lines.length + ' 过多（画布正文区放 3 行已偏挤）');
  scenes[t.scene] = (scenes[t.scene] || 0) + 1;
});
console.log('   场景分布：' + Object.keys(scenes).map(function (k) {
  return k + ' ' + scenes[k];
}).join(' · '));
console.log('   单行上限 ' + MAX_PER_LINE + ' 字（画布 ' + CARD_W + 'px - 左右各 ' + CARD_PAD + 'px，正文 ' + BODY_FONT + 'px）');

/* ============================================================
 * B. 题库
 * ============================================================ */
console.log('\nB. 题库（utils/quiz-bank.js）');

const Q = bank.QUIZ;
if (Q.length < 30) bad('题量只有 ' + Q.length + ' 道，要求 ≥ 30');
else ok('题量 ' + Q.length + ' 道');

const byLv = { 1: 0, 2: 0, 3: 0 };
const artIds = new Set(content.ARTICLES.map(function (a) { return a.id; }));
const ansPos = { 0: 0, 1: 0, 2: 0, 3: 0 };

Q.forEach(function (q, i) {
  const tag = '第 ' + (i + 1) + ' 题';
  if (!q.q) bad(tag + ' 缺题干');
  if (!Array.isArray(q.o) || q.o.length < 2) bad(tag + ' 选项不足');
  if (!q.e) bad(tag + ' 缺解析');
  if (!q.art) bad(tag + ' 缺 art（答错后无处可回看）');
  else if (!artIds.has(q.art)) bad(tag + ' 的 art「' + q.art + '」不是有效文章 id');
  if (byLv[q.lv] === undefined) bad(tag + ' 的 lv「' + q.lv + '」不是 1/2/3');
  else byLv[q.lv]++;
  if (typeof q.a !== 'number' || q.a < 0 || q.a >= (q.o || []).length) {
    bad(tag + ' 答案下标 ' + q.a + ' 越界');
  } else {
    ansPos[q.a]++;
  }
  const dup = (q.o || []).filter(function (v, j, arr) { return arr.indexOf(v) !== j; });
  if (dup.length) bad(tag + ' 有重复选项：' + dup.join('、'));
});

// 题目 id：错题本与埋点按 id 关联，id 重复或缺省会直接串数据
const idList = Q.map(function (q) { return q.id; });
const dupIds = idList.filter(function (v, i) { return idList.indexOf(v) !== i; });
if (dupIds.length) bad('有重复的题目 id：' + dupIds.join('、'));
const badIdCount = Q.filter(function (q) { return !Number.isInteger(q.id) || q.id < 1; }).length;
if (badIdCount) bad('有 ' + badIdCount + ' 道题缺有效的数字 id');

Object.keys(byLv).forEach(function (lv) {
  if (byLv[lv] < 10) bad('难度 ' + bank.DIFF_NAME[lv] + ' 只有 ' + byLv[lv] + ' 题，要求 ≥ 10');
});
ok('难度分布：' + [1, 2, 3].map(function (lv) {
  return bank.DIFF_NAME[lv] + ' ' + byLv[lv];
}).join(' · '));

// 每轮抽题不能超过该档题量
bank.MIX.forEach(function (m) {
  if (m.n > byLv[m.lv]) bad('每轮从「' + bank.DIFF_NAME[m.lv] + '」抽 ' + m.n + ' 题，但该档只有 ' + byLv[m.lv] + ' 题');
});
ok('每轮 ' + bank.ROUND_SIZE + ' 题（' + bank.MIX.map(function (m) {
  return bank.DIFF_NAME[m.lv] + m.n;
}).join(' + ') + '）');

// 正确答案位置应分散，否则用户会靠「都选第一个」蒙对
const total = Q.length;
const skew = Object.keys(ansPos).some(function (k) {
  return ansPos[k] > total * 0.5;
});
console.log('   正确答案位置：A ' + ansPos[0] + ' · B ' + ansPos[1] + ' · C ' + ansPos[2]
  + (ansPos[3] ? ' · D ' + ansPos[3] : ''));
if (skew) bad('正确答案位置过于集中（某一项占一半以上），用户会靠位置蒙对');
else ok('正确答案位置分布正常');

// 抽题结果自检：题目不重复，且覆盖三档
const round0 = bank.pickRound(0);
if (round0.length !== bank.ROUND_SIZE) bad('pickRound 返回 ' + round0.length + ' 题，应为 ' + bank.ROUND_SIZE);
const uniq = new Set(round0.map(function (q) { return q.q; }));
if (uniq.size !== round0.length) bad('同一轮内出现重复题目');
else ok('同一轮内无重复题');

/* ============================================================
 * C. 文章
 * ============================================================ */
console.log('\nC. 文章（utils/content.js）');

const MIN_WORDS = 600;
let wordTotal = 0;
content.ARTICLES.forEach(function (a) {
  const w = content.wordCount(a);
  wordTotal += w;
  if (w < MIN_WORDS) bad('《' + a.title + '》只有 ' + w + ' 字，要求 ≥ ' + MIN_WORDS);
  if (!Array.isArray(a.sections) || !a.sections.length) {
    bad('《' + a.title + '》缺 sections');
    return;
  }
  a.sections.forEach(function (s, i) {
    if (!s.h) bad('《' + a.title + '》第 ' + (i + 1) + ' 节缺小标题');
    if (!Array.isArray(s.p) || !s.p.length) bad('《' + a.title + '》第 ' + (i + 1) + ' 节无段落');
  });
  if (typeof a.needVerify !== 'boolean') bad('《' + a.title + '》缺 needVerify 布尔值');

  // 正文是纯文本渲染，混进 markdown 会原样显示出来
  const plain = content.plainParagraphs(a).join('\n');
  const md = [];
  if (plain.indexOf('**') > -1) md.push('**加粗');
  if (plain.indexOf('|') > -1) md.push('| 表格');
  if (/^\s*#{1,6}\s/m.test(plain)) md.push('# 标题');
  if (/^\s*[-*]\s/m.test(plain)) md.push('- 列表');
  if (md.length) bad('《' + a.title + '》含 markdown 残留（' + md.join('、') + '），页面会原样显示');
});
ok('文章 ' + content.ARTICLES.length + ' 篇 · 正文合计 ' + wordTotal + ' 字 · 每篇 ≥ ' + MIN_WORDS + ' 字');

const needVerify = content.ARTICLES.filter(function (a) { return a.needVerify; }).length;
console.log('   其中 ' + needVerify + ' 篇标注了「需审校」（含地方差异或传说）');

// 每篇文章都应有题目关联，否则「错题回看」覆盖不全
content.ARTICLES.forEach(function (a) {
  const n = Q.filter(function (q) { return q.art === a.id; }).length;
  if (n === 0) bad('《' + a.title + '》没有任何题目关联，用户答错时不会被引导过去');
});
ok('每篇文章都有题目关联');

/* ============================================================ */
console.log('\nD. 每日民俗一签（utils/daily-copy.js）');
const S = daily.SIGNS;
if (S.length < 7) bad('每日一签只有 ' + S.length + ' 条，轮换周期太短（应 >= 7 条）');
else ok('共 ' + S.length + ' 条，' + S.length + ' 天轮换');

S.forEach(function (s, i) {
  const tag = '第 ' + (i + 1) + ' 条';
  if (!s.quote || !s.quote.trim()) bad(tag + ' 缺 quote');
  if (!s.text || s.text.trim().length < 20) bad(tag + ' text 过短（应 >= 20 字）');
  if (!s.more || !s.more.trim()) bad(tag + ' 缺 more 文案');
  if (!artIds.has(s.articleId)) bad(tag + ' articleId 不存在：' + s.articleId);
});
ok('引言、解读、跳转文案齐全，articleId 全部有效');

var seen = [];
for (var i2 = 0; i2 < S.length; i2++) {
  var q2 = daily.signOfDay(new Date(2026, 0, 1 + i2)).quote;
  if (seen.indexOf(q2) > -1) bad('轮换重复：第 ' + (i2 + 1) + ' 天与前面撞签');
  seen.push(q2);
}
if (seen.length === S.length && new Set(seen).size === S.length) {
  ok('连续 ' + S.length + ' 天不重复，轮换正常');
}

console.log('\n' + (fail === 0 ? '内容检查全部通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
