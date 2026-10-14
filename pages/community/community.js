// 社区广场 · 对应原型 ⑥ 社区广场
//
// ⚠️ 本页整体为「规划中」状态，不是可用的社区功能。
//    原因：社区发帖属社交类目，个人主体小程序不予开放；
//    且 UGC 上线前必须接入内容安全检测（wx.security / 内容安全 API）与举报入口。
//
// 这里刻意不含任何编造的互动数据 —— 原来写的点赞数 328 / 512 / 1204
// 与评论数 46 / 88 / 173 已全部删除。未开放的功能配上好看的假数字，比空着更容易误导人。

const REASON = '社区发帖属社交类目，个人主体小程序不予开放，需先注册个体工商户或企业主体。';

Page({
  data: {
    // 界面形态示意用：人物与内容均为虚构，页面上方已明确声明
    posts: [
      {
        who: '示例用户 A', when: '示意 · 汕头', av: 'linear-gradient(135deg,#E6C583,#C8443C)',
        text: '今天轮到我出花园了。奶奶剪了石榴枝插在我头上，说「出了花园就是大人了」，突然有点想哭。',
        imgs: ['linear-gradient(135deg,#F0D9C0,#D9A96F)', 'linear-gradient(135deg,#E8B7B0,#C8443C)', 'linear-gradient(135deg,#CFE3DA,#3F8C76)']
      },
      {
        who: '示例用户 B', when: '示意 · 揭阳', av: 'linear-gradient(135deg,#CFE3DA,#3F8C76)',
        text: '给女儿办的出花园，十二碗头一样都没少。她说咬鸡头那一下最好玩，笑到不行。',
        imgs: []
      },
      {
        who: '示例用户 C', when: '示意 · 海外潮籍', av: 'linear-gradient(135deg,#D7D2F0,#6A5FC0)',
        text: '在海外长大，第一次知道原来 15 岁还有这样的仪式。谢谢小程序让我看懂了家里的根。',
        imgs: []
      }
    ]
  },

  /** 点击灰显的互动按钮：如实说明，不留死按钮 */
  onPlanTap(e) {
    const a = e.currentTarget.dataset.a || '该功能';
    wx.showModal({
      title: '尚未开放',
      content: a + '：' + REASON + '\n\n开放前还需接入内容安全检测、举报入口与用户协议。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onShareAppMessage() {
    // 分享语只描述产品，不承诺未开放的社区功能
    return { title: '出花园 · 潮汕人的十五岁成人礼', path: '/pages/index/index' };
  }
});
