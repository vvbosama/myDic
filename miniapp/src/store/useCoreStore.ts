import Taro from '@tarojs/taro';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { seedCards, seedRelations } from '@/data/mockData';
import { coreApi, DATA_MODE, type GraphEdgeDto, type GraphNodeDto } from '@/services/api';
import { flattenRelationEdge, graphSnapshot } from '@/services/graphAdapter';
import type { ExpressionCard, ExpressionSort, GraphSnapshot, Meaning, Relation, RelationType } from '@/types';
import { createId, createUuid, normalizeExpression } from '@/utils/text';

interface AppState {
  mode: 'api' | 'mock';
  initialized: boolean;
  loading: boolean;
  error: string | null;
  cards: ExpressionCard[];
  relations: Relation[];
  listCursor: string | null;
  listHasMore: boolean;
  listSort: ExpressionSort;
  graphCards: ExpressionCard[];
  graphRelations: Relation[];
  graphCursor: string | null;
  graphHasMore: boolean;
  graphApiNodes: GraphNodeDto[];
  graphApiEdges: GraphEdgeDto[];
  initialize: (force?: boolean) => Promise<void>;
  clearError: () => void;
  refreshExpressions: (sort?: ExpressionSort) => Promise<void>;
  loadMoreExpressions: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  loadMoreGraph: () => Promise<void>;
  loadCard: (id: string) => Promise<ExpressionCard | undefined>;
  searchCard: (text: string) => Promise<ExpressionCard | undefined>;
  createCard: (text: string) => Promise<ExpressionCard>;
  deleteCard: (id: string) => Promise<void>;
  updateCard: (id: string, patch: Partial<Pick<ExpressionCard, 'personalUnderstanding' | 'notes' | 'meanings'>>) => Promise<ExpressionCard | undefined>;
  updateMeanings: (id: string, meanings: Meaning[]) => Promise<void>;
  incrementCardAccess: (id: string) => Promise<void>;
  fetchRelations: (id: string) => Promise<Relation[]>;
  loadLocalGraph: (id: string) => Promise<GraphSnapshot>;
  createRelation: (input: { sourceId: string; targetText: string; targetId?: string; relationType: RelationType; customRelationName?: string }) => Promise<void>;
  updateRelation: (id: string, patch: Partial<Pick<Relation, 'targetText' | 'targetExpressionId' | 'relationType' | 'customRelationName'>>, sourceId?: string) => Promise<void>;
  deleteRelation: (id: string) => Promise<void>;
  findCard: (text: string) => ExpressionCard | undefined;
  getCard: (id: string) => ExpressionCard | undefined;
  resetMockData: () => void;
}

const now = () => new Date().toISOString();

function hydrateCard(card: ExpressionCard): ExpressionCard {
  const parsedCount = Number(card.accessCount);
  return {
    ...card,
    libraryAddedAt: card.libraryAddedAt || card.createdAt,
    accessCount: Number.isFinite(parsedCount) && parsedCount >= 0 ? Math.floor(parsedCount) : 0,
  };
}

const hydratedSeedCards = seedCards.map(hydrateCard);

function edgeKey(relation: Pick<Relation, 'sourceExpressionId' | 'targetExpressionId' | 'targetText'>): string {
  if (relation.targetExpressionId) {
    const endpoints = [relation.sourceExpressionId, relation.targetExpressionId].sort();
    return `cards:${endpoints[0]}:${endpoints[1]}`;
  }
  return `text:${relation.sourceExpressionId}:${normalizeExpression(relation.targetText)}`;
}

function canonicalizeRelation(relation: Relation, cards: ExpressionCard[]): Relation {
  if (!relation.targetExpressionId || relation.sourceExpressionId === relation.targetExpressionId) {
    return { ...relation, symmetric: true, pairId: relation.pairId || edgeKey(relation) };
  }
  if (relation.sourceExpressionId.localeCompare(relation.targetExpressionId) <= 0) {
    return { ...relation, symmetric: true, pairId: relation.pairId || edgeKey(relation) };
  }
  const sourceCard = cards.find((card) => card.id === relation.sourceExpressionId);
  return {
    ...relation,
    symmetric: true,
    pairId: relation.pairId || edgeKey(relation),
    sourceExpressionId: relation.targetExpressionId,
    targetExpressionId: relation.sourceExpressionId,
    targetText: sourceCard?.text || relation.targetText,
  };
}

