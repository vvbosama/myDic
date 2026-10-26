from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Expression, RelationEdge, User
from app.schemas import GraphEdge, GraphNode, GraphResponse, RelationLabelRead
from app.services.cursors import decode_cursor, encode_cursor
from app.services.expressions import get_expression


def _node_from_expression(expression: Expression) -> GraphNode:
    return GraphNode(
        id=expression.id,
        text=expression.text,
        normalized_text=expression.normalized_text,
        saved=True,
        access_count=expression.access_count,
        library_added_at=expression.library_added_at,
    )


def _edge_schema(edge: RelationEdge) -> GraphEdge:
    return GraphEdge(
        id=edge.id,
        endpoint_a_normalized=edge.endpoint_a_normalized,
        endpoint_b_normalized=edge.endpoint_b_normalized,
        labels=[RelationLabelRead.model_validate(label) for label in edge.labels],
    )


async def global_graph(
    session: AsyncSession,
    user: User,
    *,
    cursor: str | None,
    limit: int,
) -> GraphResponse:
    offset = decode_cursor(cursor)
    statement = (
        select(Expression)
        .where(Expression.user_id == user.id, Expression.deleted_at.is_(None))
        .order_by(Expression.library_added_at.desc(), Expression.id)
        .offset(offset)
        .limit(limit + 1)
    )
    rows = list(await session.scalars(statement))
    has_more = len(rows) > limit
    expressions = rows[:limit]
    page_ids = [item.id for item in expressions]
    edges: list[RelationEdge] = []
    if page_ids:
        edge_statement = (
            select(RelationEdge)
            .options(selectinload(RelationEdge.labels))
            .where(
                RelationEdge.user_id == user.id,
                or_(
                    RelationEdge.endpoint_a_expression_id.in_(page_ids),
                    RelationEdge.endpoint_b_expression_id.in_(page_ids),
                ),
            )
            .order_by(RelationEdge.id)
        )
        edges = list((await session.scalars(edge_statement)).unique())

    # The page limit applies to the saved expressions selected above. Include
    # saved boundary neighbours as well so that every returned edge always has
    # two renderable nodes, even when its other Card belongs to another page.
    neighbour_ids = {
        endpoint_id
        for edge in edges
        for endpoint_id in (edge.endpoint_a_expression_id, edge.endpoint_b_expression_id)
        if endpoint_id and endpoint_id not in page_ids
    }
    neighbours: list[Expression] = []
    if neighbour_ids:
        neighbours = list(
            await session.scalars(
                select(Expression)
                .where(
                    Expression.user_id == user.id,
                    Expression.deleted_at.is_(None),
                    Expression.id.in_(neighbour_ids),
                )
                .order_by(Expression.library_added_at.desc(), Expression.id)
            )
        )

    nodes_by_normalized = {
        item.normalized_text: _node_from_expression(item)
        for item in [*expressions, *neighbours]
    }
    # A relation may deliberately point to a dictionary expression which has
    # not been saved as a Card yet. It is still a first-class graph node; the
    # client routes it to dictionary details instead of the Card detail page.
    for edge in edges:
        if edge.endpoint_a_normalized not in nodes_by_normalized:
            nodes_by_normalized[edge.endpoint_a_normalized] = GraphNode(
                id=None,
                text=edge.endpoint_a_text,
                normalized_text=edge.endpoint_a_normalized,
                saved=False,
            )
        if edge.endpoint_b_normalized not in nodes_by_normalized:
            nodes_by_normalized[edge.endpoint_b_normalized] = GraphNode(
                id=None,
                text=edge.endpoint_b_text,
                normalized_text=edge.endpoint_b_normalized,
                saved=False,
            )
    return GraphResponse(
        nodes=list(nodes_by_normalized.values()),
        edges=[_edge_schema(item) for item in edges],
        next_cursor=encode_cursor(offset + limit) if has_more else None,
        has_more=has_more,
    )


async def local_graph(session: AsyncSession, user: User, expression_id: UUID) -> GraphResponse:
    center = await get_expression(session, user.id, expression_id)
    edge_statement = (
        select(RelationEdge)
        .options(selectinload(RelationEdge.labels))
        .where(
            RelationEdge.user_id == user.id,
            or_(
                RelationEdge.endpoint_a_expression_id == center.id,
                RelationEdge.endpoint_b_expression_id == center.id,
            ),
        )
        .order_by(RelationEdge.id)
    )
    edges = list((await session.scalars(edge_statement)).unique())
    neighbour_ids = {
        endpoint_id
        for edge in edges
        for endpoint_id in (edge.endpoint_a_expression_id, edge.endpoint_b_expression_id)
        if endpoint_id and endpoint_id != center.id
    }
    neighbours: list[Expression] = []
    if neighbour_ids:
        neighbours = list(
            await session.scalars(
                select(Expression).where(
                    Expression.user_id == user.id,
                    Expression.deleted_at.is_(None),
                    Expression.id.in_(neighbour_ids),
                )
            )
        )
    nodes_by_normalized = {center.normalized_text: _node_from_expression(center)}
    for neighbour in neighbours:
        nodes_by_normalized[neighbour.normalized_text] = _node_from_expression(neighbour)
    for edge in edges:
        if edge.endpoint_a_normalized not in nodes_by_normalized:
            nodes_by_normalized[edge.endpoint_a_normalized] = GraphNode(
                id=None,
                text=edge.endpoint_a_text,
                normalized_text=edge.endpoint_a_normalized,
                saved=False,
            )
        if edge.endpoint_b_normalized not in nodes_by_normalized:
            nodes_by_normalized[edge.endpoint_b_normalized] = GraphNode(
                id=None,
                text=edge.endpoint_b_text,
                normalized_text=edge.endpoint_b_normalized,
                saved=False,
            )
    return GraphResponse(
        nodes=list(nodes_by_normalized.values()),
        edges=[_edge_schema(item) for item in edges],
    )
