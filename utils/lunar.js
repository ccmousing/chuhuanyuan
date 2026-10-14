/**
 * 出花园 · 吉日计算
 *
 * ── 设计取舍（重要，别随手换成「完整农历库」）──────────────────────────
 * 本模块只解决一个具体问题：**下一个农历七月初七（出花园正日）是哪天**。
 *
 * 常见做法是内置一份 1900–2100 的农历数据表（约 200 个十六进制魔数）来支持任意农历换算。
 * 但那份数据表在本项目内**无法被独立校验**——一旦有一个常量抄错，错误会静默传播，
 * 而且错的那一年往往要到那年才暴露。
 *
 * 因此这里改用一张**逐年核对过的「七夕公历日期」表**：
 *   · 每一行都可回溯核对（来源见 DATA_SOURCES）
 *   · 完全离线、零依赖、零网络请求
 *   · 覆盖 2005–2049，由 tools/verify-qixi.js 自动校验（含「农历年长只能是 354/355/383/384 天」的强约束）
 *
 * 超出覆盖范围时 nextChuHuaYuan() 返回 null，页面退化为「不显示倒计时」，
 * 而不是显示一个算错的日子。
 * ────────────────────────────────────────────────────────────────
 */

// 逐年核对过的七夕（农历七月初七）公历日期
const QIXI_TABLE = {
  2005: [8, 11], 2006: [7, 31], 2007: [8, 19], 2008: [8, 7],  2009: [8, 26],
  2010: [8, 16], 2011: [8, 6],  2012: [8, 23], 2013: [8, 13], 2014: [8, 2],
  2015: [8, 20], 2016: [8, 9],  2017: [8, 28], 2018: [8, 17], 2019: [8, 7],
  2020: [8, 25], 2021: [8, 14], 2022: [8, 4],  2023: [8, 22], 2024: [8, 10],
  2025: [8, 29], 2026: [8, 19], 2027: [8, 8],  2028: [8, 26], 2029: [8, 16],
  2030: [8, 5],  2031: [8, 24], 2032: [8, 12], 2033: [8, 1],  2034: [8, 20],
  2035: [8, 10], 2036: [8, 28], 2037: [8, 17], 2038: [8, 7],  2039: [8, 26],
  2040: [8, 14], 2041: [8, 3],  2042: [8, 22], 2043: [8, 11], 2044: [7, 31],
  2045: [8, 19], 2046: [8, 8],  2047: [8, 27], 2048: [8, 16], 2049: [8, 5]
};

const QIXI_RANGE = [2005, 2049];

// 数据来源（三源交叉核对，2024–2031 三源完全一致）
const DATA_SOURCES = [
  'https://www.chinesecalendaronline.com/zh/jieri/qixi/',
  'https://www.rili.com.cn/jieridaquan/jierishijian/49816.html',
  'https://www.jieri8.com/festival/qixijie/2027.html'
];

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function startOfDay(d) {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 取某个农历年份的七夕公历日期；不在覆盖范围内返回 null */
function qixiOf(year) {
  const md = QIXI_TABLE[year];
  if (!md) return null;
  return new Date(year, md[0] - 1, md[1]);   // 用数字构造，避免 Date('YYYY-MM-DD') 的 UTC 解析坑
}

/** 格式化成「2027年8月8日 星期日」 */
function formatCn(d) {
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
}

/**
 * 下一个出花园正日（含今天）
 * @param {Date} [from] 起始日期，默认今天
 * @returns {{year:number, date:Date, days:number, label:string}|null} 超范围返回 null
 */
function nextChuHuaYuan(from) {
  const base = startOfDay(from || new Date());
  const y0 = base.getFullYear();
  for (let y = Math.max(y0, QIXI_RANGE[0]); y <= QIXI_RANGE[1]; y++) {
    const d = qixiOf(y);
    if (!d) continue;
    if (d.getTime() >= base.getTime()) {
      return {
        year: y,
        date: d,
        days: Math.round((d.getTime() - base.getTime()) / 86400000),
        label: formatCn(d)
      };
    }
  }
  return null;
}

module.exports = {
  QIXI_TABLE,
  QIXI_RANGE,
  DATA_SOURCES,
  qixiOf,
  formatCn,
  nextChuHuaYuan
};
