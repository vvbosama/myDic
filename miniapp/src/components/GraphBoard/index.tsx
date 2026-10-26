import { useEffect, useMemo, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ExpressionCard, Relation } from '@/types';
import { makeGraphLayout, orphanNodeId, type GraphLayoutNode } from './layout';
import './index.scss';

type GraphNode = GraphLayoutNode;

interface GraphLayout {
  nodes: GraphNode[];
  width: number;
  height: number;
  dense: boolean;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId?: string;
  targetText?: string;
}

const MAX_GRAPH_EDGES = 600;
const normalizeText = (value: string) => value.trim().toLocaleLowerCase();

interface CardLookup {
  byId: Map<string, ExpressionCard>;
  byText: Map<string, ExpressionCard>;
}

function createCardLookup(cards: ExpressionCard[]): CardLookup {
  return {
    byId: new Map(cards.map((card) => [card.id, card])),
    byText: new Map(cards.map((card) => [normalizeText(card.text), card]))
  };
}

function resolveTargetId(relation: Relation, lookup: CardLookup) {
  if (relation.targetExpressionId && lookup.byId.has(relation.targetExpressionId)) return relation.targetExpressionId;
  const normalizedTarget = normalizeText(relation.targetText);
  return lookup.byText.get(normalizedTarget)?.id;
}

function pairKey(sourceId: string, targetId?: string, targetText?: string) {
  if (targetId) {
    const [first, second] = [sourceId, targetId].sort();
    return `pair:${first}:${second}`;
  }
  return `orphan:${sourceId}:${normalizeText(targetText || '')}`;
}

function makeNodes(cards: ExpressionCard[], relations: Relation[], centerId?: string, local = false): GraphLayout {
  return makeGraphLayout(cards, relations, centerId, local);
}
function makeEdges(cards: ExpressionCard[], relations: Relation[], nodes: GraphNode[], centerId?: string, local = false): GraphEdge[] {
  const lookup = createCardLookup(cards);
  const visibleCardIds = new Set(nodes.map((node) => node.cardId).filter(Boolean) as string[]);
  const visibleNodeByCardId = new Map(nodes.filter((node) => node.cardId).map((node) => [node.cardId as string, node]));
  const visibleOrphans = new Set(nodes.filter((node) => !node.cardId).map((node) => node.id));
  const unique = new Map<string, GraphEdge>();

  relations.forEach((relation) => {
    const targetId = resolveTargetId(relation, lookup);
    const key = pairKey(relation.sourceExpressionId, targetId, relation.targetText);
    if (targetId) {
      if (!visibleCardIds.has(relation.sourceExpressionId) || !visibleCardIds.has(targetId)) return;
      if (!unique.has(key)) {
        const [sourceId, canonicalTargetId] = [relation.sourceExpressionId, targetId].sort();
        unique.set(key, { id: key, sourceId, targetId: canonicalTargetId });
      }
      return;
    }

    if ((local && centerId && relation.sourceExpressionId !== centerId)
      || !visibleCardIds.has(relation.sourceExpressionId)) return;
    const orphanId = orphanNodeId(relation.targetText);
    if (!visibleOrphans.has(orphanId)) return;
    if (!unique.has(key)) {
      unique.set(key, {
        id: key,
        sourceId: relation.sourceExpressionId,
        targetText: relation.targetText.trim(),
      });
    }
  });

  // Keep the canonical endpoint order above, but make sure stale/deleted data
  // can never produce an invisible edge.
  const visibleEdges = [...unique.values()].filter((edge) => {
    const sourceVisible = visibleNodeByCardId.has(edge.sourceId);
    const targetVisible = edge.targetId
      ? visibleNodeByCardId.has(edge.targetId)
      : visibleOrphans.has(orphanNodeId(edge.targetText || ''));
    return sourceVisible && targetVisible;
  });
  // Keep the complete edge set for the current 200-card prototype. A cap only
  // applies once a future dataset grows beyond that overview scale.
  if (cards.length <= 250 || visibleEdges.length <= MAX_GRAPH_EDGES) return visibleEdges;
  // Preserve the selected node's neighbourhood first, then fill the rest
  // deterministically. This keeps interaction useful even when the backend
  // eventually returns tens of thousands of relations.
  if (centerId) {
    const focused = visibleEdges.filter((edge) => edge.sourceId === centerId || edge.targetId === centerId);
    const remainder = visibleEdges.filter((edge) => edge.sourceId !== centerId && edge.targetId !== centerId);
    return [...focused, ...remainder].slice(0, MAX_GRAPH_EDGES);
  }
  return visibleEdges.slice(0, MAX_GRAPH_EDGES);
}

