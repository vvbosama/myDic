from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Expression, RelationEdge, RelationLabel, RelationType, User
from app.schemas import (
    RelationCreate,
    RelationEdgeRead,
    RelationEdgeUpdate,
    RelationEndpointRead,
    RelationLabelCreate,
    RelationLabelRead,
    RelationLabelUpdate,
)
from app.services.text import clean_expression, normalize_expression


EDGE_OPTIONS = (selectinload(RelationEdge.labels),)


async def _active_expression(session: AsyncSession, user_id: UUID, expression_id: UUID) -> Expression:
    expression = await session.scalar(
        select(Expression).where(
            Expression.id == expression_id,
            Expression.user_id == user_id,
            Expression.deleted_at.is_(None),
        )
    )
    if not expression:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expression not found")
    return expression


async def _expression_by_normalized(session: AsyncSession, user_id: UUID, normalized: str) -> Expression | None:
    return await session.scalar(
        select(Expression).where(
            Expression.user_id == user_id,
            Expression.normalized_text == normalized,
            Expression.deleted_at.is_(None),
        )
    )


def _label_values(payload: RelationLabelCreate | RelationLabelUpdate) -> tuple[str, str | None]:
    relation_type = payload.relation_type.value
    custom_name = payload.custom_relation_name.strip() if payload.custom_relation_name else None
    if payload.relation_type == RelationType.CUSTOM and not custom_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Custom relation name is required")
    if payload.relation_type != RelationType.CUSTOM:
        custom_name = None
    return relation_type, custom_name


async def _canonical_endpoints(
    session: AsyncSession,
    user: User,
    source_expression_id: UUID,
    target_text: str,
    target_expression_id: UUID | None,
) -> tuple[dict, dict]:
    source = await _active_expression(session, user.id, source_expression_id)
    clean_target = clean_expression(target_text)
    normalized_target = normalize_expression(clean_target)
    target: Expression | None = None
    if target_expression_id:
        target = await _active_expression(session, user.id, target_expression_id)
        if target.normalized_text != normalized_target:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target text does not match target expression")
    else:
        target = await _expression_by_normalized(session, user.id, normalized_target)
    if source.normalized_text == normalized_target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An expression cannot relate to itself")
    first = {
        "text": source.text,
        "normalized": source.normalized_text,
        "expression_id": source.id,
    }
    second = {
        "text": target.text if target else clean_target,
        "normalized": target.normalized_text if target else normalized_target,
        "expression_id": target.id if target else None,
    }
    return (first, second) if first["normalized"] < second["normalized"] else (second, first)


async def get_edge(session: AsyncSession, user_id: UUID, edge_id: UUID) -> RelationEdge:
    edge = await session.scalar(
        select(RelationEdge).options(*EDGE_OPTIONS).where(RelationEdge.id == edge_id, RelationEdge.user_id == user_id)
    )
    if not edge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relation not found")
    return edge


def edge_to_schema(edge: RelationEdge) -> RelationEdgeRead:
    return RelationEdgeRead(
        id=edge.id,
        endpoint_a=RelationEndpointRead(
            expression_id=edge.endpoint_a_expression_id,
            text=edge.endpoint_a_text,
            normalized_text=edge.endpoint_a_normalized,
            saved=edge.endpoint_a_expression_id is not None,
        ),
        endpoint_b=RelationEndpointRead(
            expression_id=edge.endpoint_b_expression_id,
            text=edge.endpoint_b_text,
            normalized_text=edge.endpoint_b_normalized,
            saved=edge.endpoint_b_expression_id is not None,
        ),
        labels=[RelationLabelRead.model_validate(label) for label in edge.labels],
        created_at=edge.created_at,
        updated_at=edge.updated_at,
    )


async def create_relation(session: AsyncSession, user: User, payload: RelationCreate) -> RelationEdge:
    endpoint_a, endpoint_b = await _canonical_endpoints(
        session,
        user,
        payload.source_expression_id,
        payload.target_text,
        payload.target_expression_id,
    )
    edge = await session.scalar(
        select(RelationEdge).options(*EDGE_OPTIONS).where(
            RelationEdge.user_id == user.id,
            RelationEdge.endpoint_a_normalized == endpoint_a["normalized"],
            RelationEdge.endpoint_b_normalized == endpoint_b["normalized"],
        )
    )
    if not edge:
        edge = RelationEdge(
            user_id=user.id,
            endpoint_a_text=endpoint_a["text"],
            endpoint_a_normalized=endpoint_a["normalized"],
            endpoint_a_expression_id=endpoint_a["expression_id"],
            endpoint_b_text=endpoint_b["text"],
            endpoint_b_normalized=endpoint_b["normalized"],
            endpoint_b_expression_id=endpoint_b["expression_id"],
            labels=[],
        )
        session.add(edge)
        await session.flush()
    relation_type, custom_name = _label_values(payload)
    existing_label = next(
        (
            item
            for item in edge.labels
            if item.relation_type == relation_type and (item.custom_relation_name or None) == custom_name
        ),
        None,
    )
    if not existing_label:
        edge.labels.append(RelationLabel(relation_type=relation_type, custom_relation_name=custom_name))
    await session.commit()
    return await get_edge(session, user.id, edge.id)


