from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Example, Expression, ExpressionVisit, Meaning, RelationEdge, User
from app.schemas import ExpressionPut, MeaningWrite
from app.services.cursors import decode_cursor, encode_cursor
from app.services.text import clean_expression, normalize_expression


DETAIL_OPTIONS = (selectinload(Expression.meanings).selectinload(Meaning.examples),)
ExpressionSort = Literal["created_desc", "access_desc", "access_asc"]


async def get_expression(
    session: AsyncSession,
    user_id: UUID,
    expression_id: UUID,
    *,
    include_deleted: bool = False,
) -> Expression:
    statement = select(Expression).options(*DETAIL_OPTIONS).where(
        Expression.id == expression_id,
        Expression.user_id == user_id,
    )
    if not include_deleted:
        statement = statement.where(Expression.deleted_at.is_(None))
    expression = (await session.scalars(statement)).unique().one_or_none()
    if not expression:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expression not found")
    return expression


async def find_expression_by_normalized(
    session: AsyncSession,
    user_id: UUID,
    normalized_text: str,
    *,
    include_deleted: bool = False,
) -> Expression | None:
    statement = select(Expression).options(*DETAIL_OPTIONS).where(
        Expression.user_id == user_id,
        Expression.normalized_text == normalized_text,
    )
    if not include_deleted:
        statement = statement.where(Expression.deleted_at.is_(None))
    return (await session.scalars(statement)).unique().one_or_none()


async def _bind_relation_endpoints(session: AsyncSession, expression: Expression) -> None:
    await session.execute(
        update(RelationEdge)
        .where(
            RelationEdge.user_id == expression.user_id,
            RelationEdge.endpoint_a_normalized == expression.normalized_text,
        )
        .values(endpoint_a_expression_id=expression.id, endpoint_a_text=expression.text)
    )
    await session.execute(
        update(RelationEdge)
        .where(
            RelationEdge.user_id == expression.user_id,
            RelationEdge.endpoint_b_normalized == expression.normalized_text,
        )
        .values(endpoint_b_expression_id=expression.id, endpoint_b_text=expression.text)
    )


async def create_or_restore_expression(
    session: AsyncSession,
    user: User,
    text: str,
) -> tuple[Expression, Literal["created", "restored", "existing"]]:
    clean_text = clean_expression(text)
    normalized = normalize_expression(clean_text)
    existing = await find_expression_by_normalized(session, user.id, normalized, include_deleted=True)
    now = datetime.now(timezone.utc)
    if existing and existing.deleted_at is None:
        return existing, "existing"
    if existing:
        existing.text = clean_text
        existing.personal_understanding = ""
        existing.notes = ""
        existing.deleted_at = None
        existing.library_added_at = now
        existing.updated_at = now
        existing.meanings.clear()
        await _bind_relation_endpoints(session, existing)
        await session.commit()
        return await get_expression(session, user.id, existing.id), "restored"

    expression = Expression(
        user_id=user.id,
        text=clean_text,
        normalized_text=normalized,
        personal_understanding="",
        notes="",
        access_count=0,
        library_added_at=now,
    )
    session.add(expression)
    await session.flush()
    await _bind_relation_endpoints(session, expression)
    await session.commit()
    return await get_expression(session, user.id, expression.id), "created"


def _clean_meaning_payload(items: list[MeaningWrite]) -> list[MeaningWrite]:
    meaningful = [item for item in items if item.content.strip()]
    return sorted(meaningful, key=lambda item: item.sort_order)


def _sync_examples(meaning: Meaning, payload: MeaningWrite) -> None:
    existing_by_id = {item.id: item for item in meaning.examples}
    retained_ids: set[UUID] = set()
    incoming = sorted((item for item in payload.examples if item.content.strip()), key=lambda item: item.sort_order)
    for sort_order, item in enumerate(incoming):
        if item.id:
            example = existing_by_id.get(item.id)
            if not example:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Example does not belong to this meaning")
            retained_ids.add(example.id)
        else:
            example = Example()
            meaning.examples.append(example)
        example.content = item.content.strip()
        example.sort_order = sort_order
    meaning.examples[:] = [item for item in meaning.examples if item.id in retained_ids or item.id not in existing_by_id]


