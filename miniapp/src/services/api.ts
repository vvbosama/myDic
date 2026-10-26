import Taro from '@tarojs/taro';
import type { ExpressionCard, ExpressionSort, RelationType } from '@/types';

declare const process: { env: Record<string, string | undefined> };

export const DATA_MODE = process.env.APP_DATA_MODE === 'mock' ? 'mock' : 'api';
export const API_BASE_URL = (process.env.APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');

export interface CursorResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SearchResponse {
  status: 'saved' | 'not_saved';
  normalizedQuery: string;
  expression: ExpressionCard | null;
}

export interface RelationLabelDto {
  id: string;
  relationType: RelationType;
  customRelationName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelationEndpointDto {
  expressionId?: string | null;
  text: string;
  normalizedText: string;
  saved: boolean;
}

export interface RelationEdgeDto {
  id: string;
  endpointA: RelationEndpointDto;
  endpointB: RelationEndpointDto;
  labels: RelationLabelDto[];
  createdAt: string;
  updatedAt: string;
}

export interface GraphNodeDto {
  id?: string | null;
  text: string;
  normalizedText: string;
  saved: boolean;
  accessCount: number;
  libraryAddedAt?: string | null;
}

export interface GraphEdgeDto {
  id: string;
  endpointANormalized: string;
  endpointBNormalized: string;
  labels: RelationLabelDto[];
}

export interface GraphResponseDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export class ApiError extends Error {
  statusCode: number;
  requestId?: string;

  constructor(message: string, statusCode: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

function queryString(params: Record<string, string | number | undefined>): string {
  const values = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return values.length ? `?${values.join('&')}` : '';
}

async function request<T>(path: string, options: { method?: string; data?: unknown } = {}): Promise<T> {
  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}${path}`,
      method: (options.method || 'GET') as any,
      data: options.data,
      header: { 'content-type': 'application/json' },
      timeout: 12000,
    });
    if (response.statusCode >= 200 && response.statusCode < 300) return response.data as T;
    const body = (response.data || {}) as { message?: string; requestId?: string };
    throw new ApiError(body.message || `请求失败（${response.statusCode}）`, response.statusCode, body.requestId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : '无法连接核心服务';
    throw new ApiError(message.includes('request:fail') ? '无法连接核心服务，请确认 FastAPI 已启动' : message, 0);
  }
}

export const coreApi = {
  listExpressions: (sort: ExpressionSort, cursor?: string | null, limit = 50) => request<CursorResponse<ExpressionCard>>(
    `/expressions${queryString({ sort, cursor: cursor || undefined, limit })}`
  ),
  getExpression: (id: string) => request<ExpressionCard>(`/expressions/${id}`),
  search: (text: string) => request<SearchResponse>(`/search${queryString({ q: text })}`),
  createExpression: (text: string) => request<ExpressionCard>('/expressions', { method: 'POST', data: { text } }),
  updateExpression: (card: ExpressionCard) => request<ExpressionCard>(`/expressions/${card.id}`, {
    method: 'PUT',
    data: {
      personalUnderstanding: card.personalUnderstanding,
      notes: card.notes,
      meanings: card.meanings.map((meaning, meaningIndex) => ({
        id: meaning.id.startsWith('meaning_') ? undefined : meaning.id,
        content: meaning.content,
        sortOrder: meaningIndex,
        examples: meaning.examples.map((example, exampleIndex) => ({
          id: example.id.startsWith('example_') ? undefined : example.id,
          content: example.content,
          sortOrder: exampleIndex,
        })),
      })),
    },
  }),
  deleteExpression: (id: string) => request<void>(`/expressions/${id}`, { method: 'DELETE' }),
  recordVisit: (id: string, visitId: string) => request<{ counted: boolean; accessCount: number }>(
    `/expressions/${id}/visits`, { method: 'POST', data: { visitId } }
  ),
  listRelations: (id: string) => request<{ items: RelationEdgeDto[] }>(`/expressions/${id}/relations`),
  createRelation: (input: { sourceExpressionId: string; targetText: string; targetExpressionId?: string; relationType: RelationType; customRelationName?: string }) => request<RelationEdgeDto>(
    '/relations', { method: 'POST', data: input }
  ),
  updateRelationEdge: (edgeId: string, input: { sourceExpressionId: string; targetText: string; targetExpressionId?: string }) => request<RelationEdgeDto>(
    `/relations/${edgeId}`, { method: 'PUT', data: input }
  ),
  updateRelationLabel: (labelId: string, input: { relationType: RelationType; customRelationName?: string }) => request<RelationEdgeDto>(
    `/relation-labels/${labelId}`, { method: 'PUT', data: input }
  ),
  deleteRelationLabel: (labelId: string) => request<void>(`/relation-labels/${labelId}`, { method: 'DELETE' }),
  deleteRelationEdge: (edgeId: string) => request<void>(`/relations/${edgeId}`, { method: 'DELETE' }),
  globalGraph: (cursor?: string | null, limit = 300) => request<GraphResponseDto>(
    `/graph${queryString({ cursor: cursor || undefined, limit })}`
  ),
  localGraph: (id: string) => request<GraphResponseDto>(`/graph/${id}`),
};
