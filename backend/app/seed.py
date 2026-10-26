from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import SessionLocal
from app.models import Example, Expression, Meaning, RelationEdge, RelationLabel, User
from app.services.text import normalize_expression


CURATED = [
    ("significant", "表示某件事情达到值得注意的程度；比 important 更正式。", "重要的；有意义的", "The decision had a significant impact on the project."),
    ("mitigate", "使已经存在的负面问题程度降低，而不是完全解决。", "减轻；缓和", "These measures can mitigate the risk."),
    ("substantial", "达到一个不可忽视、相当可观的程度。", "大量的；可观的", "The project requires a substantial investment."),
    ("important", "重要的，值得优先关注的。", "重要的", "It is important to understand the context."),
    ("profound", "影响深远、程度很深的。", "深刻的；深远的", "The experience had a profound effect on her."),
    ("alleviate", "减轻痛苦、压力或问题的严重程度。", "减轻；缓解", "The new policy may alleviate pressure on families."),
    ("reduce", "使数量、程度或规模变小。", "减少；降低", "We need to reduce unnecessary waste."),
    ("prevent", "提前阻止某件事发生。", "阻止；预防", "Early action can prevent the problem from spreading."),
    ("contribute to", "对某个结果、目标或问题起到一部分作用。", "促成；有助于", "Small changes can contribute to a better outcome."),
    ("go a long way toward", "对实现目标有很大帮助，但不一定完全解决问题。", "大大有助于", "This change will go a long way toward addressing the problem."),
]

ROOTS = [
    "analyze", "anticipate", "clarify", "collaborate", "compose", "convey",
    "demonstrate", "derive", "differentiate", "emphasize", "enhance", "establish",
    "evaluate", "facilitate", "formulate", "illustrate", "implement", "indicate",
    "interpret", "maintain", "obtain", "prioritize", "promote", "reinforce",
    "relevant", "resolve", "retain", "specify", "strengthen", "transform",
]

BASE_RELATIONS = [
    ("significant", "substantial", "Synonym"),
    ("significant", "important", "Contrast"),
    ("significant", "profound", "Related"),
    ("significant", "significant impact", "Extension"),
    ("mitigate", "alleviate", "Related"),
    ("mitigate", "reduce", "Contrast"),
    ("mitigate", "prevent", "Related"),
    ("mitigate", "mitigate the risk", "Extension"),
    ("contribute to", "go a long way toward", "Related"),
]


def stable_id(kind: str, value: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"expression-network:{kind}:{value}")


async def add_edge(
    session: AsyncSession,
    user_id: UUID,
    expressions: dict[str, Expression],
    source_text: str,
    target_text: str,
    relation_type: str,
) -> None:
    source_normalized = normalize_expression(source_text)
    target_normalized = normalize_expression(target_text)
    source = expressions[source_normalized]
    target = expressions.get(target_normalized)
    endpoints = [
        (source.text, source.normalized_text, source.id),
        (target.text if target else target_text, target_normalized, target.id if target else None),
    ]
    endpoints.sort(key=lambda item: item[1])
    first, second = endpoints
    edge = await session.scalar(
        select(RelationEdge).where(
            RelationEdge.user_id == user_id,
            RelationEdge.endpoint_a_normalized == first[1],
            RelationEdge.endpoint_b_normalized == second[1],
        )
    )
    if not edge:
        pair = f"{first[1]}::{second[1]}"
        edge = RelationEdge(
            id=stable_id("edge", pair),
            user_id=user_id,
            endpoint_a_text=first[0],
            endpoint_a_normalized=first[1],
            endpoint_a_expression_id=first[2],
            endpoint_b_text=second[0],
            endpoint_b_normalized=second[1],
            endpoint_b_expression_id=second[2],
        )
        session.add(edge)
        await session.flush()
    existing = await session.scalar(
        select(RelationLabel.id).where(
            RelationLabel.edge_id == edge.id,
            RelationLabel.relation_type == relation_type,
            RelationLabel.custom_relation_name.is_(None),
        )
    )
    if not existing:
        session.add(RelationLabel(
            id=stable_id("label", f"{edge.id}:{relation_type}"),
            edge_id=edge.id,
            relation_type=relation_type,
        ))


async def seed(*, reset: bool = False) -> tuple[int, int]:
    settings = get_settings()
    async with SessionLocal() as session:
        if reset:
            await session.execute(delete(User).where(User.id == settings.dev_user_id))
            await session.commit()

        user = await session.get(User, settings.dev_user_id)
        if not user:
            user = User(id=settings.dev_user_id, nickname="Phase 2 Developer")
            session.add(user)
            await session.flush()

        expressions = {
            item.normalized_text: item
            for item in await session.scalars(
                select(Expression).where(Expression.user_id == user.id)
            )
        }
        anchor = datetime(2026, 9, 29, 8, tzinfo=timezone.utc)
        records: list[tuple[str, str, str, str]] = list(CURATED)
        for index in range(190):
            serial = f"{index + 1:03d}"
            root = ROOTS[index % len(ROOTS)]
            records.append((
                f"{root} {serial}",
                f"Mock Card {serial}，用于测试大规模表达图谱。",
                f"与 {root} 相关的测试表达",
                "",
            ))

        for index, (text, understanding, meaning_text, example_text) in enumerate(records):
            normalized = normalize_expression(text)
            if normalized in expressions:
                continue
            timestamp = anchor - timedelta(days=index)
            expression = Expression(
                id=stable_id("expression", normalized),
                user_id=user.id,
                text=text,
                normalized_text=normalized,
                personal_understanding=understanding,
                notes="Phase 2 PostgreSQL 种子数据。" if index >= len(CURATED) else "",
                access_count=index % 17,
                library_added_at=timestamp,
                created_at=timestamp,
                updated_at=timestamp,
            )
            meaning = Meaning(
                id=stable_id("meaning", normalized),
                content=meaning_text,
                sort_order=0,
                created_at=timestamp,
                updated_at=timestamp,
            )
            if example_text:
                meaning.examples.append(Example(
                    id=stable_id("example", normalized),
                    content=example_text,
                    sort_order=0,
                    created_at=timestamp,
                    updated_at=timestamp,
                ))
            expression.meanings.append(meaning)
            session.add(expression)
            expressions[normalized] = expression
        await session.flush()

        for source, target, relation_type in BASE_RELATIONS:
            await add_edge(session, user.id, expressions, source, target, relation_type)
        generated = [f"{ROOTS[index % len(ROOTS)]} {index + 1:03d}" for index in range(190)]
        for index, source in enumerate(generated):
            target = generated[index - 1] if index else "significant"
            relation_type = ("Related", "Extension", "Scenario")[index % 3]
            await add_edge(session, user.id, expressions, source, target, relation_type)
            if index % 4 == 0:
                await add_edge(session, user.id, expressions, source, CURATED[1 + index % 3][0], "Related")
        await session.commit()

        expression_count = len(list(await session.scalars(
            select(Expression.id).where(Expression.user_id == user.id, Expression.deleted_at.is_(None))
        )))
        relation_count = len(list(await session.scalars(
            select(RelationEdge.id).where(RelationEdge.user_id == user.id)
        )))
        return expression_count, relation_count


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed deterministic Phase 2 development data")
    parser.add_argument("--reset", action="store_true", help="Delete the fixed development user and recreate all seed data")
    args = parser.parse_args()
    expression_count, relation_count = await seed(reset=args.reset)
    print(f"Seed ready: {expression_count} expressions, {relation_count} relation edges")


if __name__ == "__main__":
    asyncio.run(main())
