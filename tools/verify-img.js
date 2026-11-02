/**
 * 配图降级测试
 * 运行：node tools/verify-img.js
 *
 * 验证 miniprogram/utils/img-fallback.js 的三级链式降级：
 *   jpg → png → webp → 标记 imgFailed（回退 emoji）
 *
 * 为什么值得单独测：这条链路只有「图不存在」时才走到，
 * 而图存在时永远正常 —— 不写测试就只会在用户放图/删图时才暴露。
 */
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const imgFallback = require(path.join(MP, 'utils', 'img-fallback.js'));

let fail = 0;
const eq = (a, b, msg) => {
  if (JSON.stringify(a) === JSON.stringify(b)) console.log('   ✓ ' + msg);
  else { console.log('   ✗ ' + msg + '  (期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + ')'); fail++; }
};

/** 支持 'list[0].key' 路径写法的 setData 替身 */
function makePage(list, i) {
  const data = {};
  data[list] = [{ id: 'demo' }, { id: 'demo2' }, { id: 'demo3' }];
  const page = {
    data: data,
    calls: [],
    setData(patch) {
      this.calls.push(patch);
      Object.keys(patch).forEach((p) => {
        const m = p.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
        if (!m) return;
        if (!this.data[m[1]][Number(m[2])]) this.data[m[1]][Number(m[2])] = {};
        this.data[m[1]][Number(m[2])][m[3]] = patch[p];
      });
    }
  };
  return { page: page, index: i === undefined ? 0 : i };
}

const ev = (list, i) => ({ currentTarget: { dataset: { list: list, i: i } } });

console.log('A. 三级降级顺序');
{
  const { page, index } = makePage('reads', 0);
  eq(imgFallback.EXTS, ['jpg', 'png', 'webp'], '尝试顺序为 jpg → png → webp');

  imgFallback.handle(page, ev('reads', index));
  eq(page.data.reads[0].imgExt, 'png', '第 1 次失败：jpg → png');
  eq(page.data.reads[0].imgFailed, undefined, '此时还不应标记为失败');

  imgFallback.handle(page, ev('reads', index));
  eq(page.data.reads[0].imgExt, 'webp', '第 2 次失败：png → webp');
  eq(page.data.reads[0].imgFailed, undefined, '此时还不应标记为失败');

  imgFallback.handle(page, ev('reads', index));
  eq(page.data.reads[0].imgFailed, true, '第 3 次失败：标记 imgFailed，回退 emoji');
}

console.log('\nB. 未知扩展名不进入死循环');
{
  const { page, index } = makePage('list', 1);
  page.data.list[1].imgExt = 'gif';
  imgFallback.handle(page, ev('list', index));
  eq(page.data.list[1].imgExt, 'png', '未知值 gif → 直接跳到 png');
}

console.log('\nC. 定位到正确的列表项');
{
  const { page } = makePage('related', 2);
  imgFallback.handle(page, ev('related', 2));
  eq(page.data.related[2].imgExt, 'png', '命中索引 2');
  eq(page.data.related[0].imgExt, undefined, '没有污染索引 0');
  eq(page.data.related[1].imgExt, undefined, '没有污染索引 1');
}

console.log('\nD. 参数缺失时静默返回');
{
  const { page } = makePage('reads', 0);
  imgFallback.handle(page, { currentTarget: { dataset: {} } });
  eq(page.calls.length, 0, '缺 list 和 i：不调用 setData');

  imgFallback.handle(page, { currentTarget: { dataset: { list: 'reads' } } });
  eq(page.calls.length, 0, '缺 i：不调用 setData');

  imgFallback.handle(page, {});
  eq(page.calls.length, 0, '空事件对象：不抛错、不调用');
}

console.log('\nE. 越界与非法列表');
{
  const { page } = makePage('reads', 0);
  imgFallback.handle(page, ev('reads', 99));
  eq(page.calls.length, 0, '索引越界：静默返回');

  imgFallback.handle(page, ev('notAList', 0));
  eq(page.calls.length, 0, '列表名不存在：静默返回');

  const page2 = { data: { reads: null }, calls: [], setData(p) { this.calls.push(p); } };
  imgFallback.handle(page2, ev('reads', 0));
  eq(page2.calls.length, 0, '列表为 null：静默返回');
}

console.log('\nF. 降级完成后重复触发');
{
  const { page, index } = makePage('reads', 0);
  page.data.reads[0].imgFailed = true;
  imgFallback.handle(page, ev('reads', index));
  eq(page.data.reads[0].imgExt, 'png', '已失败项再触发：仍走一次扩展名尝试（不会崩溃）');
  imgFallback.handle(page, ev('reads', index));
  imgFallback.handle(page, ev('reads', index));
  eq(page.data.reads[0].imgFailed, true, '三次之后仍保持 imgFailed');
}

console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
