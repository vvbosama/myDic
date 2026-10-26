from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal, get_session
from app.dependencies import get_current_user
from app.main import app
from app.models import User


@pytest.mark.asyncio
async def test_phase2_crud_relations_graph_and_idempotent_visits() -> None:
    user_id = uuid4()

    async def current_test_user(session: AsyncSession = Depends(get_session)) -> User:
        user = await session.get(User, user_id)
        if not user:
            user = User(id=user_id, nickname="Integration Test")
            session.add(user)
            await session.commit()
            await session.refresh(user)
        return user

    app.dependency_overrides[get_current_user] = current_test_user
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            invalid_expression = await client.post("/api/v1/expressions", json={"text": "   "})
            assert invalid_expression.status_code == 422
            assert invalid_expression.json()["code"] == "HTTP_422"
            assert invalid_expression.json()["requestId"]
            invalid_search = await client.get("/api/v1/search", params={"q": "   "})
            assert invalid_search.status_code == 422
            assert invalid_search.json()["code"] == "HTTP_422"

            alpha_response = await client.post("/api/v1/expressions", json={"text": "  Alpha  phrase "})
            beta_response = await client.post("/api/v1/expressions", json={"text": "Beta phrase"})
            assert alpha_response.status_code == 201
            assert beta_response.status_code == 201
            alpha = alpha_response.json()
            beta = beta_response.json()

            invalid_meaning = await client.post(
                f"/api/v1/expressions/{alpha['id']}/meanings",
                json={"content": "   ", "sortOrder": 0},
            )
            assert invalid_meaning.status_code == 422

            update_response = await client.put(
                f"/api/v1/expressions/{alpha['id']}",
                json={
                    "personalUnderstanding": "A personal explanation",
                    "notes": "A note",
                    "meanings": [{
                        "content": "first meaning",
                        "sortOrder": 0,
                        "examples": [{"content": "An example.", "sortOrder": 0}],
                    }],
                },
            )
            assert update_response.status_code == 200
            assert update_response.json()["meanings"][0]["examples"][0]["content"] == "An example."
            first_meaning = update_response.json()["meanings"][0]
            first_example = first_meaning["examples"][0]
            assert (await client.put(
                f"/api/v1/meanings/{first_meaning['id']}",
                json={"content": "updated meaning", "sortOrder": 0},
            )).json()["content"] == "updated meaning"
            assert (await client.put(
                f"/api/v1/examples/{first_example['id']}",
                json={"content": "Updated example.", "sortOrder": 0},
            )).json()["content"] == "Updated example."
            extra_meaning = (await client.post(
                f"/api/v1/expressions/{alpha['id']}/meanings",
                json={"content": "temporary meaning", "sortOrder": 1},
            )).json()
            extra_example = (await client.post(
                f"/api/v1/meanings/{extra_meaning['id']}/examples",
                json={"content": "Temporary example.", "sortOrder": 0},
            )).json()
            assert (await client.delete(f"/api/v1/examples/{extra_example['id']}")).status_code == 204
            assert (await client.delete(f"/api/v1/meanings/{extra_meaning['id']}")).status_code == 204

            first_relation = await client.post(
                "/api/v1/relations",
                json={
                    "sourceExpressionId": alpha["id"],
                    "targetText": beta["text"],
                    "targetExpressionId": beta["id"],
                    "relationType": "Synonym",
                },
            )
            second_relation = await client.post(
                "/api/v1/relations",
                json={
                    "sourceExpressionId": beta["id"],
                    "targetText": alpha["text"],
                    "targetExpressionId": alpha["id"],
                    "relationType": "Contrast",
                },
            )
            assert first_relation.status_code == 201
            assert second_relation.status_code == 201
            assert first_relation.json()["id"] == second_relation.json()["id"]
            assert {item["relationType"] for item in second_relation.json()["labels"]} == {"Synonym", "Contrast"}
            contrast_label = next(item for item in second_relation.json()["labels"] if item["relationType"] == "Contrast")
            relabelled = await client.put(
                f"/api/v1/relation-labels/{contrast_label['id']}",
                json={"relationType": "Related"},
            )
            assert {item["relationType"] for item in relabelled.json()["labels"]} == {"Synonym", "Related"}

            invalid_edge_update = await client.put(
                f"/api/v1/relations/{first_relation.json()['id']}",
                json={"sourceExpressionId": alpha["id"], "targetText": "   "},
            )
            assert invalid_edge_update.status_code == 422

            orphan_relation = await client.post(
                "/api/v1/relations",
                json={
                    "sourceExpressionId": alpha["id"],
                    "targetText": "Gamma dictionary phrase",
                    "relationType": "Related",
                },
            )
            assert orphan_relation.status_code == 201

            graph = (await client.get(f"/api/v1/graph/{alpha['id']}")).json()
            assert len(graph["nodes"]) == 3
            assert len(graph["edges"]) == 2
            saved_edge = next(item for item in graph["edges"] if len(item["labels"]) == 2)
            assert len(saved_edge["labels"]) == 2

            global_graph = (await client.get("/api/v1/graph", params={"limit": 100})).json()
            orphan_node = next(
                item for item in global_graph["nodes"]
                if item["normalizedText"] == "gamma dictionary phrase"
            )
            assert orphan_node["id"] is None
            assert orphan_node["saved"] is False
            assert any(
                "gamma dictionary phrase" in {
                    item["endpointANormalized"],
                    item["endpointBNormalized"],
                }
                for item in global_graph["edges"]
            )
            first_graph_page = (await client.get("/api/v1/graph", params={"limit": 1})).json()
            page_node_names = {item["normalizedText"] for item in first_graph_page["nodes"]}
            assert first_graph_page["hasMore"] is True
            assert all(
                {edge["endpointANormalized"], edge["endpointBNormalized"]} <= page_node_names
                for edge in first_graph_page["edges"]
            )

            visit_id = str(uuid4())
            first_visit = await client.post(f"/api/v1/expressions/{alpha['id']}/visits", json={"visitId": visit_id})
            repeated_visit = await client.post(f"/api/v1/expressions/{alpha['id']}/visits", json={"visitId": visit_id})
            assert first_visit.json() == {"counted": True, "accessCount": 1}
            assert repeated_visit.json() == {"counted": False, "accessCount": 1}

            deleted = await client.delete(f"/api/v1/expressions/{alpha['id']}")
            assert deleted.status_code == 204
            assert (await client.get(f"/api/v1/expressions/{alpha['id']}")).status_code == 404
            beta_relations = (await client.get(f"/api/v1/expressions/{beta['id']}/relations")).json()["items"]
            assert len(beta_relations) == 1
            assert not beta_relations[0]["endpointA"]["saved"]

            restored_response = await client.post("/api/v1/expressions", json={"text": "alpha phrase"})
            restored = restored_response.json()
            assert restored_response.status_code == 201
            assert restored["id"] == alpha["id"]
            assert restored["accessCount"] == 1
            assert restored["meanings"] == []
            restored_graph = (await client.get(f"/api/v1/graph/{restored['id']}")).json()
            assert len(restored_graph["edges"]) == 2

            search = await client.get("/api/v1/search", params={"q": " ALPHA   PHRASE "})
            assert search.json()["status"] == "saved"

            expression_list = await client.get("/api/v1/expressions", params={"limit": 1, "sort": "access_desc"})
            assert expression_list.status_code == 200
            assert expression_list.json()["hasMore"] is True
    finally:
        app.dependency_overrides.clear()
        async with SessionLocal() as session:
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