def sync_meanings(expression: Expression, payload: list[MeaningWrite]) -> None:
    existing_by_id = {item.id: item for item in expression.meanings}
    retained_ids: set[UUID] = set()
    for sort_order, item in enumerate(_clean_meaning_payload(payload)):
        if item.id:
            meaning = existing_by_id.get(item.id)
            if not meaning:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meaning does not belong to this expression")
            retained_ids.add(meaning.id)
        else:
            meaning = Meaning()
            expression.meanings.append(meaning)
        meaning.content = item.content.strip()
        meaning.sort_order = sort_order
        _sync_examples(meaning, item)
    expression.meanings[:] = [item for item in expression.meanings if item.id in retained_ids or item.id not in existing_by_id]


async def update_expression(
    session: AsyncSession,
    user: User,
    expression_id: UUID,
    payload: ExpressionPut,
) -> Expression:
    expression = await get_expression(session, user.id, expression_id)
    expression.personal_understanding = payload.personal_understanding.strip()
    expression.notes = payload.notes.strip()
    expression.updated_at = datetime.now(timezone.utc)
    sync_meanings(expression, payload.meanings)
    await session.commit()
    return await get_expression(session, user.id, expression.id)


async def delete_expression(session: AsyncSession, user: User, expression_id: UUID) -> None:
    expression = await get_expression(session, user.id, expression_id)
    now = datetime.now(timezone.utc)
    expression.personal_understanding = ""
    expression.notes = ""
    expression.deleted_at = now
    expression.updated_at = now
    expression.meanings.clear()
    await session.execute(
        update(RelationEdge)
        .where(RelationEdge.user_id == user.id, RelationEdge.endpoint_a_expression_id == expression.id)
        .values(endpoint_a_expression_id=None)
    )
    await session.execute(
        update(RelationEdge)
        .where(RelationEdge.user_id == user.id, RelationEdge.endpoint_b_expression_id == expression.id)
        .values(endpoint_b_expression_id=None)
    )
    await session.commit()


async def list_expressions(
    session: AsyncSession,
    user: User,
    *,
    cursor: str | None,
    limit: int,
    sort: ExpressionSort,
) -> tuple[list[Expression], str | None, bool]:
    offset = decode_cursor(cursor)
    statement = select(Expression).options(*DETAIL_OPTIONS).where(
        Expression.user_id == user.id,
        Expression.deleted_at.is_(None),
    )
    if sort == "access_asc":
        statement = statement.order_by(Expression.access_count.asc(), Expression.library_added_at.desc(), Expression.id)
    elif sort == "access_desc":
        statement = statement.order_by(Expression.access_count.desc(), Expression.library_added_at.desc(), Expression.id)
    else:
        statement = statement.order_by(Expression.library_added_at.desc(), Expression.id)
    rows = list((await session.scalars(statement.offset(offset).limit(limit + 1))).unique())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = encode_cursor(offset + limit) if has_more else None
    return items, next_cursor, has_more


async def record_visit(
    session: AsyncSession,
    user: User,
    expression_id: UUID,
    visit_id: UUID,
) -> tuple[bool, int]:
    await get_expression(session, user.id, expression_id)
    insert_statement = (
        pg_insert(ExpressionVisit)
        .values(visit_id=visit_id, expression_id=expression_id, user_id=user.id)
        .on_conflict_do_nothing(index_elements=[ExpressionVisit.visit_id])
        .returning(ExpressionVisit.visit_id)
    )
    inserted = (await session.execute(insert_statement)).scalar_one_or_none()
    if inserted:
        await session.execute(
            update(Expression)
            .where(Expression.id == expression_id, Expression.user_id == user.id, Expression.deleted_at.is_(None))
            .values(access_count=Expression.access_count + 1)
        )
    await session.commit()
    access_count = await session.scalar(
        select(Expression.access_count).where(Expression.id == expression_id, Expression.user_id == user.id)
    )
    return inserted is not None, int(access_count or 0)


async def delete_meaning(session: AsyncSession, user: User, meaning_id: UUID) -> None:
    result = await session.execute(
        delete(Meaning)
        .where(
            Meaning.id == meaning_id,
            Meaning.expression_id.in_(
                select(Expression.id).where(Expression.user_id == user.id, Expression.deleted_at.is_(None))
            ),
        )
        .returning(Meaning.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meaning not found")
    await session.commit()


async def delete_example(session: AsyncSession, user: User, example_id: UUID) -> None:
    owned_meanings = select(Meaning.id).join(Expression).where(
        Expression.user_id == user.id,
        Expression.deleted_at.is_(None),
    )
    result = await session.execute(
        delete(Example).where(Example.id == example_id, Example.meaning_id.in_(owned_meanings)).returning(Example.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Example not found")
    await session.commit()
