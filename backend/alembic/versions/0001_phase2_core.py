"""Phase 2 core schema.

Revision ID: 0001_phase2_core
Revises:
Create Date: 2026-10-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_phase2_core"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wechat_openid", sa.String(length=128), nullable=True),
        sa.Column("nickname", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("wechat_openid"),
    )
    op.create_table(
        "expressions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text", sa.String(length=255), nullable=False),
        sa.Column("normalized_text", sa.String(length=255), nullable=False),
        sa.Column("personal_understanding", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("access_count", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("library_added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "normalized_text", name="uq_expression_user_normalized"),
    )
    op.create_index("ix_expressions_user_id", "expressions", ["user_id"])
    op.create_index("ix_expressions_deleted_at", "expressions", ["deleted_at"])
    op.create_index("ix_expression_user_added", "expressions", ["user_id", "library_added_at"])
    op.create_index("ix_expression_user_access", "expressions", ["user_id", "access_count"])
    op.create_table(
        "meanings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expression_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["expression_id"], ["expressions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meaning_expression_sort", "meanings", ["expression_id", "sort_order"])
    op.create_table(
        "examples",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meaning_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["meaning_id"], ["meanings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_example_meaning_sort", "examples", ["meaning_id", "sort_order"])
    op.create_table(
        "relation_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("endpoint_a_text", sa.String(length=255), nullable=False),
        sa.Column("endpoint_a_normalized", sa.String(length=255), nullable=False),
        sa.Column("endpoint_a_expression_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("endpoint_b_text", sa.String(length=255), nullable=False),
        sa.Column("endpoint_b_normalized", sa.String(length=255), nullable=False),
        sa.Column("endpoint_b_expression_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("endpoint_a_normalized <> endpoint_b_normalized", name="ck_relation_edge_not_self"),
        sa.ForeignKeyConstraint(["endpoint_a_expression_id"], ["expressions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["endpoint_b_expression_id"], ["expressions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "endpoint_a_normalized", "endpoint_b_normalized", name="uq_relation_edge_pair"),
    )
    op.create_index("ix_relation_edges_user_id", "relation_edges", ["user_id"])
    op.create_index("ix_relation_edge_user_a_id", "relation_edges", ["user_id", "endpoint_a_expression_id"])
    op.create_index("ix_relation_edge_user_b_id", "relation_edges", ["user_id", "endpoint_b_expression_id"])
    op.create_table(
        "relation_labels",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("relation_type", sa.String(length=32), nullable=False),
        sa.Column("custom_relation_name", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(relation_type = 'Custom' AND length(trim(custom_relation_name)) > 0) "
            "OR (relation_type <> 'Custom' AND custom_relation_name IS NULL)",
            name="ck_relation_label_custom_name",
        ),
        sa.ForeignKeyConstraint(["edge_id"], ["relation_edges.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_relation_labels_edge_id", "relation_labels", ["edge_id"])
    op.create_index(
        "uq_relation_label_identity",
        "relation_labels",
        ["edge_id", "relation_type", sa.text("COALESCE(custom_relation_name, '')")],
        unique=True,
    )
    op.create_table(
        "expression_visits",
        sa.Column("visit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expression_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("qualified_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["expression_id"], ["expressions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("visit_id"),
    )
    op.create_index("ix_expression_visit_expression_time", "expression_visits", ["expression_id", "qualified_at"])


def downgrade() -> None:
    op.drop_table("expression_visits")
    op.drop_table("relation_labels")
    op.drop_table("relation_edges")
    op.drop_table("examples")
    op.drop_table("meanings")
    op.drop_table("expressions")
    op.drop_table("users")

