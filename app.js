// app.js —— 全局逻辑
App({
  onLaunch() {
    // 云开发初始化（文化问答 AI 助手依赖）
    // 环境来自「小程序成长计划」自动创建的微信云开发环境（个人版，含 AI 资源包）
    // 未开通云开发时此调用会静默失败，问答页会提示「环境不支持」。
    if (wx.cloud) {
      wx.cloud.init({ env: 'cloud1-d0gmjjj1x9e73835a' });
    }

    // 缓存设备信息，供自定义导航栏（首页 / 体验 / 我的）避让状态栏使用
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.globalData.statusBarHeight = win.statusBarHeight || 20;
  },

  globalData: {
    statusBarHeight: 20,
    userRegion: '通用'
  }
})
