# Phase 2 FastAPI Backend

## 技术栈

Python 3.12、FastAPI、Pydantic 2、SQLAlchemy 2 async、asyncpg、PostgreSQL 16、Alembic。

Phase 2 暂无微信登录。所有请求通过服务端依赖注入绑定到 `.env` 中的 `DEV_USER_ID`；前端不会提交或伪造用户 ID。

## 数据库与 API

```powershell
docker compose up -d db
Set-Location backend
python -m pip install -e ".[dev]"
alembic upgrade head
python -m app.seed
python -m uvicorn app.main:app --reload
```

`python -m app.seed` 是幂等的，会补齐 200 条确定性开发数据和关系网络。`python -m app.seed --reset` 会删除固定开发用户及其全部数据后重建，只应在明确需要重置时使用。

主要接口均位于 `/api/v1`：

- `GET/POST /expressions`、`GET/PUT/DELETE /expressions/{id}`
- Meaning 与 Example 的独立新增、修改、删除接口
- `GET /search?q=`：个人库规范化精确查询
- `POST /expressions/{id}/visits`：幂等访问计数
- Relation Edge 与 Relation Label CRUD
- `GET /graph`：游标分页全局图，包括分页边界邻居和未收藏端点
- `GET /graph/{expressionId}`：完整一跳局部图，包括未收藏端点

错误响应固定包含 `code`、`message`、`details` 和 `requestId`；响应字段使用 camelCase，数据库字段使用 snake_case，时间使用带时区 ISO 8601。

## 测试

先保证 `docker compose up -d db` 已启动并完成迁移，然后运行：

```powershell
python -m pytest -q
```

集成测试覆盖 Card 嵌套写入、无向多标签关系、局部图、软删除/恢复和访问计数幂等性。
