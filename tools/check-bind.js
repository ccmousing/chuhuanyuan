/**
 * 事件绑定检查
 * 运行：node tools/check-bind.js
 *
 * 两类检查：
 *
 *  A. 【严格·会失败】WXML 里 bind / catch 绑定的方法，必须在同名 js 里存在。
 *     防的是「方法改名了但模板没改」——这种错小程序不报错，只是点了没反应。
 *
 *  B. 【启发式·仅提示】像按钮的元素里，有没有根本没绑事件的。
 *     防的是「做了个按钮的样子却没接事件」——本工程真的踩过：
 *     服务预约页的「预约」按钮、社区广场整页 0 个事件绑定。
 *
 * B 组只提示、不影响退出码：它靠 class 命名猜测，必然有误报
 * （比如动态类名 `{{a ? 'btn' : ''}}`、或纯展示用的列表项）。
 * 看的时候人工过一遍即可，不要为了让提示消失而硬加事件。
 *
 * 脚本在工程外（chuhuayuan/tools/），不会打进小程序代码包。
 */

const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');

/* ---------- 收集待检查的 (wxml, js) 对 ---------- */
function pairs() {
  const out = [];
  const pageDir = path.join(MP, 'pages');
  for (const name of fs.readdirSync(pageDir)) {
    const dir = path.join(pageDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const wxml = path.join(dir, name + '.wxml');
    const js = path.join(dir, name + '.js');
    if (fs.existsSync(wxml) && fs.existsSync(js)) {
      out.push({ label: 'pages/' + name, wxml, js });
    }
  }
  const tabWxml = path.join(MP, 'custom-tab-bar', 'index.wxml');
  const tabJs = path.join(MP, 'custom-tab-bar', 'index.js');
  if (fs.existsSync(tabWxml) && fs.existsSync(tabJs)) {
    out.push({ label: 'custom-tab-bar', wxml: tabWxml, js: tabJs });
  }
  return out;
}

/* ---------- A. 绑定的方法是否存在 ---------- */
// 只认「方法名形态」的值：bindtap="onFoo"、catchtap="onFoo"
// 带参数的（bindtap="{{handler}}"）无法静态判断，跳过
const BIND_RE = /\b(?:bind|catch)[a-zA-Z]*\s*=\s*"([A-Za-z_$][\w$]*)"/g;

function checkHandlers(list) {
  const missing = [];
  let count = 0;
  for (const { label, wxml, js } of list) {
    const src = fs.readFileSync(wxml, 'utf8');
    const target = fs.readFileSync(js, 'utf8');
    const seen = new Set();
    let m;
    while ((m = BIND_RE.exec(src))) {
      const fn = m[1];
      if (seen.has(fn)) continue;
      seen.add(fn);
      count++;
      // js 里应出现 "fn(" 或 "fn:" 或 "fn =" 形式
      const re = new RegExp('(^|[^\\w$.])' + fn + '\\s*[(:]', 'm');
      if (!re.test(target)) missing.push(label + ' → ' + fn);
    }
  }
  return { missing, count };
}

/* ---------- B. 疑似没绑事件的按钮 ---------- */
// 明确「是个按钮」的类名片段；列表项那种可点可不点的另算
const BTN_WORDS = ['btn', 'go', 'entry', 'chip', 'opt', 'acts-plan', '-ap', 'cta', 'export-btn'];

function checkUnbound(list) {
  const susp = [];
  for (const { label, wxml } of list) {
    const lines = fs.readFileSync(wxml, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t.startsWith('<view')) return;
      if (/bind|catch/.test(t)) return;             // 已绑事件
      if (t.indexOf('{{') > -1) return;             // 动态类名，静态判断不可靠
      const cm = /class="([^"]+)"/.exec(t);
      if (!cm) return;
      const hit = BTN_WORDS.filter(w => cm[1].indexOf(w) > -1);
      if (hit.length) {
        susp.push({ label, line: i + 1, cls: cm[1], hit: hit.join(',') });
      }
    });
  }
  return susp;
}

/* ---------- 执行 ---------- */
const list = pairs();

console.log('A. 事件绑定的方法是否都存在（严格）');
const { missing, count } = checkHandlers(list);
console.log('   共检查 ' + count + ' 个绑定');
if (missing.length) {
  console.log('   ❌ 以下绑定在对应 js 里找不到方法：');
  missing.forEach(x => console.log('      ' + x));
} else {
  console.log('   全部存在 ✅');
}

console.log('\nB. 疑似「有按钮样子但没绑事件」（仅提示）');
const susp = checkUnbound(list);
if (susp.length) {
  susp.forEach(s => console.log('   ⚠️ ' + s.label + ':' + s.line
    + '  class="' + s.cls + '"  （命中关键词: ' + s.hit + '）'));
  console.log('   —— 请人工确认：是纯展示元素，还是漏了绑定？');
} else {
  console.log('   未发现 ✅');
}

console.log('\n' + (missing.length === 0
  ? '严格检查通过 ✅' + (susp.length ? '（B 组有 ' + susp.length + ' 项待人工确认）' : '')
  : missing.length + ' 项失败 ❌'));

process.exit(missing.length === 0 ? 0 : 1);