interface GraphBoardProps {
  cards: ExpressionCard[];
  relations: Relation[];
  centerId?: string;
  local?: boolean;
  toolbarLabel?: string;
}

export function GraphBoard({ cards, relations, centerId, local = false, toolbarLabel }: GraphBoardProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const layout = useMemo(() => makeNodes(cards, relations, centerId, local), [cards, relations, centerId, local]);
  const nodes = layout.nodes;
  const edges = useMemo(() => makeEdges(cards, relations, nodes, centerId, local), [cards, relations, nodes, centerId, local]);
  const nodeById = useMemo(() => new Map(nodes.filter((node) => node.cardId).map((node) => [node.cardId as string, node])), [nodes]);
  const denseLayout = layout.dense;
  // Keep the initial view readable around the focused expression. The canvas is
  // intentionally not fit-to-screen: users can zoom out and pan as the graph
  // grows, while labels remain legible at the starting position.
  const standardScale = local ? 1 : nodes.length <= 5 ? .9 : nodes.length <= 24 ? .72 : nodes.length <= 80 ? .65 : .58;

  useEffect(() => {
    setScale(standardScale);
    setOffset({ x: 0, y: 0 });
  }, [centerId, local, standardScale]);

  const locate = (id?: string) => (id ? nodeById.get(id) : undefined);
  const locateEdgeTarget = (edge: GraphEdge) => edge.targetId
    ? locate(edge.targetId)
    : nodes.find((node) => node.id === orphanNodeId(edge.targetText || ''));
  const resetView = () => {
    setScale(standardScale);
    setOffset({ x: 0, y: 0 });
  };
  const toolbarSummary = toolbarLabel || `${local ? '局部网络' : 'Global Graph'} · ${nodes.length}${nodes.length < cards.length ? `/${cards.length}` : ''} 个节点`;

  return <View className={`graph-board ${denseLayout ? 'is-dense' : ''} ${fullScreen ? 'is-fullscreen' : ''}`}>
    <View className='graph-board__toolbar'>
      <Text>{toolbarSummary}</Text>
      <View className='graph-board__toolbar-actions'>
        <Text className='graph-board__control' onClick={resetView}>↺</Text>
        <Text className='graph-board__zoom' onClick={() => setScale((value) => Math.min(2.2, value + .1))}>＋</Text>
        <Text className='graph-board__zoom' onClick={() => setScale((value) => Math.max(.2, value - .1))}>−</Text>
        <Text className='graph-board__control' onClick={() => setFullScreen((value) => !value)}>{fullScreen ? '×' : '⛶'}</Text>
      </View>
    </View>
    <View
      className='graph-board__viewport'
      onTouchStart={(event) => {
        const touch = (event as any).touches?.[0];
        if (touch) setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
      }}
      onTouchMove={(event) => {
        if (!dragStart) return;
        const touch = (event as any).touches?.[0];
        if (touch) setOffset({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
      }}
      onTouchEnd={() => setDragStart(null)}
    >
      <View className='graph-board__canvas' style={{ width: `${layout.width}px`, height: `${layout.height}px`, transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
        {edges.map((edge, index) => {
          const source = locate(edge.sourceId);
          const target = locateEdgeTarget(edge);
          if (!source || !target) return null;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const angle = Math.atan2(dy, dx);
          const bend = index % 2 === 0 ? 1 : -1;
          return <View
            key={edge.id}
            className={`graph-board__edge ${denseLayout ? 'is-dense' : ''}`}
            style={{
              left: `${(source.x + target.x) / 2}px`,
              top: `${(source.y + target.y) / 2}px`,
              width: `${distance}px`,
              transform: `translate(-50%, -50%) rotate(${angle}rad) scaleY(${bend})`,
            }}
          />;
        })}
        {nodes.map((node) => <View
          key={node.id}
          className={`graph-board__node ${node.cardId === centerId ? 'is-center' : ''} ${node.cardId ? '' : 'is-orphan'} ${node.dense ? 'is-dense' : ''}`}
          style={{ left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px`, height: `${node.height}px` }}
          onClick={() => node.cardId ? Taro.navigateTo({ url: `/pages/expression/index?id=${node.cardId}` }) : Taro.navigateTo({ url: `/pages/dictionary/index?expression=${encodeURIComponent(node.text)}` })}
        ><Text>{node.text}</Text></View>)}
      </View>
    </View>
  </View>;
}
