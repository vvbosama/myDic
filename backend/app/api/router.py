from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUserDep, SessionDep
from app.models import Example, Expression, Meaning
from app.schemas import (
    ExampleCreate,
    ExampleRead,
    ExampleUpdate,
    ExpressionCreate,
    ExpressionListResponse,
    ExpressionPut,
    ExpressionRead,
    GraphResponse,
    MeaningCreate,
    MeaningRead,
    MeaningUpdate,
    RelationCreate,
    RelationEdgeRead,
    RelationEdgeUpdate,
    RelationLabelCreate,
    RelationLabelUpdate,
    RelationListResponse,
    SearchResponse,
    VisitCreate,
    VisitResponse,
)
from app.services import expressions as expression_service
from app.services import graph as graph_service
from app.services import relations as relation_service
from app.services.text import normalize_expression


router = APIRouter(prefix="/api/v1")


@router.get("/expressions", response_model=ExpressionListResponse)
async def list_expressions(
    session: SessionDep,
    user: CurrentUserDep,
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    sort: Literal["created_desc", "access_desc", "access_asc"] = "created_desc",
) -> ExpressionListResponse:
    items, next_cursor, has_more = await expression_service.list_expressions(
        session,
        user,
        cursor=cursor,
        limit=limit,
        sort=sort,
    )
    return ExpressionListResponse(
        items=[ExpressionRead.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/expressions/{expression_id}", response_model=ExpressionRead)
async def get_expression(expression_id: UUID, session: SessionDep, user: CurrentUserDep) -> ExpressionRead:
    expression = await expression_service.get_expression(session, user.id, expression_id)
    return ExpressionRead.model_validate(expression)


@router.post("/expressions", response_model=ExpressionRead, status_code=status.HTTP_201_CREATED)
async def create_expression(
    payload: ExpressionCreate,
    response: Response,
    session: SessionDep,
    user: CurrentUserDep,
) -> ExpressionRead:
    expression, outcome = await expression_service.create_or_restore_expression(session, user, payload.text)
    if outcome == "existing":
        response.status_code = status.HTTP_200_OK
    return ExpressionRead.model_validate(expression)


@router.put("/expressions/{expression_id}", response_model=ExpressionRead)
async def update_expression(
    expression_id: UUID,
    payload: ExpressionPut,
    session: SessionDep,
    user: CurrentUserDep,
) -> ExpressionRead:
    expression = await expression_service.update_expression(session, user, expression_id, payload)
    return ExpressionRead.model_validate(expression)


@router.delete("/expressions/{expression_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expression(expression_id: UUID, session: SessionDep, user: CurrentUserDep) -> Response:
    await expression_service.delete_expression(session, user, expression_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/expressions/{expression_id}/visits", response_model=VisitResponse)
async def record_visit(
    expression_id: UUID,
    payload: VisitCreate,
    session: SessionDep,
    user: CurrentUserDep,
) -> VisitResponse:
    counted, access_count = await expression_service.record_visit(
        session,
        user,
        expression_id,
        payload.visit_id,
    )
    return VisitResponse(counted=counted, access_count=access_count)


@router.get("/search", response_model=SearchResponse)
async def search_expression(
    session: SessionDep,
    user: CurrentUserDep,
    q: str = Query(min_length=1, max_length=255),
) -> SearchResponse:
    normalized = normalize_expression(q)
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Search query cannot be blank")
    expression = await expression_service.find_expression_by_normalized(session, user.id, normalized)
    return SearchResponse(
        status="saved" if expression else "not_saved",
        normalized_query=normalized,
        expression=ExpressionRead.model_validate(expression) if expression else None,
    )


async def _owned_meaning(session: SessionDep, user_id: UUID, meaning_id: UUID) -> Meaning:
    meaning = await session.scalar(
        select(Meaning)
        .options(selectinload(Meaning.examples))
        .join(Expression)
        .where(
            Meaning.id == meaning_id,
            Expression.user_id == user_id,
            Expression.deleted_at.is_(None),
        )
    )
    if not meaning:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meaning not found")
    return meaning


@router.post("/expressions/{expression_id}/meanings", response_model=MeaningRead, status_code=status.HTTP_201_CREATED)
async def create_meaning(
    expression_id: UUID,
    payload: MeaningCreate,
    session: SessionDep,
    user: CurrentUserDep,
) -> MeaningRead:
    expression = await expression_service.get_expression(session, user.id, expression_id)
    meaning = Meaning(content=payload.content.strip(), sort_order=payload.sort_order)
    expression.meanings.append(meaning)
    await session.commit()
    meaning = await _owned_meaning(session, user.id, meaning.id)
    return MeaningRead.model_validate(meaning)


@router.put("/meanings/{meaning_id}", response_model=MeaningRead)
async def update_meaning(
    meaning_id: UUID,
    payload: MeaningUpdate,
    session: SessionDep,
    user: CurrentUserDep,
) -> MeaningRead:
    meaning = await _owned_meaning(session, user.id, meaning_id)
    meaning.content = payload.content.strip()
    meaning.sort_order = payload.sort_order
    await session.commit()
    meaning = await _owned_meaning(session, user.id, meaning_id)
    return MeaningRead.model_validate(meaning)


@router.delete("/meanings/{meaning_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meaning(meaning_id: UUID, session: SessionDep, user: CurrentUserDep) -> Response:
    await expression_service.delete_meaning(session, user, meaning_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _owned_example(session: SessionDep, user_id: UUID, example_id: UUID) -> Example:
    example = await session.scalar(
        select(Example)
        .join(Meaning)
        .join(Expression)
        .where(
            Example.id == example_id,
            Expression.user_id == user_id,
            Expression.deleted_at.is_(None),
        )
    )
    if not example:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Example not found")
    return example


@router.post("/meanings/{meaning_id}/examples", response_model=ExampleRead, status_code=status.HTTP_201_CREATED)
async def create_example(
    meaning_id: UUID,
    payload: ExampleCreate,
    session: SessionDep,
    user: CurrentUserDep,
) -> ExampleRead:
    meaning = await _owned_meaning(session, user.id, meaning_id)
    example = Example(content=payload.content.strip(), sort_order=payload.sort_order)
    meaning.examples.append(example)
    await session.commit()
    return ExampleRead.model_validate(example)


@router.put("/examples/{example_id}", response_model=ExampleRead)
async def update_example(
    example_id: UUID,
    payload: ExampleUpdate,
    session: SessionDep,
    user: CurrentUserDep,
) -> ExampleRead:
    example = await _owned_example(session, user.id, example_id)
    example.content = payload.content.strip()
    example.sort_order = payload.sort_order
    await session.commit()
    example = await _owned_example(session, user.id, example_id)
    return ExampleRead.model_validate(example)


@router.delete("/examples/{example_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_example(example_id: UUID, session: SessionDep, user: CurrentUserDep) -> Response:
    await expression_service.delete_example(session, user, example_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/expressions/{expression_id}/relations", response_model=RelationListResponse)
async def list_relations(
    expression_id: UUID,
    session: SessionDep,
    user: CurrentUserDep,
) -> RelationListResponse:
    edges = await relation_service.list_relations_for_expression(session, user, expression_id)
    return RelationListResponse(items=[relation_service.edge_to_schema(edge) for edge in edges])


@router.post("/relations", response_model=RelationEdgeRead, status_code=status.HTTP_201_CREATED)
async def create_relation(
    payload: RelationCreate,
    session: SessionDep,
    user: CurrentUserDep,
) -> RelationEdgeRead:
    edge = await relation_service.create_relation(session, user, payload)
    return relation_service.edge_to_schema(edge)


@router.put("/relations/{edge_id}", response_model=RelationEdgeRead)
async def update_relation(
    edge_id: UUID,
    payload: RelationEdgeUpdate,
    session: SessionDep,
    user: CurrentUserDep,
) -> RelationEdgeRead:
    edge = await relation_service.update_edge(session, user, edge_id, payload)
    return relation_service.edge_to_schema(edge)


@router.delete("/relations/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relation(edge_id: UUID, session: SessionDep, user: CurrentUserDep) -> Response:
    await relation_service.delete_edge(session, user, edge_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/relations/{edge_id}/labels", response_model=RelationEdgeRead, status_code=status.HTTP_201_CREATED)
async def add_relation_label(
    edge_id: UUID,
    payload: RelationLabelCreate,
    session: SessionDep,
    user: CurrentUserDep,
) -> RelationEdgeRead:
    edge = await relation_service.add_label(session, user, edge_id, payload)
    return relation_service.edge_to_schema(edge)


@router.put("/relation-labels/{label_id}", response_model=RelationEdgeRead)
async def update_relation_label(
    label_id: UUID,
    payload: RelationLabelUpdate,
    session: SessionDep,
    user: CurrentUserDep,
) -> RelationEdgeRead:
    edge = await relation_service.update_label(session, user, label_id, payload)
    return relation_service.edge_to_schema(edge)


@router.delete("/relation-labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relation_label(label_id: UUID, session: SessionDep, user: CurrentUserDep) -> Response:
    await relation_service.delete_label(session, user, label_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/graph", response_model=GraphResponse)
async def get_global_graph(
    session: SessionDep,
    user: CurrentUserDep,
    cursor: str | None = None,
    limit: int = Query(default=300, ge=1, le=500),
) -> GraphResponse:
    return await graph_service.global_graph(session, user, cursor=cursor, limit=limit)


@router.get("/graph/{expression_id}", response_model=GraphResponse)
async def get_local_graph(expression_id: UUID, session: SessionDep, user: CurrentUserDep) -> GraphResponse:
    return await graph_service.local_graph(session, user, expression_id)
