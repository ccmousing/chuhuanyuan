// app.js —— 全局逻辑
App({
  onLaunch() {
    // 缓存设备信息，供自定义导航栏（首页 / 体验 / 我的）避让状态栏使用
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.globalData.statusBarHeight = win.statusBarHeight || 20;
  },

  globalData: {
    statusBarHeight: 20,
    userRegion: '通用'
  }
})
