/**
 * WXSS 盒模型检查
 * 运行：node tools/check-layout.js
 *
 * 抓的是这一类 bug：
 *   `width: 100%` 只约束「内容盒」。如果没有 `box-sizing: border-box`，
 *   元素的实际宽度 = 容器宽度 + 左右 padding + 左右 border，
 *   于是它会超出容器、右边被屏幕裁掉一截 —— 而 WXSS 不会报任何错。
 *   （本工程真实踩过：`.btnL { width:100%; padding:26rpx }` 让所有主按钮比卡片宽 52rpx）
 *
 * 两类判定：
 *   ⛔ 会横向溢出  —— 百分比宽度 + 左右 padding + 缺 box-sizing（确定性 bug，必须修）
 *   ⚠️ 需要确认    —— 固定高度 + 上下 padding + 缺 box-sizing（可能是故意的，见下）
 *
 * 已知的「故意为之」：
 *   .tabbar 用 `height:116rpx` + `padding-bottom: env(safe-area-inset-bottom)`，
 *   就是要让图标区留在 116rpx 内、安全区补在白条下方 —— 不要给它加 border-box。
 *
 * 脚本在工程外（chuhuayuan/tools/），不会打进小程序代码包。
 */

const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');

/** 收集要检查的 WXSS 文件 */
function collect(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.name.endsWith('.wxss')) out.push(p);
  }
  return out;
}

/** 把 padding 的简写展开成 {top,right,bottom,left}，兼顾无单位 0 与 px/% */
function expandPadding(value) {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map(toPx);
  if (parts.some(v => v === null)) return null;
  const [t, r = t, b = t, l = r] = parts;
  return { top: t, right: r, bottom: b, left: l };
}

function toPx(token) {
  const m = /^(-?\d+(?:\.\d+)?)(rpx|px|%)?$/.exec(token.trim());
  if (!m) return null;                       // 含 env()/calc() 等，跳过不算
  const n = parseFloat(m[1]);
  const unit = m[2] || '';
  if (unit === 'rpx') return n;
  if (unit === 'px') return n * 2;           // 1px ≈ 2rpx（375 设计稿）
  if (unit === '') return n;
  return n;                                  // 百分比不参与加减，仅作粗略提示
}

/** 粗略解析出 选择器 -> 声明表。只处理单层规则，够用 */
function parseRules(text) {
  // ⚠️ 先剥掉全部注释再解析。
  // 否则注释里的半角冒号（比如注释中写 width:100%）会被误当成声明分隔符，
  // 把紧随其后的 box-sizing 吞进注释的值里 —— 本脚本第一版就栽在这，误报了一处。
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');

  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (!sel || sel.startsWith('@')) continue;
    const decls = {};
    for (const part of m[2].split(';')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      decls[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    rules.push({ sel, decls });
  }
  return rules;
}

const byFile = {};
for (const f of collect(MP, [])) {
  byFile[path.relative(MP, f).replace(/\\/g, '/')] = fs.readFileSync(f, 'utf8');
}

const overflow = [];   // ⛔ 确定性横向溢出
const check = [];      // ⚠️ 固定高 + 纵向 padding，需人工确认

/** 从声明里取出四边 padding：优先用简写，没有则读 padding-* 单属性 */
function readPadding(decls) {
  const shorthand = expandPadding(decls['padding']);
  if (shorthand) return shorthand;

  const side = (name) => {
    const v = toPx(decls['padding-' + name] || '0');
    return v === null ? 0 : v;     // env()/calc() 之类按 0 处理（不参与加减，也不会误报）
  };
  if (!decls['padding-top'] && !decls['padding-right'] &&
      !decls['padding-bottom'] && !decls['padding-left']) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  return {
    top: side('top'), right: side('right'),
    bottom: side('bottom'), left: side('left')
  };
}

/** 从 "2rpx solid #xxx" 里取宽度 */
function readBorderWidth(value) {
  if (!value) return 0;
  const first = value.trim().split(/\s+/)[0];
  const n = toPx(first);
  return n === null ? 0 : Math.abs(n);
}

for (const [file, text] of Object.entries(byFile)) {
  for (const { sel, decls } of parseRules(text)) {
    if ((decls['box-sizing'] || '') === 'border-box') continue;

    const pad = readPadding(decls);
    const bw = readBorderWidth(decls['border-left']) + readBorderWidth(decls['border-right']);
    // border: 2rpx solid 简写时，左右各有这么多
    const bwShort = readBorderWidth(decls['border']) * 2;
    const borderLR = bw || bwShort;

    const w = decls['width'] || '';
    const h = decls['height'] || '';

    // ① 百分比宽度 + 左右 padding/border → 右侧溢出容器
    const extra = pad.left + pad.right + borderLR;
    if (w.includes('%') && extra > 0) {
      overflow.push({
        file, sel, w, extra,
        detail: `padding ${pad.left}+${pad.right}rpx` +
                (borderLR ? ` + border ${borderLR}rpx` : '')
      });
    }

    // ② 固定高度 + 上下 padding → 实际高度大于声明值（可能是有意的）
    const hm = /^(\d+(?:\.\d+)?)(rpx|px)$/.exec(h);
    const vpad = pad.top + pad.bottom;
    if (hm && vpad > 0) {
      const declared = hm[2] === 'px' ? parseFloat(hm[1]) * 2 : parseFloat(hm[1]);
      check.push({
        file, sel, h,
        actual: declared + vpad,
        detail: `padding ${pad.top}+${pad.bottom}rpx`
      });
    }
  }
}

console.log('=== ⛔ 会横向溢出（百分比宽度 + 左右内边距/边框，缺 box-sizing）===');
if (overflow.length === 0) {
  console.log('  无 ✅');
} else {
  for (const r of overflow) {
    console.log(`  ${r.file}  →  ${r.sel}`);
    console.log(`      width:${r.w}   ${r.detail}   ⇒ 比容器宽 ${r.extra}rpx（≈${(r.extra / 2).toFixed(0)}px）`);
  }
}

console.log('\n=== ⚠️ 固定高度 + 上下内边距（实际比声明高，需确认是否有意）===');
if (check.length === 0) {
  console.log('  无');
} else {
  for (const c of check) {
    console.log(`  ${c.file}  →  ${c.sel}`);
    console.log(`      height:${c.h}  ${c.detail}  ⇒ 实际高度 ${c.actual}rpx`);
  }
}

console.log('\n' + (overflow.length === 0
  ? '盒模型检查通过 ✅'
  : `发现 ${overflow.length} 处横向溢出，请修 ❌`));

process.exit(overflow.length === 0 ? 0 : 1);
