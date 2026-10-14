// 仪式体验 · 1:1 对应原型 ③ 七步仪式
// 进度会写入本机存储（utils/store.js），下次进入可以接着上次继续。

const app = getApp();
const store = require('../../utils/store.js');

const STEPS = [
  { n: '择吉', do: '择定吉日吉时。传统多在农历七月初七（乞巧节），也有人家选三月、五月，现代多择正月或由家庭商定。', mean: '以礼启新，郑重其事' },
  { n: '十二花水浴', do: '采十二种寓意吉祥的花草——石榴花、芙蓉花、春草、状元竹、榕树叶、百日红等，煮水给孩子沐浴。', mean: '洗去稚气，净身迎新' },
  { n: '换新衣 · 着红木屐', do: '穿外婆（舅家）送的新衣新鞋，系上母亲亲手缝的红肚兜——兜内压十二颗桂圆与两枚古铜钱，脚着红皮木屐。', mean: '脱胎换骨，一帆风顺' },
  { n: '拜公婆母', do: '于床上设浅沿大笸箩，供十二碗甜薯粉圆、十二盅乌豆酒、红桃粿、发粿与三牲——男孩供公鸡，女孩供母鸡。跪拜辞谢多年庇佑。', mean: '感恩守护，正式「离园」' },
  { n: '咬鸡头 · 头彩食', do: '整鸡上桌、鸡头对准孩子，象征性咬一口；十二碗「花园菜」每样都吃一点：猪肚换肠肚、芹菜勤劳、葱聪明、蒜会算、豆干做官、韭菜长久。', mean: '独占鳌头，事事有好彩头' },
  { n: '敬茶感恩', do: '孩子向父母长辈敬茶，长辈回赠红包或饰品，叮嘱「志在四方」。孩子破例坐上席大位，象征已成家中栋梁。', mean: '孝亲责任，家风传续' },
  { n: '躲花园', do: '当日不外出、不见天、不串门，静守家中完成身份转换；亦有「行巷」之说，寓意行四方、处处有得食。', mean: '收心立志，成人自持' }
];

function pad2(n) { return (n < 10 ? '0' : '') + n; }

Page({
  data: {
    statusBarHeight: 20,
    step: 0,
    no: '01',
    steps: STEPS,
    resumed: false          // 是否是从上次进度接着来的（用于给一句提示）
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight });

    // 接着上次的进度继续。
    // 注意：**只是打开这一页不算走过任何一步**，所以 saved <= 0 时不写存储 ——
    // 否则用户点一下「体验」Tab，「我的花园」就显示 1/7，那个数字是假的。
    const saved = store.getRitualStep();
    if (saved > 0) {
      this.setData({ resumed: true });
      this.setStep(saved, true);
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onPrev() {
    if (this.data.step === 0) return;
    this.setStep(this.data.step - 1);
  },

  onNext() {
    if (this.data.step === STEPS.length - 1) {
      // 礼成 → 去「我的花园」看纪念证书
      return wx.switchTab({ url: '/pages/mine/mine' });
    }
    this.setStep(this.data.step + 1);
  },

  /** @param {boolean} silent 恢复进度时用，不滚动、不弹提示 */
  setStep(i, silent) {
    this.setData({ step: i, no: pad2(i + 1) });
    store.setRitualStep(i);
    this.checkBadges(i);
    if (!silent) wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  /** 走到第 5 步解锁「咬鸡头」，走完 7 步解锁「礼成」 */
  checkBadges(i) {
    const news = [];
    if (i >= 4 && store.unlockBadge('yaojitou')) news.push('咬鸡头');
    if (i >= 6 && store.unlockBadge('licheng')) news.push('礼成');
    if (news.length) {
      wx.showToast({ title: '解锁徽章：' + news.join('、'), icon: 'none', duration: 2000 });
    }
  },

  onReset() {
    wx.showModal({
      title: '重新走一遍？',
      content: '仪式进度会归零，已获得的徽章不受影响。',
      success: (r) => {
        if (!r.confirm) return;
        store.resetRitual();                      // 归零 → 「我的花园」显示 0/7
        this.setData({ resumed: false, step: 0, no: '01' });
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
        wx.showToast({ title: '已重新开始', icon: 'none' });
      }
    });
  },

  // 注意：本页是 tabBar 页面，分享 path 上的 query 参数会被忽略（微信限制），
  // 所以只能落到首页。需要带参数的分享请参考 article / quiz / blessing 三页的写法。
  onShareAppMessage() {
    return { title: '出花园七步仪式 · 一步步走完潮汕成人礼', path: '/pages/index/index' };
  }
});
