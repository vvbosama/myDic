# 个人英语表达知识网络微信小程序

一个以 **Expression Card + Personal Expression Graph** 为核心的微信小程序，帮助用户持续收藏、整理、关联和复习英语表达。

当前已完成 Phase 2：前端使用 Taro + React + TypeScript，后端使用 FastAPI + PostgreSQL，Card、Meaning、Example、无向 Relation Graph 与访问次数均已实现真实持久化。Dictionary 和 AI 目前仍使用 Mock，将在 Phase 3 接入真实服务。

## 当前状态

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| Phase 1 | Taro + React + TypeScript + Mock Data | 已完成 |
| Phase 2 | FastAPI + PostgreSQL + 真 CRUD + Relation Graph | 已完成 |
| Phase 3 | Free Dictionary API + 豆包 AI | 待开发 |
| Phase 4 | 微信登录 + 腾讯云部署 + HTTPS | 待开发 |

## 核心能力

- 搜索、收藏、编辑和软删除 Expression Card；
- 管理个人释义、例句和学习笔记；
- 使用一条无向边保存两个表达之间的多个关系标签；
- 浏览局部联想图和完整表达图谱；
- 支持未收藏的关系端点，并可从节点进入词典详情；
- Card 详情停留满 5 秒后记录一次幂等访问；
- 按添加时间、访问次数升序或降序复习表达；
- 首页只展示最近 5 个收藏表达及其直接关联节点。

## 技术栈

- 小程序：Taro 3、React 18、TypeScript、Zustand
- 后端：FastAPI、Pydantic 2、SQLAlchemy 2 async、Alembic
- 数据库：PostgreSQL 16
- 本地编排：Docker Compose
- 目标部署：腾讯云 + Docker Compose + Caddy + HTTPS

## 项目结构

```text
.
├─ miniapp/                  # Taro 微信小程序源码
├─ backend/                  # FastAPI API、迁移、种子和测试
├─ docker-compose.yml        # PostgreSQL 与 API 本地编排
├─ start-phase2-preview.ps1  # Phase 2 一键启动脚本
├─ project.config.json       # 微信开发者工具根目录配置
└─ *产品需求与开发实施文档*.md # 当前产品与开发基线
```

## 快速预览

前置环境：Docker Desktop、Node.js/npm、微信开发者工具。

在 PowerShell 中进入项目根目录后运行：

```powershell
.\start-phase2-preview.ps1
```

脚本会启动 PostgreSQL 和 FastAPI、执行数据库迁移、写入幂等开发数据，并构建/监听微信小程序。随后在微信开发者工具中直接打开项目根目录即可预览。

默认服务：

- API：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`
- 小程序构建目录：`miniapp/dist`

更详细的前端与后端命令分别见：

- [小程序说明](miniapp/README.md)
- [后端说明](backend/README.md)

## 验证

前端生产构建：

```powershell
Set-Location miniapp
npm install
npm run build:weapp
```

后端测试（需先启动 PostgreSQL 并完成迁移）：

```powershell
docker compose up -d db
Set-Location backend
python -m pip install -e ".[dev]"
alembic upgrade head
python -m pytest -q
```

## 文档

- [当前产品需求与开发实施文档（Phase 2 完成版）](个人英语表达知识网络微信小程序——V1.0%20产品需求与开发实施文档（Phase%202%20完成版）.md)
- [后端 API 与运行说明](backend/README.md)
- [小程序数据模式与运行说明](miniapp/README.md)

当历史设计与当前文档冲突时，以“Phase 2 完成版”产品文档和已实现代码为准。

## 配置与安全

- 真实环境变量必须写入 `.env`，不要提交到仓库；
- `.env.example` 与 `backend/.env.example` 仅提供字段模板；
- `project.private.config.json` 属于微信开发者工具本地配置，不进入版本控制；
- Phase 2 使用固定开发用户，正式微信登录和用户隔离将在 Phase 4 完成。
