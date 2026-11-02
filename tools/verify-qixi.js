/**
 * 七夕日期表校验
 * 运行：node tools/verify-qixi.js
 *
 * 两条独立校验：
 *  A. 与第二来源逐行对照（rili.com.cn / jieri8 的公开列表）
 *  B. 内部一致性：相邻两年七夕的间隔只能是 354 / 355 / 383 / 384 天
 *     —— 因为农历平年 354~355 天、闰年 383~384 天，间隔不可能是别的值。
 *        任何一处抄写错误几乎必然破坏这条约束。
 */
const path = require('path');
const { QIXI_TABLE, QIXI_RANGE, qixiOf } = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'lunar.js'));

let fail = 0;
const bad = (msg) => { console.log('  ✗ ' + msg); fail++; };

/* ---------- 独立第二来源（rili.com.cn 公开列表，与主来源分属不同站点）---------- */
const REF = {
  2019: [8, 7],  2020: [8, 25], 2021: [8, 14], 2022: [8, 4],  2023: [8, 22],
  2024: [8, 10], 2025: [8, 29], 2026: [8, 19], 2027: [8, 8],  2028: [8, 26],
  2029: [8, 16], 2030: [8, 5]
};

console.log('A. 与第二来源对照（' + Object.keys(REF).length + ' 个年份）');
Object.keys(REF).forEach(y => {
  const mine = QIXI_TABLE[y], ref = REF[y];
  if (!mine) return bad(y + ' 缺行');
  if (mine[0] !== ref[0] || mine[1] !== ref[1]) {
    bad(y + ' 不一致：表为 ' + mine + '，来源为 ' + ref);
  }
});
console.log('   完成');

console.log('B. 覆盖范围与连续性');
const years = Object.keys(QIXI_TABLE).map(Number).sort((a, b) => a - b);
if (years[0] !== QIXI_RANGE[0] || years[years.length - 1] !== QIXI_RANGE[1]) {
  bad('年份范围与 QIXI_RANGE 不符');
}
for (let i = 1; i < years.length; i++) {
  if (years[i] !== years[i - 1] + 1) bad('年份不连续：' + years[i - 1] + ' → ' + years[i]);
}
console.log('   ' + years[0] + '–' + years[years.length - 1] + '，共 ' + years.length + ' 行，连续');

console.log('C. 农历年长约束（相邻七夕间隔只能是 354/355/383/384 天）');
const LEGAL = [354, 355, 383, 384];
for (let i = 1; i < years.length; i++) {
  const a = qixiOf(years[i - 1]), b = qixiOf(years[i]);
  const gap = Math.round((b - a) / 86400000);
  if (LEGAL.indexOf(gap) === -1) bad(years[i - 1] + ' → ' + years[i] + ' 间隔 ' + gap + ' 天，不合法');
}
console.log('   全部合法');

console.log('D. 日期落点范围（七夕只可能落在 7月20日–9月5日）');
years.forEach(y => {
  const d = qixiOf(y);
  const key = (d.getMonth() + 1) * 100 + d.getDate();
  if (key < 720 || key > 905) bad(y + ' 落点异常：' + (d.getMonth() + 1) + '月' + d.getDate() + '日');
});
console.log('   全部正常');

/* ---------- 行为验证 ---------- */
console.log('E. nextChuHuaYuan() 行为');
const { nextChuHuaYuan } = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'lunar.js'));
const cases = [
  [new Date(2026, 5, 1),  2026, 8, 19, 79,  '七夕之前 → 指向本年七夕'],
  [new Date(2026, 7, 19), 2026, 8, 19, 0,   '七夕当天 → 0 天（含今天）'],
  [new Date(2026, 7, 20), 2027, 8, 8,  353, '七夕次日 → 指向下一年'],
  [new Date(2026, 9, 14), 2027, 8, 8,  298, '当年已过 → 指向下一年（今天的情况）'],
  [new Date(2025, 0, 1),  2025, 8, 29, 240, '跨年边界正常']
];
cases.forEach(([from, y, m, d, days, desc]) => {
  const r = nextChuHuaYuan(from);
  const okLen = r && r.year === y && r.date.getMonth() + 1 === m && r.date.getDate() === d && r.days === days;
  console.log('   ' + (okLen ? '✓' : '✗') + ' ' + desc + ' → ' + (r ? r.label + '（' + r.days + ' 天）' : 'null'));
  if (!okLen) fail++;
});
const out = nextChuHuaYuan(new Date(2050, 0, 1));
console.log('   ' + (out === null ? '✓' : '✗') + ' 超出覆盖范围应返回 null → ' + out);
if (out !== null) fail++;

console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
