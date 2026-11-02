/**
 * 素材目录自检
 * 运行：node tools/check-images.js
 *
 * 目的：这套「换图只动文件夹」的机制靠**文件名约定**生效，
 * 而文件名拼错时小程序不会报错 —— 只会静默回退到 emoji，
 * 用户会以为"我明明放了图怎么没变"。所以必须能自动查。
 */
const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const DIR = path.join(MP, 'images');
const content = require(path.join(MP, 'utils', 'content.js'));

let fail = 0;
const bad = (m) => { console.log('   ✗ ' + m); fail++; };
const ok = (m) => console.log('   ✓ ' + m);
const info = (m) => console.log('   · ' + m);

const ids = content.ARTICLES.map((a) => a.id);
const titleOf = {};
content.ARTICLES.forEach((a) => { titleOf[a.id] = a.title; });

console.log('A. 目录与命名约定');
if (!fs.existsSync(DIR)) {
  bad('images/ 目录不存在');
  process.exit(1);
}
ok('images/ 存在');

const all = fs.readdirSync(DIR).filter((f) => !f.startsWith('.') && !f.endsWith('.md'));
// 顶层只校验「文章配图」；子目录（如 sym/ 仪式用品）单独在 F 段校验
const dirs = all.filter((f) => fs.statSync(path.join(DIR, f)).isDirectory());
const entries = all.filter((f) => !fs.statSync(path.join(DIR, f)).isDirectory());
if (entries.length === 0) {
  info('还没有放入任何配图 —— 全部缩略图会回退到 emoji + 色块（这是正常的）');
} else {
  info('已放入 ' + entries.length + ' 个文章配图' + (dirs.length ? '，另有子目录：' + dirs.join(', ') : ''));
}

const names = new Set(entries.map((f) => f.replace(/\.[^.]+$/, '')));
const exts = new Set(entries.map((f) => path.extname(f).toLowerCase()));

console.log('\nB. 文件名必须能对应到文章 id');
entries.forEach((f) => {
  const base = f.replace(/\.[^.]+$/, '');
  const ext = path.extname(f).toLowerCase();
  if (!ids.includes(base)) {
    bad(f + ' —— 文件名不是任何文章的 id（正确 id：' + ids.join(' / ') + '）');
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].indexOf(ext) === -1) {
    bad(f + ' —— 扩展名 ' + ext + ' 不被支持（可用 jpg / png / webp）');
  }
});
if (entries.length === 0 || fail === 0) ok('文件名与扩展名符合约定');

console.log('\nC. 体积（微信代码包上限 2MB）');
let total = 0;
entries.forEach((f) => {
  const size = fs.statSync(path.join(DIR, f)).size;
  total += size;
  const kb = size / 1024;
  if (kb > 60) bad(f + ' 单张 ' + kb.toFixed(0) + ' KB，偏大（建议 ≤30 KB）');
  else if (kb > 30) info(f + ' ' + kb.toFixed(0) + ' KB，略超建议值（≤30 KB）');
});
info('配图合计 ' + (total / 1024).toFixed(1) + ' KB');
if (total > 400 * 1024) bad('配图总量超过 400 KB，注意代码包上限');
else ok('体积在安全范围');

console.log('\nD. 覆盖情况');
ids.forEach((id) => {
  const has = names.has(id);
  console.log('   ' + (has ? '✓' : '·') + ' ' + id.padEnd(16) + titleOf[id]);
});
const missing = ids.filter((id) => !names.has(id));
if (missing.length === 0) ok('6 篇全部有配图');
else info(missing.length + ' 篇仍用 emoji 占位（随时可以补）');

console.log('\nE. wxml 引用与 data-list 一致性');
const pages = ['index', 'culture', 'article', 'favorites', 'records'];
let refs = 0;
pages.forEach((p) => {
  const wxml = fs.readFileSync(path.join(MP, 'pages', p, p + '.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(MP, 'pages', p, p + '.js'), 'utf8');

  // src 必须带多扩展名兜底 —— 写死 .jpg 会让用户放的 png 不生效
  const n = (wxml.match(/\/images\/\{\{item\.id\}\}\.\{\{item\.imgExt/g) || []).length;
  refs += n;
  if (n === 0) bad(p + '.wxml 没有使用多扩展名 src 模板');
  else info(p + '.wxml 引用 ' + n + ' 处');

  // data-list 写错时不会报错，只会把失败标记写到不存在的字段上 → 无限重试
  const lists = wxml.match(/data-list="([^"]+)"/g) || [];
  lists.forEach((m) => {
    const name = m.slice(11, -1);
    const inData = new RegExp('\\b' + name + '\\s*[:=]').test(js);
    if (!inData) bad(p + '.wxml 的 data-list="' + name + '" 在同页 js 的 data 里找不到');
  });
  if (lists.length) info(p + '.wxml 的 data-list：' + lists.map((x) => x.slice(11, -1)).join(', '));

  // 有 image 就必须有 binderror，否则加载失败时不会降级
  if (n > 0 && wxml.indexOf('binderror="onImgErr"') === -1) {
    bad(p + '.wxml 有配图但没绑 binderror="onImgErr"');
  }
});
if (refs > 0) ok('共 ' + refs + ' 处缩略图已接多格式图片');

console.log('\nF. 仪式用品小图（images/sym/）');
const SYM_DIR = path.join(DIR, 'sym');
const SYM_KEYS = ['clogs', 'pomegranate', 'flower-water', 'rooster', 'peach-cake', 'waistband'];
if (!fs.existsSync(SYM_DIR)) {
  info('未创建 sym/ 目录 —— 文化馆的仪式用品走 emoji（正常）');
} else {
  const symFiles = fs.readdirSync(SYM_DIR).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const symBases = new Set(symFiles.map((f) => f.replace(/\.[^.]+$/, '')));
  let symTotal = 0;

  SYM_KEYS.forEach((k) => {
    const hit = symFiles.find((f) => f.replace(/\.[^.]+$/, '') === k);
    if (!hit) {
      bad('sym/' + k + ' 缺失（该符号会回退 emoji）');
      return;
    }
    const size = fs.statSync(path.join(SYM_DIR, hit)).size;
    symTotal += size;
    if (size / 1024 > 40) info('sym/' + hit + ' ' + (size / 1024).toFixed(0) + ' KB，偏大（建议 ≤40 KB）');
  });

  // culture.js 里 img 字段必须与真实文件对应，否则静默回退 emoji
  const cjs = fs.readFileSync(path.join(MP, 'pages', 'culture', 'culture.js'), 'utf8');
  const declared = (cjs.match(/img:\s*'([^']+)'/g) || []).map((m) => m.replace(/img:\s*'/, '').replace(/'$/, ''));
  declared.forEach((name) => {
    if (!symBases.has(name)) bad('culture.js 引用了不存在的图：sym/' + name);
  });

  info('符号图 ' + symFiles.length + ' 张，合计 ' + (symTotal / 1024).toFixed(1) + ' KB');
  if (SYM_KEYS.every((k) => symBases.has(k))) ok('6 个仪式用品图齐备');
}

console.log('\n' + (fail === 0 ? '素材目录检查通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
