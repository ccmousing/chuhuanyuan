/**
 * RAG 检索评估（20 题）
 * 运行：node tools/eval-rag.js
 *
 * 评的是什么：**检索层**的判定对不对，不评模型生成质量。
 *   ① 该答的有没有答（误拒 = 用户白问一次）
 *   ② 不该答的有没有拒（误答 = 用户看到编造内容，比拒答严重）
 *   ③ 答了的话，top1 是不是来自正确的文章
 * 另外扫一遍 MIN_COVER，看阈值该定在哪。
 *
 * 输出：控制台报告 + rag/eval-report.md
 */
const fs = require('fs');
const path = require('path');

const kb = require('../miniprogram/utils/kb-search.js');
const SET = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rag', 'eval-set.json'), 'utf8'));

const CASES = SET.cases;

function run(opts) {
  const rows = CASES.map(function (c) {
    const r = kb.search(c.q, null, opts);
    const top1 = r.hits.length ? r.hits[0].chunk.articleId : null;
    const answered = r.reached;
    const shouldAnswer = c.expect !== null;

    let verdict;
    if (shouldAnswer) verdict = answered ? (top1 === c.expect ? 'ok' : 'wrong-article') : 'miss';
    else verdict = answered ? 'false-answer' : 'reject-ok';

    return {
      c: c,
      top1: top1,
      score: r.hits.length ? r.hits[0].score : 0,
      cover: r.hits.length ? r.hits[0].cover : 0,
      answered: answered,
      verdict: verdict
    };
  });

  const count = function (v) { return rows.filter(function (x) { return x.verdict === v; }).length; };
  const pos = rows.filter(function (x) { return x.c.expect !== null; }).length;
  const neg = rows.length - pos;

  return {
    rows: rows,
    pos: pos,
    neg: neg,
    ok: count('ok'),
    wrongArticle: count('wrong-article'),
    miss: count('miss'),
    falseAnswer: count('false-answer'),
    rejectOk: count('reject-ok')
  };
}

const VERDICT_LABEL = {
  ok: '✓ 命中正确',
  'wrong-article': '△ 答了但文章不对',
  miss: '✗ 误拒（该答没答）',
  'false-answer': '✗ 误答（本该拒）',
  'reject-ok': '✓ 正确拒答'
};

function report(res) {
  const lines = [];
  const push = function (s) { lines.push(s); console.log(s); };

  push('');
  push('逐题结果');
  push('-'.repeat(96));
  res.rows.forEach(function (x) {
    push(
      String(x.c.id).padStart(2) + '  ' +
      (x.c.q.length > 20 ? x.c.q.slice(0, 20) + '…' : x.c.q.padEnd(22)) +
      '  期望 ' + String(x.c.expect || '拒答').padEnd(15) +
      '  实际 ' + String(x.top1 || '—').padEnd(15) +
      '  ' + (VERDICT_LABEL[x.verdict] || x.verdict)
    );
  });

  push('');
  push('汇总（当前默认参数：TITLE_BOOST=0.4 / OOV_MAX=0.5 / MIN_COVER=0.5 / UNIGRAM_W=0.55）');
  push('-'.repeat(96));
  push('  应答题 ' + res.pos + ' 道：命中正确 ' + res.ok + ' · 文章错 ' + res.wrongArticle + ' · 误拒 ' + res.miss);
  push('  应拒题 ' + res.neg + ' 道：正确拒答 ' + res.rejectOk + ' · 误答 ' + res.falseAnswer);
  push('  总正确率 ' + ((res.ok + res.rejectOk) / res.rows.length * 100).toFixed(1) + '%');
  push('  应答命中率 ' + ((res.ok + res.wrongArticle) / res.pos * 100).toFixed(1) + '%');
  push('  拒答正确率 ' + (res.rejectOk / res.neg * 100).toFixed(1) + '%');

  push('');
  push('阈值扫描（只动 MIN_COVER，其余不变）');
  push('-'.repeat(96));
  push('  minCover | 命中正确 | 文章错 | 误拒 | 误答 | 正确拒 | 总正确率');
  const best = [];
  [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65].forEach(function (mc) {
    const r = run({ minCover: mc });
    const total = (r.ok + r.rejectOk) / r.rows.length * 100;
    // 误答按 2 倍扣分：编造答案比拒答更伤用户体验
    const weighted = total - r.falseAnswer * (200 / r.rows.length);
    best.push({ mc: mc, total: total, weighted: weighted, r: r });
    push(
      '      ' + mc.toFixed(2) + '   |   ' + String(r.ok).padStart(2) + '     |   ' +
      String(r.wrongArticle).padStart(2) + '   |  ' + String(r.miss).padStart(2) + '  |  ' +
      String(r.falseAnswer).padStart(2) + '  |   ' + String(r.rejectOk).padStart(2) + '   |  ' +
      total.toFixed(1) + '%'
    );
  });

  best.sort(function (a, b) { return b.weighted - a.weighted; });
  push('');
  push('建议：' + best[0].mc.toFixed(2) + '（加权得分最高，误答按双倍扣分计算）');

  return lines.join('\n') + '\n';
}

const res = run();
const text = report(res);

fs.writeFileSync(
  path.join(__dirname, '..', 'rag', 'eval-report.md'),
  '# RAG 检索评估报告\n\n生成时间：' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '\n' +
  '评估集：`rag/eval-set.json`（' + CASES.length + ' 题）\n\n```\n' + text + '```\n'
);

console.log('\n报告已写入 rag/eval-report.md');
