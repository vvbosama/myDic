export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/search/index',
    'pages/recent/index',
    'pages/dictionary/index',
    'pages/expression/index',
    'pages/editor/index',
    'pages/graph/index'
  ],
  window: {
    navigationBarTitleText: '我的表达宇宙',
    navigationBarBackgroundColor: '#F6F4EF',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F6F4EF',
    backgroundTextStyle: 'light'
  },
  tabBar: {
    color: '#85827A',
    selectedColor: '#1D5B54',
    backgroundColor: '#FFFEFA',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/graph/index', text: '图谱' }
    ]
  },
  lazyCodeLoading: 'requiredComponents'
});