async def list_relations_for_expression(
    session: AsyncSession,
    user: User,
    expression_id: UUID,
) -> list[RelationEdge]:
    await _active_expression(session, user.id, expression_id)
    statement = (
        select(RelationEdge)
        .options(*EDGE_OPTIONS)
        .where(
            RelationEdge.user_id == user.id,
            or_(
                RelationEdge.endpoint_a_expression_id == expression_id,
                RelationEdge.endpoint_b_expression_id == expression_id,
            ),
        )
        .order_by(RelationEdge.updated_at.desc(), RelationEdge.id)
    )
    return list((await session.scalars(statement)).unique())


async def update_edge(
    session: AsyncSession,
    user: User,
    edge_id: UUID,
    payload: RelationEdgeUpdate,
) -> RelationEdge:
    edge = await get_edge(session, user.id, edge_id)
    if payload.source_expression_id not in {edge.endpoint_a_expression_id, edge.endpoint_b_expression_id}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source expression is not an endpoint of this relation")
    endpoint_a, endpoint_b = await _canonical_endpoints(
        session,
        user,
        payload.source_expression_id,
        payload.target_text,
        payload.target_expression_id,
    )
    collision = await session.scalar(
        select(RelationEdge.id).where(
            RelationEdge.user_id == user.id,
            RelationEdge.endpoint_a_normalized == endpoint_a["normalized"],
            RelationEdge.endpoint_b_normalized == endpoint_b["normalized"],
            RelationEdge.id != edge.id,
        )
    )
    if collision:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That relation already exists")
    edge.endpoint_a_text = endpoint_a["text"]
    edge.endpoint_a_normalized = endpoint_a["normalized"]
    edge.endpoint_a_expression_id = endpoint_a["expression_id"]
    edge.endpoint_b_text = endpoint_b["text"]
    edge.endpoint_b_normalized = endpoint_b["normalized"]
    edge.endpoint_b_expression_id = endpoint_b["expression_id"]
    await session.commit()
    return await get_edge(session, user.id, edge.id)


async def add_label(
    session: AsyncSession,
    user: User,
    edge_id: UUID,
    payload: RelationLabelCreate,
) -> RelationEdge:
    edge = await get_edge(session, user.id, edge_id)
    relation_type, custom_name = _label_values(payload)
    if not any(
        item.relation_type == relation_type and (item.custom_relation_name or None) == custom_name
        for item in edge.labels
    ):
        edge.labels.append(RelationLabel(relation_type=relation_type, custom_relation_name=custom_name))
        await session.commit()
    return await get_edge(session, user.id, edge.id)


async def update_label(
    session: AsyncSession,
    user: User,
    label_id: UUID,
    payload: RelationLabelUpdate,
) -> RelationEdge:
    label = await session.scalar(
        select(RelationLabel)
        .join(RelationEdge)
        .where(RelationLabel.id == label_id, RelationEdge.user_id == user.id)
    )
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relation label not found")
    relation_type, custom_name = _label_values(payload)
    duplicate = await session.scalar(
        select(RelationLabel.id).where(
            RelationLabel.edge_id == label.edge_id,
            RelationLabel.relation_type == relation_type,
            RelationLabel.custom_relation_name.is_(None) if custom_name is None else RelationLabel.custom_relation_name == custom_name,
            RelationLabel.id != label.id,
        )
    )
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That relation label already exists")
    label.relation_type = relation_type
    label.custom_relation_name = custom_name
    edge_id = label.edge_id
    await session.commit()
    return await get_edge(session, user.id, edge_id)


async def delete_label(session: AsyncSession, user: User, label_id: UUID) -> None:
    label = await session.scalar(
        select(RelationLabel)
        .options(selectinload(RelationLabel.edge).selectinload(RelationEdge.labels))
        .join(RelationEdge)
        .where(RelationLabel.id == label_id, RelationEdge.user_id == user.id)
    )
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relation label not found")
    edge = label.edge
    if len(edge.labels) == 1:
        await session.delete(edge)
    else:
        await session.delete(label)
    await session.commit()


async def delete_edge(session: AsyncSession, user: User, edge_id: UUID) -> None:
    edge = await get_edge(session, user.id, edge_id)
    await session.delete(edge)
    await session.commit()
