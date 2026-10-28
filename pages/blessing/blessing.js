// 祝福卡 · canvas 2d 绘制 + 导出图片
//
// 排版要点：每句祝福都**预设断行**（lines 数组），预览与 canvas 共用同一套行数据，
// 避免自动折行产生「孤字行」，也保证预览与导出图完全一致。

const store = require('../../utils/store.js');

const CARD_W = 600;   // 画布逻辑宽（px）
const CARD_H = 800;   // 画布逻辑高（px）

// 文案在 utils/blessing-copy.js（12 条 / 按场景分组），本页只管绘制与导出
const { TEMPLATES } = require('../../utils/blessing-copy.js');

// ---- 工具：兜底折行（万一某行仍超宽，再按字切一次）----
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- 工具：带字间距的居中文字（canvas 没有 letter-spacing，要逐字画）----
function drawSpaced(ctx, text, cx, y, spacing) {
  const chars = text.split('');
  let total = 0;
  chars.forEach(c => { total += ctx.measureText(c).width + spacing; });
  total -= spacing;
  let x = cx - total / 2;
  chars.forEach(c => {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + spacing;
  });
}

// ---- 工具：石榴花装饰（对应原型的内联 SVG）----
function drawBloom(ctx, cx, cy, r, alpha) {
  const pts = [[0, -1], [1, -0.27], [0.64, 0.91], [-0.64, 0.91], [-1, -0.27]];
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(cx + p[0] * r, cy + p[1] * r, r * 0.545, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(242,193,78,0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.364, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- 工具：圆角矩形路径（不用 ctx.roundRect，兼容性更稳）----
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

Page({
  data: {
    name: '',
    tplIdx: 0,
    exporting: false,
    cardPath: '',

    templates: TEMPLATES
  },

  onLoad(options) {
    // 从分享链接进来时带 tpl 参数（本页是非 tabBar 页，query 有效）
    const t = Number(options && options.tpl);
    if (Number.isInteger(t) && t >= 0 && t < this.data.templates.length) {
      this.setData({ tplIdx: t });
    }
    this.restoreCard();
  },

  /**
   * 恢复上次生成的卡片。
   * 存的是 USER_DATA_PATH 下的永久文件，不是 tempFilePath ——
   * 后者在小程序重启后就失效，会出现「计数说有 N 张，却一张都看不到」。
   */
  restoreCard() {
    const p = store.getCardFile();
    if (!p) return;
    wx.getFileSystemManager().access({
      path: p,
      success: () => this.setData({ cardPath: p }),
      // 文件可能被系统清理或用户清过缓存 —— 静默清掉失效路径，不打扰用户
      fail: () => store.setCardFile('')
    });
  },

  /**
   * 把临时图片转成永久文件（只保留最近一张，避免 USER_DATA_PATH 无限堆积）。
   * 保存失败不阻断主流程：本次仍可用临时路径预览、保存到相册、分享。
   */
  persist(tempPath) {
    return new Promise((resolve) => {
      const fs = wx.getFileSystemManager();
      const old = store.getCardFile();
      // 加随机后缀：只用 Date.now() 时，同一毫秒内连点两次会得到相同文件名，
      // 第二次会静默覆盖第一张（verify-card.js 抓到过这个问题）
      const filePath = wx.env.USER_DATA_PATH + '/card_' + Date.now() +
        '_' + Math.floor(Math.random() * 1e6) + '.png';
      fs.saveFile({
        tempFilePath: tempPath,
        filePath: filePath,
        success: (r) => {
          const saved = r.savedFilePath || filePath;
          store.setCardFile(saved);
          if (old && old !== saved && old.indexOf(wx.env.USER_DATA_PATH) === 0) {
            fs.unlink({ filePath: old, fail: () => {} });
          }
          resolve(saved);
        },
        fail: (e) => {
          console.warn('[祝福卡] 永久保存失败，本次使用临时文件', e);
          resolve(tempPath);
        }
      });
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onPickTpl(e) {
    this.setData({ tplIdx: Number(e.currentTarget.dataset.i), cardPath: '' });
  },

  /* ============ 1. 取到 canvas 节点 ============ */
  getCanvasNode() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#cardCanvas')
        .fields({ node: true, size: true })
        .exec(res => {
          if (!res || !res[0] || !res[0].node) return reject(new Error('canvas 节点未取到'));
          resolve(res[0]);
        });
    });
  },

  /* ============ 2. 绘制卡片（版式与页内预览一致） ============ */
  drawCard(canvas, cssW, cssH) {
    const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = cssW;
    const H = cssH;
    const PAD = 48;
    const CX = W / 2;

    // —— 底色：与页内预览的 150deg 渐变一致
    const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, '#C8443C');
    bg.addColorStop(0.6, '#A8322B');
    bg.addColorStop(1, '#8A2A25');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // —— 石榴花装饰（右上主花 + 左下小点缀）
    drawBloom(ctx, W - 84, 104, 88, 0.13);
    drawBloom(ctx, 66, H - 88, 58, 0.08);

    // —— 内描边
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 2;
    roundRect(ctx, 20, 20, W - 40, H - 40, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // —— ① 顶部引导语
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.font = '19px sans-serif';
    drawSpaced(ctx, '潮汕 · 成人礼', CX, 92, 8);

    // —— ② 主文案：预设断行，整块垂直居中在正文区（y 200 ~ 520）
    const lines = [].concat.apply([], this.data.templates[this.data.tplIdx].lines
      .map(l => wrapText(ctx, l, W - PAD * 2)));   // 兜底再折一次
    const lineH = 56;
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    const blockH = (lines.length - 1) * lineH;
    const bodyTop = 200;
    const bodyBottom = 520;
    let startY = (bodyTop + bodyBottom) / 2 - blockH / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, CX, startY + i * lineH));

    // —— ③ 署名
    const nameY = bodyBottom + 56;
    ctx.font = '25px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText('—— 致 ' + (this.data.name || '孩子'), CX, nameY);

    // —— ④ 底部区：分隔线 + 品牌 + 落款
    const divY = 656;
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CX - 110, divY);
    ctx.lineTo(CX + 110, divY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '21px sans-serif';
    drawSpaced(ctx, '出花園 · 潮汕成人礼', CX, divY + 44, 6);

    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.font = '18px sans-serif';
    ctx.fillText('农历七月初七 · 出花园正日', CX, divY + 80);

    return dpr;
  },

  /* ============ 3. 导出为临时图片 ============ */
  exportImage(canvas, cssW, cssH, dpr) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,                       // canvas 2d 必须传实例，不能再用 canvasId
        x: 0, y: 0,
        width: cssW,
        height: cssH,
        destWidth: cssW * dpr,
        destHeight: cssH * dpr,
        fileType: 'png',
        success: res => resolve(res.tempFilePath),
        fail: err => reject(err)
      });
    });
  },

  async onExport() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    try {
      const res = await this.getCanvasNode();
      const cssW = res.width || CARD_W;   // 取不到尺寸时用兜底常量
      const cssH = res.height || CARD_H;
      const dpr = this.drawCard(res.node, cssW, cssH);
      const tempPath = await this.exportImage(res.node, cssW, cssH, dpr);
      // 转永久文件：tempFilePath 重启即失效，不能直接展示给用户当"已生成"
      const path = await this.persist(tempPath);
      this.setData({ cardPath: path });
      store.addCard();                    // 累计生成张数，「我的花园」会读这个数
      wx.showToast({ title: '已生成', icon: 'success' });
    } catch (e) {
      console.error('[祝福卡] 生成失败', e);
      wx.showToast({ title: '生成失败，请重试', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  /* ============ 4. 放大预览 ============ */
  previewCard() {
    if (!this.data.cardPath) return;
    wx.previewImage({ urls: [this.data.cardPath] });
  },

  /* ============ 5. 保存到相册（隐私接口，需授权 + 隐私协议） ============ */
  saveToAlbum() {
    if (!this.data.cardPath) return;

    const doSave = () => {
      wx.saveImageToPhotosAlbum({
        filePath: this.data.cardPath,
        success: () => wx.showToast({ title: '已保存到相册' }),
        fail: err => {
          const msg = String((err && err.errMsg) || '');
          if (msg.indexOf('auth deny') > -1 || msg.indexOf('auth denied') > -1 || msg.indexOf('authorize') > -1) {
            wx.showModal({
              title: '需要相册权限',
              content: '保存图片需要你授权「保存到相册」，是否前往设置开启？',
              confirmText: '去设置',
              success: r => { if (r.confirm) wx.openSetting({}); }
            });
          } else if (msg.indexOf('cancel') > -1) {
            // 用户主动取消，不提示
          } else {
            wx.showToast({ title: '保存失败，请重试', icon: 'none' });
          }
        }
      });
    };

    // 新版隐私协议要求：调用相册等隐私接口前，先确认用户已同意《隐私保护指引》。
    // 前提是在小程序后台「用户隐私保护指引」里声明了「相册（仅写入）权限」。
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: doSave,
        fail: () => wx.showToast({ title: '需先同意隐私保护指引', icon: 'none' })
      });
    } else {
      doSave();
    }
  },

  /* ============ 6. 分享图片给好友 ============ */
  shareImage() {
    if (!this.data.cardPath) return;
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path: this.data.cardPath,
        fail: () => wx.showToast({ title: '已取消', icon: 'none' })
      });
    } else {
      // 低版本基础库降级：放大预览并提示长按
      wx.previewImage({ urls: [this.data.cardPath] });
      wx.showToast({ title: '长按图片可转发', icon: 'none' });
    }
  },

  onShareAppMessage() {
    // 分享「小程序页」而非图片时，带上所选模板下标 —— 本页是非 tabBar 页，query 有效。
    // 刻意**不把名字放进 path**：真实姓名/昵称属于个人信息，不写进可被转发的链接。
    return {
      title: '出花园祝福卡 · 也来做一张送孩子',
      path: '/pages/blessing/blessing?tpl=' + this.data.tplIdx
    };
  }
})
