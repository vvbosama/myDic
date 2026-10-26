from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RelationType(StrEnum):
    SYNONYM = "Synonym"
    CONTRAST = "Contrast"
    RELATED = "Related"
    EXTENSION = "Extension"
    SCENARIO = "Scenario"
    CUSTOM = "Custom"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    wechat_openid: Mapped[str | None] = mapped_column(String(128), unique=True)
    nickname: Mapped[str | None] = mapped_column(String(120))

    expressions: Mapped[list[Expression]] = relationship(back_populates="user")


class Expression(TimestampMixin, Base):
    __tablename__ = "expressions"
    __table_args__ = (
        UniqueConstraint("user_id", "normalized_text", name="uq_expression_user_normalized"),
        Index("ix_expression_user_added", "user_id", "library_added_at"),
        Index("ix_expression_user_access", "user_id", "access_count"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_text: Mapped[str] = mapped_column(String(255), nullable=False)
    personal_understanding: Mapped[str] = mapped_column(Text, default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    access_count: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0", nullable=False)
    library_added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="expressions")
    meanings: Mapped[list[Meaning]] = relationship(
        back_populates="expression",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Meaning.sort_order",
    )
    visits: Mapped[list[ExpressionVisit]] = relationship(back_populates="expression", cascade="all, delete-orphan", passive_deletes=True)


class Meaning(TimestampMixin, Base):
    __tablename__ = "meanings"
    __table_args__ = (Index("ix_meaning_expression_sort", "expression_id", "sort_order"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    expression_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("expressions.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    expression: Mapped[Expression] = relationship(back_populates="meanings")
    examples: Mapped[list[Example]] = relationship(
        back_populates="meaning",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Example.sort_order",
    )


class Example(TimestampMixin, Base):
    __tablename__ = "examples"
    __table_args__ = (Index("ix_example_meaning_sort", "meaning_id", "sort_order"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    meaning_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("meanings.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    meaning: Mapped[Meaning] = relationship(back_populates="examples")


class RelationEdge(TimestampMixin, Base):
    __tablename__ = "relation_edges"
    __table_args__ = (
        UniqueConstraint("user_id", "endpoint_a_normalized", "endpoint_b_normalized", name="uq_relation_edge_pair"),
        CheckConstraint("endpoint_a_normalized <> endpoint_b_normalized", name="ck_relation_edge_not_self"),
        Index("ix_relation_edge_user_a_id", "user_id", "endpoint_a_expression_id"),
        Index("ix_relation_edge_user_b_id", "user_id", "endpoint_b_expression_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint_a_text: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint_a_normalized: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint_a_expression_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("expressions.id", ondelete="SET NULL"))
    endpoint_b_text: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint_b_normalized: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint_b_expression_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("expressions.id", ondelete="SET NULL"))

    labels: Mapped[list[RelationLabel]] = relationship(
        back_populates="edge",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RelationLabel.created_at",
    )


class RelationLabel(TimestampMixin, Base):
    __tablename__ = "relation_labels"
    __table_args__ = (
        CheckConstraint(
            "(relation_type = 'Custom' AND length(trim(custom_relation_name)) > 0) "
            "OR (relation_type <> 'Custom' AND custom_relation_name IS NULL)",
            name="ck_relation_label_custom_name",
        ),
        Index(
            "uq_relation_label_identity",
            "edge_id",
            "relation_type",
            text("COALESCE(custom_relation_name, '')"),
            unique=True,
        ),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    edge_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("relation_edges.id", ondelete="CASCADE"), nullable=False, index=True)
    relation_type: Mapped[str] = mapped_column(String(32), nullable=False)
    custom_relation_name: Mapped[str | None] = mapped_column(String(120))

    edge: Mapped[RelationEdge] = relationship(back_populates="labels")


class ExpressionVisit(Base):
    __tablename__ = "expression_visits"
    __table_args__ = (Index("ix_expression_visit_expression_time", "expression_id", "qualified_at"),)

    visit_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    expression_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("expressions.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    qualified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    expression: Mapped[Expression] = relationship(back_populates="visits")
