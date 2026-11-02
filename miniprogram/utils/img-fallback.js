/**
 * 配图加载失败处理（多格式链式降级）
 *
 * 背景：缩略图约定放在 miniprogram/images/ 下，按文章 id 命名。
 * 但用户在手机 / 图库里拿到的图可能是 jpg、png 或 webp，
 * 不应该逼着用户每次手动转格式。
 *
 * 策略：同一个 id 依次尝试 jpg → png → webp，全部失败才回退到 emoji + 色块。
 *
 * 为什么用「改 imgExt 让 image 重新加载」而不是预先探测文件：
 *   小程序没有 API 能枚举 / 检测代码包内的文件是否存在，
 *   只能靠 <image> 的 binderror 事件驱动。
 *
 * wxml 里的写法：
 *   <image src="/images/{{item.id}}.{{item.imgExt ? item.imgExt : 'jpg'}}"
 *          data-list="reads" data-i="{{index}}" binderror="onImgErr" />
 */

// 尝试顺序。第一个同时是默认值（没指定 imgExt 时）
const EXTS = ['jpg', 'png', 'webp'];

/**
 * 页面里这样用：
 *   const imgFallback = require('../../utils/img-fallback.js');
 *   ...
 *   onImgErr(e) { imgFallback.handle(this, e); },
 *
 * 逻辑集中在这一处，5 个页面只留一行委托，改规则不用改 5 遍。
 */
function handle(page, e) {
  const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
  const listName = ds.list;
  const i = ds.i;

  if (!listName || i === undefined || i === null) return;

  const list = page.data && page.data[listName];
  if (!Array.isArray(list)) return;
  const item = list[i];
  if (!item) return;

  const cur = item.imgExt || EXTS[0];
  const idx = EXTS.indexOf(cur);
  // idx === -1 说明 imgExt 被写成了未知值 —— 直接走下一档，避免死循环
  const next = idx >= 0 ? EXTS[idx + 1] : EXTS[1];

  const path = listName + '[' + i + ']';
  const patch = {};
  if (next) {
    patch[path + '.imgExt'] = next;
  } else {
    patch[path + '.imgFailed'] = true;
  }
  page.setData(patch);
}

module.exports = { EXTS: EXTS, handle: handle };
