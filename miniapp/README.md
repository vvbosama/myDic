# 个人英语表达知识网络 · Phase 2 小程序

这是 Taro + React + TypeScript 小程序工程。Phase 2 已接入 FastAPI 核心系统，Dictionary 与 AI 仍为 Mock。

## 数据边界

- Home / Search / Dictionary / Expression Card / Card Editor / Graph / Recent 七个页面
- Mock Dictionary、Mock AI Explain / Association / Compare
- API 模式：Card、Meaning、Example、无向 Relation Edge、Graph、访问次数由 PostgreSQL 持久化；未收藏的关系端点也会显示为可进入词典的图谱节点
- Mock 模式：保留 Phase 1 本地数据，便于无后端预览
- Dictionary 与 AI 服务继续通过 Mock 抽象提供，等待 Phase 3 替换
- API 请求失败会显示错误和重试入口，不会静默回退本地数据

## 运行

```powershell
npm install
$env:APP_DATA_MODE='api'
$env:APP_API_BASE_URL='http://127.0.0.1:8000/api/v1'
npm run dev:weapp
```

然后使用微信开发者工具打开仓库根目录（推荐），也可以直接打开 `miniapp/dist`。两种入口的项目配置都已关闭本地开发域名校验，可直接请求 `http://127.0.0.1:8000`。

离线原型可改用：

```powershell
$env:APP_DATA_MODE='mock'
npm run dev:weapp
```

`src/store/useCoreStore.ts` 是页面使用的统一数据层，`src/store/useAppStore.ts` 仅保留为兼容导出；`services/api.ts` 隔离后端协议，`mockDictionary.ts` 和 `mockAi.ts` 留给 Phase 3 替换。
