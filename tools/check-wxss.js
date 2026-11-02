/**
 * WXSS 类名一致性检查
 * 运行：node tools/check-wxss.js
 *
 * 两类检查：
 *
 *  A. 【严格·会失败】WXML 里用到的 class，必须在「本页 wxss + app.wxss + 自定义组件 wxss」里定义。
 *     防的是「样式漏写」——元素会以无样式状态渲染，很容易被忽略。
 *
 *  B. 【提示·不影响退出码】本页 wxss 里定义了、但 wxml 里没用到的 class。
 *     防的是「改了 WXML 忘了删 WXSS」——删掉一段结构后残留一堆样式，
 *     肉眼完全扫不出来，久了没人敢删。
 *
 * ⚠️ 实现要点（踩过三次的坑）：**解析前必须先剥掉注释**。
 *    WXSS 注释里为了说明"为什么没有某个类"，往往会写出类名（如 `不再有 .q-lvrow`），
 *    不剥注释就会把它当成孤儿样式误报。
 *
 * 脚本在工程外（chuhuayuan/tools/），不会打进小程序代码包。
 */

const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');

/** 剥掉 CSS 注释 —— 所有解析动作之前都要先做这一步 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 从 wxss 文本里提取**选择器中出现**的类名（不含声明块内的值） */
function classesInCss(text) {
  const clean = stripComments(text);
  const out = new Set();
  // 只取每个规则的选择器部分（{ 之前），避免把属性值里的字符串算进来
  const ruleRe = /(^|[};])\s*([^{}@;]+)\{/g;
  let m;
  while ((m = ruleRe.exec(clean))) {
    for (const c of m[2].matchAll(/\.([A-Za-z][\w-]*)/g)) out.add(c[1]);
  }
  return out;
}

/**
 * 从 wxml 里提取用到的类名。
 *
 * 需要处理动态类名 `class="opt {{a ? 'ok' : 'no'}}"`：
 *   ① 三目里的字符串字面量可能是真实类名（ok / no）→ 要提取
 *   ② `{{...}}` 里的其它标识符（如 index）不是类名 → 把整段删掉再按空格拆
 *   ③ **但三目里的字符串不一定是类名** —— 也可能是 id。
 *      本工程真实踩过：`class="quote {{flash === 'ct-1' ? 'flash' : ''}}"`
 *      里的 'ct-1' 是 **id** 值，不是类名，会被误报成「样未定义」。
 *      所以先收集本文件 id / data-* 的静态值，命中这些值的三目字符串一律不当作类名。
 */
function classesInWxml(text) {
  // 收集 id 与 data-* 的静态值，用于排除误报
  const notClass = new Set();
  for (const m of text.matchAll(/\bid="([^"]+)"/g)) notClass.add(m[1]);
  for (const m of text.matchAll(/\bdata-[\w-]+="([^"]+)"/g)) notClass.add(m[1]);

  const out = new Set();
  for (const m of text.matchAll(/class="([^"]*)"/g)) {
    const raw = m[1];
    // ① 三目里的字符串字面量（排除 id / data 值）
    for (const s of raw.matchAll(/'([A-Za-z][\w-]*)'/g)) {
      if (!notClass.has(s[1])) out.add(s[1]);
    }
    // ② 静态部分：把 {{...}} 整段删掉再按空白拆分
    for (const tok of raw.replace(/\{\{[\s\S]*?\}\}/g, ' ').split(/\s+/)) {
      if (/^[A-Za-z][\w-]*$/.test(tok)) out.add(tok);
    }
  }
  return out;
}

/* ---------- 收集全局类 ---------- */
const globalCss = [
  path.join(MP, 'app.wxss'),
  path.join(MP, 'custom-tab-bar', 'index.wxss')
].filter(fs.existsSync).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const globalClasses = classesInCss(globalCss);

/* ---------- 逐页检查 ---------- */
const pageDir = path.join(MP, 'pages');
const missing = [];
const orphan = [];
let pageCount = 0;

for (const name of fs.readdirSync(pageDir)) {
  const dir = path.join(pageDir, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const wxmlPath = path.join(dir, name + '.wxml');
  const wxssPath = path.join(dir, name + '.wxss');
  if (!fs.existsSync(wxmlPath)) continue;
  pageCount++;

  const used = classesInWxml(fs.readFileSync(wxmlPath, 'utf8'));
  const own = fs.existsSync(wxssPath) ? classesInCss(fs.readFileSync(wxssPath, 'utf8')) : new Set();
  const available = new Set([...own, ...globalClasses]);

  for (const c of used) {
    // 组件标签名形态的（如 tb-ic 之类）都算类名，一并检查
    if (!available.has(c)) missing.push('pages/' + name + ' → .' + c);
  }
  for (const c of own) {
    if (!used.has(c)) orphan.push('pages/' + name + ' → .' + c);
  }
}

/* ---------- 输出 ---------- */
console.log('A. WXML 用到的 class 是否都有样式（严格）');
console.log('   共检查 ' + pageCount + ' 个页面');
if (missing.length) {
  console.log('   ❌ 以下 class 没有任何样式定义：');
  missing.forEach(x => console.log('      ' + x));
} else {
  console.log('   全部有定义 ✅');
}

console.log('\nB. WXSS 里定义了但没被用到的 class（仅提示）');
if (orphan.length) {
  orphan.forEach(x => console.log('   ⚠️ ' + x));
  console.log('   —— 请人工确认：是动态类名 / 预留给状态用，还是漏删了？');
} else {
  console.log('   未发现 ✅');
}
console.log('   （全局 class 不计入孤儿：app.wxss 里的是公共类，本就给多页复用）');

console.log('\n' + (missing.length === 0
  ? '严格检查通过 ✅' + (orphan.length ? '（B 组有 ' + orphan.length + ' 项待人工确认）' : '')
  : missing.length + ' 项失败 ❌'));

process.exit(missing.length === 0 ? 0 : 1);
