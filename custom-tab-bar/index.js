// 自定义 TabBar
// 原生 tabBar 的图标必须是图片文件，无法用内联 SVG；
// 这里用自定义 TabBar + WXSS 里的 data-URI 背景图，1:1 还原原型的线性图标。
//
// ⚠️⚠️ 千万不要在 app.json 里加 "lazyCodeLoading": "requiredComponents" ⚠️⚠️
// 它会**按需注入自定义组件**，而自定义 tabBar 不在任何页面的 usingComponents 里声明，
// 结果就是 tabBar 不渲染、this.getTabBar() 返回 null，底部四个 Tab 点了没有任何反应。
// 微信官方社区有专帖记录这个冲突（改 nightly 版本也没修好），属于平台行为，不是配置写错。
// 代价：开发者工具「代码质量」里的「组件按需注入」那一项会显示未通过 —— 这是**故意不开的**，
// 以保底部导航可用。若将来想开，必须先把自定义 tabBar 换回原生 tabBar（那就要 png 图标）。
//
// 另一个前提：app.json 里 "custom": true 之后，**所有 tabBar 页面的 json 都必须显式写
// "usingComponents": {}**（空对象也不能省），否则 cold start 时 tabBar 同样渲染不出来。

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index',   text: '首页', icon: 'home' },
      { pagePath: '/pages/culture/culture', text: '文化', icon: 'book' },
      { pagePath: '/pages/ritual/ritual', text: '体验', icon: 'ring' },
      { pagePath: '/pages/mine/mine',     text: '我的', icon: 'user' }
    ]
  },

  methods: {
    onTap(e) {
      const i = e.currentTarget.dataset.i;
      const url = this.data.list[i].pagePath;
      if (i === this.data.selected) return;
      wx.switchTab({ url });
    }
  }
})
