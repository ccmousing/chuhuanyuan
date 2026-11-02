/**
 * 祝福卡持久化测试
 * 运行：node tools/verify-card.js
 *
 * 验证的核心承诺：「生成过的卡片，重启小程序后还能看到」。
 * 这条链路有三个容易错的地方：
 *   ① 用 tempFilePath 而非永久文件 → 重启即失效（原实现的 bug）
 *   ② 保存失败时没有降级 → 整个导出流程抛错，用户既看不到图也不能保存
 *   ③ 文件被系统清理后仍显示旧路径 → 白块
 */
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const store = require(path.join(MP, 'utils', 'store.js'));

let fail = 0;
const eq = (a, b, msg) => {
  if (a === b) console.log('   ✓ ' + msg);
  else { console.log('   ✗ ' + msg + '  (期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + ')'); fail++; }
};
const ok = (cond, msg) => eq(!!cond, true, msg);

/* ---------------- 内存替身 ---------------- */
let mem = {};
let files = {};          // path -> 伪内容
let failSave = false;
let unlinked = [];

global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); },
  removeStorageSync: (k) => { delete mem[k]; },
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getFileSystemManager: () => ({
    saveFile(opts) {
      if (failSave) return opts.fail && opts.fail({ errMsg: 'saveFile:fail mock' });
      files[opts.filePath] = 'png';
      opts.success && opts.success({ savedFilePath: opts.filePath });
    },
    access(opts) {
      if (files[opts.path]) opts.success && opts.success({});
      else opts.fail && opts.fail({ errMsg: 'access:fail file not found' });
    },
    unlink(opts) {
      if (files[opts.filePath]) { delete files[opts.filePath]; unlinked.push(opts.filePath); }
      else opts.fail && opts.fail({});
    }
  }),
  showToast() {}, previewImage() {}, saveImageToPhotosAlbum() {},
  showShareImageMenu() {}, requirePrivacyAuthorize() {}, openSetting() {},
  showModal() {}, pageScrollTo() {}, setNavigationBarTitle() {}
};

/* ---------------- 加载页面 ---------------- */
let page;
global.Page = (o) => { page = o; };
global.getApp = () => ({ globalData: { statusBarHeight: 24 } });
require(path.join(MP, 'pages', 'blessing', 'blessing.js'));

page.setData = function (o) { Object.assign(this.data, o); };
page.getTabBar = () => null;

const run = async () => {
  console.log('A. store 层：新增的卡片文件字段');
  eq(store.getCardFile(), '', '初始为空字符串');
  store.setCardFile('wxfile://usr/a.png');
  eq(store.getCardFile(), 'wxfile://usr/a.png', '写入后可读回');
  store.setCardFile('');
  eq(store.getCardFile(), '', '可清空');

  console.log('\nB. persist：临时文件 → 永久文件');
  const p1 = await page.persist('wxfile://tmp/1.png');
  ok(p1.indexOf('wxfile://usr/card_') === 0, '返回的是 USER_DATA_PATH 下的永久路径');
  eq(store.getCardFile(), p1, '路径已写入 store');
  eq(files[p1], 'png', '文件确实落盘');
  eq(p1.indexOf('tmp'), -1, '返回路径不含临时目录');

  console.log('\nC. 只保留最近一张（不堆积文件）');
  const before = Object.keys(files).length;
  const p2 = await page.persist('wxfile://tmp/2.png');
  eq(Object.keys(files).length, before, '文件总数没有增加');
  eq(unlinked.length, 1, '旧文件被 unlink 一次');
  eq(unlinked[0], p1, '被删的正是上一张');
  ok(files[p2], '新文件存在');
  eq(store.getCardFile(), p2, 'store 指向新文件');

  console.log('\nD. 保存失败时降级（不阻断导出）');
  failSave = true;
  const p3 = await page.persist('wxfile://tmp/3.png');
  eq(p3, 'wxfile://tmp/3.png', '降级返回临时路径');
  eq(store.getCardFile(), p2, 'store 未被污染');
  failSave = false;

  console.log('\nE. restoreCard：重启后恢复');
  page.data.cardPath = '';
  page.restoreCard();
  eq(page.data.cardPath, p2, '文件存在 → 恢复上次的卡片');

  console.log('\nF. restoreCard：文件已被清理');
  delete files[p2];
  page.data.cardPath = '';
  page.restoreCard();
  eq(page.data.cardPath, '', '文件不存在 → 不显示白块');
  eq(store.getCardFile(), '', '失效路径被清掉');

  console.log('\nG. onLoad 会自动恢复');
  const p4 = await page.persist('wxfile://tmp/4.png');
  page.data.cardPath = '';
  page.onLoad({});
  eq(page.data.cardPath, p4, '重新进入页面即恢复上次卡片');

  console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
  process.exit(fail === 0 ? 0 : 1);
};

run();
