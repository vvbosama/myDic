from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import RelationType


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(item.capitalize() for item in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class ExampleWrite(ApiModel):
    id: UUID | None = None
    content: str = Field(default="", max_length=2000)
    sort_order: int = Field(default=0, ge=0)


class ExampleRead(ApiModel):
    id: UUID
    content: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class MeaningWrite(ApiModel):
    id: UUID | None = None
    content: str = Field(default="", max_length=2000)
    sort_order: int = Field(default=0, ge=0)
    examples: list[ExampleWrite] = Field(default_factory=list)


class MeaningRead(ApiModel):
    id: UUID
    content: str
    sort_order: int
    examples: list[ExampleRead]
    created_at: datetime
    updated_at: datetime


class ExpressionCreate(ApiModel):
    text: str = Field(min_length=1, max_length=255)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Expression cannot be blank")
        return clean


class ExpressionPut(ApiModel):
    personal_understanding: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=2000)
    meanings: list[MeaningWrite] = Field(default_factory=list)


class ExpressionRead(ApiModel):
    id: UUID
    text: str
    normalized_text: str
    personal_understanding: str
    notes: str
    meanings: list[MeaningRead]
    access_count: int
    library_added_at: datetime
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class ExpressionListResponse(ApiModel):
    items: list[ExpressionRead]
    next_cursor: str | None = None
    has_more: bool


class SearchResponse(ApiModel):
    status: Literal["saved", "not_saved"]
    normalized_query: str
    expression: ExpressionRead | None = None


class VisitCreate(ApiModel):
    visit_id: UUID


class VisitResponse(ApiModel):
    counted: bool
    access_count: int


class MeaningCreate(ApiModel):
    content: str = Field(min_length=1, max_length=2000)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Meaning cannot be blank")
        return clean


class MeaningUpdate(ApiModel):
    content: str = Field(min_length=1, max_length=2000)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Meaning cannot be blank")
        return clean


class ExampleCreate(ApiModel):
    content: str = Field(min_length=1, max_length=2000)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Example cannot be blank")
        return clean


class ExampleUpdate(ApiModel):
    content: str = Field(min_length=1, max_length=2000)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Example cannot be blank")
        return clean


class RelationLabelCreate(ApiModel):
    relation_type: RelationType
    custom_relation_name: str | None = Field(default=None, max_length=120)

    @field_validator("custom_relation_name")
    @classmethod
    def normalize_custom_name(cls, value: str | None) -> str | None:
        clean = value.strip() if value else None
        return clean or None


class RelationLabelUpdate(RelationLabelCreate):
    pass


class RelationLabelRead(ApiModel):
    id: UUID
    relation_type: RelationType
    custom_relation_name: str | None
    created_at: datetime
    updated_at: datetime


class RelationEndpointRead(ApiModel):
    expression_id: UUID | None
    text: str
    normalized_text: str
    saved: bool


class RelationCreate(RelationLabelCreate):
    source_expression_id: UUID
    target_text: str = Field(min_length=1, max_length=255)
    target_expression_id: UUID | None = None

    @field_validator("target_text")
    @classmethod
    def target_must_not_be_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Target expression cannot be blank")
        return clean


class RelationEdgeUpdate(ApiModel):
    source_expression_id: UUID
    target_text: str = Field(min_length=1, max_length=255)
    target_expression_id: UUID | None = None

    @field_validator("target_text")
    @classmethod
    def target_must_not_be_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Target expression cannot be blank")
        return clean


class RelationEdgeRead(ApiModel):
    id: UUID
    endpoint_a: RelationEndpointRead
    endpoint_b: RelationEndpointRead
    labels: list[RelationLabelRead]
    created_at: datetime
    updated_at: datetime


class RelationListResponse(ApiModel):
    items: list[RelationEdgeRead]


class GraphNode(ApiModel):
    id: UUID | None
    text: str
    normalized_text: str
    saved: bool
    access_count: int = 0
    library_added_at: datetime | None = None


class GraphEdge(ApiModel):
    id: UUID
    endpoint_a_normalized: str
    endpoint_b_normalized: str
    labels: list[RelationLabelRead]


class GraphResponse(ApiModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    next_cursor: str | None = None
    has_more: bool = False


class ErrorBody(ApiModel):
    code: str
    message: str
    details: dict | list | None = None
    request_id: str | None = None
