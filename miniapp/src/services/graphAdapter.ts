import type { ExpressionCard, GraphSnapshot, Relation } from '@/types';
import type { GraphEdgeDto, GraphNodeDto, RelationEdgeDto } from './api';

function graphCard(node: GraphNodeDto): ExpressionCard | null {
  if (!node.id || !node.saved) return null;
  const timestamp = node.libraryAddedAt || new Date(0).toISOString();
  return {
    id: node.id,
    text: node.text,
    normalizedText: node.normalizedText,
    personalUnderstanding: '',
    notes: '',
    meanings: [],
    accessCount: node.accessCount,
    libraryAddedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function flattenRelationEdge(edge: RelationEdgeDto, preferredSourceId?: string): Relation[] {
  let source = edge.endpointA;
  let target = edge.endpointB;
  if (preferredSourceId && edge.endpointB.expressionId === preferredSourceId) {
    source = edge.endpointB;
    target = edge.endpointA;
  } else if (!source.expressionId && target.expressionId) {
    source = edge.endpointB;
    target = edge.endpointA;
  }
  if (!source.expressionId) return [];
  return edge.labels.map((label) => ({
    id: label.id,
    edgeId: edge.id,
    pairId: edge.id,
    sourceExpressionId: source.expressionId as string,
    targetText: target.text,
    targetExpressionId: target.expressionId || undefined,
    relationType: label.relationType,
    customRelationName: label.customRelationName || undefined,
    symmetric: true,
    createdAt: label.createdAt,
  }));
}

export function graphSnapshot(
  nodes: GraphNodeDto[],
  edges: GraphEdgeDto[],
  preferredSourceId?: string,
): GraphSnapshot {
  const nodeByNormalized = new Map(nodes.map((node) => [node.normalizedText, node]));
  const cards = nodes.map(graphCard).filter(Boolean) as ExpressionCard[];
  const relations = edges.flatMap((edge) => {
    const endpointA = nodeByNormalized.get(edge.endpointANormalized);
    const endpointB = nodeByNormalized.get(edge.endpointBNormalized);
    if (!endpointA || !endpointB) return [];
    return flattenRelationEdge({
      id: edge.id,
      endpointA: {
        expressionId: endpointA.id,
        text: endpointA.text,
        normalizedText: endpointA.normalizedText,
        saved: endpointA.saved,
      },
      endpointB: {
        expressionId: endpointB.id,
        text: endpointB.text,
        normalizedText: endpointB.normalizedText,
        saved: endpointB.saved,
      },
      labels: edge.labels,
      createdAt: edge.labels[0]?.createdAt || new Date(0).toISOString(),
      updatedAt: edge.labels[0]?.updatedAt || new Date(0).toISOString(),
    }, preferredSourceId);
  });
  return { cards, relations };
}