function normalizeRelations(relations: Relation[], cards: ExpressionCard[]): Relation[] {
  const byLabel = new Map<string, Relation>();
  relations.forEach((rawRelation) => {
    if (!rawRelation?.sourceExpressionId || !rawRelation.targetText) return;
    const resolvedTarget = rawRelation.targetExpressionId
      ? undefined
      : cards.find((card) => !card.deletedAt && card.normalizedText === normalizeExpression(rawRelation.targetText));
    const relation = canonicalizeRelation(
      resolvedTarget ? { ...rawRelation, targetExpressionId: resolvedTarget.id } : rawRelation,
      cards,
    );
    const labelIdentity = `${edgeKey(relation)}:${relation.relationType}:${relation.customRelationName || ''}`;
    byLabel.set(labelIdentity, relation);
  });
  return [...byLabel.values()];
}

function upsertCards(cards: ExpressionCard[], incoming: ExpressionCard[]): ExpressionCard[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  incoming.forEach((card) => byId.set(card.id, { ...byId.get(card.id), ...hydrateCard(card) }));
  return [...byId.values()];
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function uniqueGraphNodes(items: GraphNodeDto[]): GraphNodeDto[] {
  const byNormalized = new Map<string, GraphNodeDto>();
  items.forEach((node) => {
    const previous = byNormalized.get(node.normalizedText);
    // If a dictionary-only expression is saved while graph pages are being
    // merged, prefer its new Card-backed representation.
    if (!previous || node.saved || !previous.saved) byNormalized.set(node.normalizedText, node);
  });
  return [...byNormalized.values()];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

const storage = createJSONStorage<AppState>(() => ({
  getItem: (name) => {
    try { return Taro.getStorageSync(name) || null; } catch { return null; }
  },
  setItem: (name, value) => { try { Taro.setStorageSync(name, value); } catch { /* optional in web preview */ } },
  removeItem: (name) => { try { Taro.removeStorageSync(name); } catch { /* noop */ } },
}));

const initialCards = DATA_MODE === 'mock' ? hydratedSeedCards : [];
const initialRelations = DATA_MODE === 'mock' ? normalizeRelations(seedRelations, hydratedSeedCards) : [];

export const useAppStore = create<AppState>()(persist((set, get) => ({
  mode: DATA_MODE,
  initialized: false,
  loading: false,
  error: null,
  cards: initialCards,
  relations: initialRelations,
  listCursor: null,
  listHasMore: false,
  listSort: 'created_desc',
  graphCards: initialCards,
  graphRelations: initialRelations,
  graphCursor: null,
  graphHasMore: false,
  graphApiNodes: [],
  graphApiEdges: [],

  clearError: () => set({ error: null }),

  initialize: async (force = false) => {
    if (!force && (get().initialized || get().loading)) return;
    if (DATA_MODE === 'mock') {
      const cards = get().cards.length ? get().cards : hydratedSeedCards;
      const relations = get().relations.length ? get().relations : initialRelations;
      set({ initialized: true, cards, relations, graphCards: cards, graphRelations: relations });
      return;
    }
    set({ loading: true, error: null });
    try {
      const [list, graph] = await Promise.all([
        coreApi.listExpressions('created_desc', null, 50),
        coreApi.globalGraph(null, 300),
      ]);
      const snapshot = graphSnapshot(graph.nodes, graph.edges);
      set({
        initialized: true,
        loading: false,
        cards: list.items.map(hydrateCard),
        listCursor: list.nextCursor,
        listHasMore: list.hasMore,
        listSort: 'created_desc',
        graphCards: snapshot.cards,
        graphRelations: snapshot.relations,
        graphCursor: graph.nextCursor || null,
        graphHasMore: graph.hasMore,
        graphApiNodes: graph.nodes,
        graphApiEdges: graph.edges,
      });
    } catch (error) {
      set({ initialized: false, loading: false, error: errorMessage(error) });
    }
  },

  refreshExpressions: async (sort = 'created_desc') => {
    if (DATA_MODE === 'mock') {
      const sorted = [...get().cards].sort((a, b) => sort === 'access_asc'
        ? (a.accessCount || 0) - (b.accessCount || 0)
        : sort === 'access_desc'
          ? (b.accessCount || 0) - (a.accessCount || 0)
          : (b.libraryAddedAt || b.createdAt).localeCompare(a.libraryAddedAt || a.createdAt));
      set({ cards: sorted, listSort: sort, listCursor: null, listHasMore: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const result = await coreApi.listExpressions(sort, null, 50);
      set({ cards: result.items.map(hydrateCard), listCursor: result.nextCursor, listHasMore: result.hasMore, listSort: sort, loading: false });
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
      throw error;
    }
  },

  loadMoreExpressions: async () => {
    const { listHasMore, listCursor, listSort } = get();
    if (DATA_MODE === 'mock' || !listHasMore || !listCursor || get().loading) return;
    set({ loading: true, error: null });
    try {
      const result = await coreApi.listExpressions(listSort, listCursor, 50);
      set((state) => ({ cards: upsertCards(state.cards, result.items), listCursor: result.nextCursor, listHasMore: result.hasMore, loading: false }));
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
      throw error;
    }
  },

  refreshGraph: async () => {
    if (DATA_MODE === 'mock') {
      set({ graphCards: get().cards.filter((card) => !card.deletedAt), graphRelations: get().relations, graphHasMore: false });
      return;
    }
    try {
      const graph = await coreApi.globalGraph(null, 300);
      const snapshot = graphSnapshot(graph.nodes, graph.edges);
      set({ graphCards: snapshot.cards, graphRelations: snapshot.relations, graphCursor: graph.nextCursor || null, graphHasMore: graph.hasMore, graphApiNodes: graph.nodes, graphApiEdges: graph.edges });
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },

  loadMoreGraph: async () => {
    const { graphCursor, graphHasMore, graphApiNodes, graphApiEdges } = get();
    if (DATA_MODE === 'mock' || !graphHasMore || !graphCursor || get().loading) return;
    set({ loading: true, error: null });
    try {
      const graph = await coreApi.globalGraph(graphCursor, 300);
      const nodes = uniqueGraphNodes([...graphApiNodes, ...graph.nodes]);
      const edges = uniqueById([...graphApiEdges, ...graph.edges]);
      const snapshot = graphSnapshot(nodes, edges);
      set({ graphCards: snapshot.cards, graphRelations: snapshot.relations, graphCursor: graph.nextCursor || null, graphHasMore: graph.hasMore, graphApiNodes: nodes, graphApiEdges: edges, loading: false });
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
      throw error;
    }
  },

  loadCard: async (id) => {
    const existing = get().getCard(id);
    if (DATA_MODE === 'mock') return existing;
    try {
      const card = hydrateCard(await coreApi.getExpression(id));
      set((state) => ({ cards: upsertCards(state.cards, [card]) }));
      return card;
    } catch (error) {
      set({ error: errorMessage(error) });
      return undefined;
    }
  },

  searchCard: async (text) => {
    if (DATA_MODE === 'mock') return get().findCard(text);
    try {
      const result = await coreApi.search(text);
      if (!result.expression) return undefined;
      const card = hydrateCard(result.expression);
      set((state) => ({ cards: upsertCards(state.cards, [card]) }));
      return card;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },

  createCard: async (text) => {
    const cleanText = text.trim();
    if (DATA_MODE === 'api') {
      const card = hydrateCard(await coreApi.createExpression(cleanText));
      set((state) => ({ cards: upsertCards(state.cards, [card]) }));
      await get().refreshGraph();
      return card;
    }
    const existing = get().findCard(cleanText);
    if (existing) return existing;
    const timestamp = now();
    const card: ExpressionCard = { id: createId('card'), text: cleanText, normalizedText: normalizeExpression(cleanText), personalUnderstanding: '', notes: '', meanings: [], createdAt: timestamp, updatedAt: timestamp, libraryAddedAt: timestamp, accessCount: 0 };
    set((state) => {
      const cards = [card, ...state.cards];
      const relations = state.relations.map((relation) => !relation.targetExpressionId && normalizeExpression(relation.targetText) === card.normalizedText ? { ...relation, targetExpressionId: card.id } : relation);
      const normalizedRelations = normalizeRelations(relations, cards);
      return { cards, relations: normalizedRelations, graphCards: cards, graphRelations: normalizedRelations };
    });
    return card;
  },

  updateCard: async (id, patch) => {
    const current = get().getCard(id);
    if (!current) return undefined;
    if (DATA_MODE === 'api') {
      try {
        const card = hydrateCard(await coreApi.updateExpression({ ...current, ...patch }));
        set((state) => ({ cards: upsertCards(state.cards, [card]) }));
        return card;
      } catch (error) {
        set({ error: errorMessage(error) });
        throw error;
      }
    }
    const card = { ...current, ...patch, updatedAt: now() };
    set((state) => ({ cards: state.cards.map((item) => item.id === id ? card : item), graphCards: state.graphCards.map((item) => item.id === id ? card : item) }));
    return card;
  },

  updateMeanings: async (id, meanings) => { await get().updateCard(id, { meanings }); },

  incrementCardAccess: async (id) => {
    if (DATA_MODE === 'api') {
      try {
        const result = await coreApi.recordVisit(id, createUuid());
        set((state) => ({
          cards: state.cards.map((card) => card.id === id ? { ...card, accessCount: result.accessCount } : card),
          graphCards: state.graphCards.map((card) => card.id === id ? { ...card, accessCount: result.accessCount } : card),
        }));
      } catch (error) { set({ error: errorMessage(error) }); }
      return;
    }
    set((state) => ({ cards: state.cards.map((card) => card.id === id && !card.deletedAt ? { ...card, accessCount: (card.accessCount || 0) + 1 } : card) }));
  },

  fetchRelations: async (id) => {
    if (DATA_MODE === 'mock') return get().relations.filter((relation) => relation.sourceExpressionId === id || relation.targetExpressionId === id);
    try {
      const result = await coreApi.listRelations(id);
      const relations = result.items.flatMap((edge) => flattenRelationEdge(edge, id));
      set((state) => ({ relations: [...state.relations.filter((relation) => relation.sourceExpressionId !== id && relation.targetExpressionId !== id), ...relations] }));
      return relations;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },

  loadLocalGraph: async (id) => {
    if (DATA_MODE === 'mock') return { cards: get().cards.filter((card) => !card.deletedAt), relations: get().relations };
    const graph = await coreApi.localGraph(id);
    return graphSnapshot(graph.nodes, graph.edges, id);
  },

  createRelation: async ({ sourceId, targetText, targetId, relationType, customRelationName }) => {
    if (DATA_MODE === 'api') {
      const edge = await coreApi.createRelation({ sourceExpressionId: sourceId, targetText: targetText.trim(), targetExpressionId: targetId, relationType, customRelationName });
      const relations = flattenRelationEdge(edge, sourceId);
      set((state) => ({ relations: [...state.relations.filter((relation) => relation.edgeId !== edge.id), ...relations] }));
      await get().refreshGraph();
      return;
    }
    const cleanTarget = targetText.trim();
    if (!cleanTarget) return;
    const targetCard = targetId ? get().getCard(targetId) : get().findCard(cleanTarget);
    const sourceCard = get().getCard(sourceId);
    if (targetCard?.id === sourceId || sourceCard?.normalizedText === normalizeExpression(cleanTarget)) return;
    const relation: Relation = { id: createId('relation'), sourceExpressionId: sourceId, targetText: cleanTarget, targetExpressionId: targetCard?.id, relationType, customRelationName, symmetric: true, createdAt: now() };
    set((state) => { const relations = normalizeRelations([...state.relations, relation], state.cards); return { relations, graphRelations: relations }; });
  },

  updateRelation: async (id, patch, sourceId) => {
    const current = get().relations.find((relation) => relation.id === id);
    if (!current) return;
    const fixedSourceId = sourceId || current.sourceExpressionId;
    const targetText = (patch.targetText || current.targetText).trim();
    const targetId = patch.targetExpressionId || get().findCard(targetText)?.id;
    if (DATA_MODE === 'api' && current.edgeId) {
      await coreApi.updateRelationEdge(current.edgeId, { sourceExpressionId: fixedSourceId, targetText, targetExpressionId: targetId });
      const edge = await coreApi.updateRelationLabel(current.id, {
        relationType: patch.relationType || current.relationType,
        customRelationName: patch.relationType === 'Custom' || (!patch.relationType && current.relationType === 'Custom') ? patch.customRelationName || current.customRelationName : undefined,
      });
      const relations = flattenRelationEdge(edge, fixedSourceId);
      set((state) => ({ relations: [...state.relations.filter((relation) => relation.edgeId !== edge.id), ...relations] }));
      await get().refreshGraph();
      return;
    }
    const updated = canonicalizeRelation({ ...current, ...patch, sourceExpressionId: fixedSourceId, targetText, targetExpressionId: targetId, symmetric: true }, get().cards);
    set((state) => { const relations = normalizeRelations([...state.relations.filter((relation) => relation.id !== id), updated], state.cards); return { relations, graphRelations: relations }; });
  },

  deleteRelation: async (id) => {
    const current = get().relations.find((relation) => relation.id === id);
    if (!current) return;
    if (DATA_MODE === 'api') {
      await coreApi.deleteRelationLabel(id);
      set((state) => ({ relations: state.relations.filter((relation) => relation.id !== id) }));
      await get().refreshGraph();
      return;
    }
    set((state) => { const relations = state.relations.filter((relation) => relation.id !== id); return { relations, graphRelations: relations }; });
  },

  deleteCard: async (id) => {
    if (DATA_MODE === 'api') {
      await coreApi.deleteExpression(id);
      set((state) => ({ cards: state.cards.filter((card) => card.id !== id), relations: state.relations.filter((relation) => relation.sourceExpressionId !== id && relation.targetExpressionId !== id) }));
      await get().refreshGraph();
      return;
    }
    set((state) => {
      const cards = state.cards.map((card) => card.id === id ? { ...card, deletedAt: now(), personalUnderstanding: '', notes: '', meanings: [], updatedAt: now() } : card);
      const relations = state.relations.map((relation) => relation.targetExpressionId === id ? { ...relation, targetExpressionId: undefined } : relation);
      return { cards, relations, graphCards: cards.filter((card) => !card.deletedAt), graphRelations: relations };
    });
  },

  findCard: (text) => get().cards.find((card) => !card.deletedAt && card.normalizedText === normalizeExpression(text)),
  getCard: (id) => get().cards.find((card) => !card.deletedAt && card.id === id),
  resetMockData: () => {
    if (DATA_MODE !== 'mock') return;
    set({ cards: hydratedSeedCards, relations: initialRelations, graphCards: hydratedSeedCards, graphRelations: initialRelations });
  },
}), {
  name: 'expression-network-phase2-v1',
  storage,
  partialize: (state) => DATA_MODE === 'mock' ? ({ cards: state.cards, relations: state.relations } as AppState) : ({} as AppState),
  merge: (persistedState, currentState) => {
    if (DATA_MODE === 'api') return currentState;
    const persisted = (persistedState || {}) as Partial<AppState>;
    const cards = (persisted.cards || currentState.cards).map(hydrateCard);
    const relations = normalizeRelations(persisted.relations || currentState.relations, cards);
    return { ...currentState, ...persisted, cards, relations, graphCards: cards, graphRelations: relations };
  },
}));
