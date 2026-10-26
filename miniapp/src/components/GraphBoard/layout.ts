import type { ExpressionCard, Relation } from '@/types';

/**
 * The graph is laid out in logical CSS pixels.  The viewport is only a camera:
 * the canvas itself is allowed to grow in both directions as more expressions
 * are added.  Keeping layout independent from the viewport means that a
 * phone-sized preview never forces labels to share a cell.
 */
export interface GraphLayoutNode {
  id: string;
  text: string;
  cardId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dense?: boolean;
}

export interface GraphLayout {
  nodes: GraphLayoutNode[];
  width: number;
  height: number;
  dense: boolean;
}

const LOCAL_NODE_LIMIT = 24;
const NODE_GAP_X = 32;
const NODE_GAP_Y = 24;
const CANVAS_PADDING = 140;
const HASH_CELL = 192;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MIN_CANVAS_WIDTH = 960;
const MIN_CANVAS_HEIGHT = 720;

const normalizeText = (value: string) => value.trim().toLocaleLowerCase();

export const orphanNodeId = (text: string) => `orphan:${normalizeText(text)}`;

/** Estimate the final outer width of a no-wrap node. */
export function estimateNodeWidth(text: string) {
  const visualLength = [...text].reduce((total, character) => {
    if (character === ' ') return total + 6;
    return total + (/[^\x00-\x7F]/.test(character) ? 19 : 10.5);
  }, 0);
  // The value includes the horizontal padding and border. GraphBoard uses
  // box-sizing:border-box, so this is also the width used by collision checks.
  return Math.max(112, Math.ceil(visualLength + 32));
}

export function estimateNodeHeight(dense = false) {
  return dense ? 50 : 54;
}

interface CardLookup {
  byId: Map<string, ExpressionCard>;
  byText: Map<string, ExpressionCard>;
}

function createLookup(cards: ExpressionCard[]): CardLookup {
  return {
    byId: new Map(cards.map((card) => [card.id, card])),
    byText: new Map(cards.map((card) => [normalizeText(card.text), card])),
  };
}

function resolveTargetId(relation: Relation, lookup: CardLookup) {
  if (relation.targetExpressionId && lookup.byId.has(relation.targetExpressionId)) {
    return relation.targetExpressionId;
  }
  return lookup.byText.get(normalizeText(relation.targetText))?.id;
}

function compareCards(a: ExpressionCard, b: ExpressionCard) {
  return a.text.localeCompare(b.text) || a.id.localeCompare(b.id);
}

function compareIds(a: string, b: string) {
  return a.localeCompare(b);
}

function stableHash(value: string) {
  // FNV-1a gives a stable, inexpensive phase for the golden-angle spiral.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: Rect, b: Rect) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + NODE_GAP_X
    && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + NODE_GAP_Y;
}

/**
 * A small spatial hash makes collision checks local instead of O(n) for every
 * spiral candidate. The actual rectangle test still runs after the hash query,
 * so the gap guarantee is exact rather than dependent on the cell size.
 */
class SpatialHash {
  private readonly cells = new Map<string, Set<string>>();
  private readonly rects = new Map<string, Rect>();

  private key(column: number, row: number) {
    return `${column}:${row}`;
  }

  private range(rect: Rect) {
    const halfWidth = rect.width / 2 + NODE_GAP_X;
    const halfHeight = rect.height / 2 + NODE_GAP_Y;
    return {
      minColumn: Math.floor((rect.x - halfWidth) / HASH_CELL),
      maxColumn: Math.floor((rect.x + halfWidth) / HASH_CELL),
      minRow: Math.floor((rect.y - halfHeight) / HASH_CELL),
      maxRow: Math.floor((rect.y + halfHeight) / HASH_CELL),
    };
  }

  hasCollision(rect: Rect) {
    const range = this.range(rect);
    const candidateIds = new Set<string>();
    for (let column = range.minColumn; column <= range.maxColumn; column += 1) {
      for (let row = range.minRow; row <= range.maxRow; row += 1) {
        this.cells.get(this.key(column, row))?.forEach((id) => candidateIds.add(id));
      }
    }
    for (const id of candidateIds) {
      const other = this.rects.get(id);
      if (other && intersects(rect, other)) return true;
    }
    return false;
  }

  add(id: string, rect: Rect) {
    this.rects.set(id, rect);
    const range = this.range(rect);
    for (let column = range.minColumn; column <= range.maxColumn; column += 1) {
      for (let row = range.minRow; row <= range.maxRow; row += 1) {
        const key = this.key(column, row);
        const bucket = this.cells.get(key) || new Set<string>();
        bucket.add(id);
        this.cells.set(key, bucket);
      }
    }
  }
}

interface LayoutItem {
  id: string;
  text: string;
  cardId?: string;
  width: number;
  height: number;
}

function selectLocalCards(cards: ExpressionCard[], adjacency: Map<string, Set<string>>, centerId?: string) {
  if (!centerId) return cards.slice(0, LOCAL_NODE_LIMIT);
  const directIds = new Set<string>([centerId, ...(adjacency.get(centerId) || [])]);
  if (directIds.size <= LOCAL_NODE_LIMIT) return cards.filter((card) => directIds.has(card.id));
  const selected = new Set<string>([centerId]);
  let frontier = [centerId];
  while (frontier.length > 0 && selected.size < LOCAL_NODE_LIMIT) {
    const candidates = [...new Set(frontier.flatMap((id) => [...(adjacency.get(id) || [])]))]
      .filter((id) => !selected.has(id))
      .sort((a, b) => (adjacency.get(b)?.size || 0) - (adjacency.get(a)?.size || 0) || compareIds(a, b));
    frontier = candidates.slice(0, LOCAL_NODE_LIMIT - selected.size);
    frontier.forEach((id) => selected.add(id));
  }
  return cards.filter((card) => selected.has(card.id));
}

function connectedComponents(ids: string[], adjacency: Map<string, Set<string>>, cardById: Map<string, ExpressionCard>) {
  const remaining = new Set(ids);
  const components: string[][] = [];
  const stableSeeds = [...ids].sort((a, b) => compareCards(cardById.get(a)!, cardById.get(b)!));
  let seedIndex = 0;
  while (remaining.size > 0) {
    while (seedIndex < stableSeeds.length && !remaining.has(stableSeeds[seedIndex])) seedIndex += 1;
    const seed = stableSeeds[seedIndex];
    const component: string[] = [];
    const queue = [seed];
    remaining.delete(seed);
    while (queue.length > 0) {
      const id = queue.shift()!;
      component.push(id);
      const neighbors = [...(adjacency.get(id) || [])]
        .filter((neighbor) => remaining.has(neighbor))
        .sort((a, b) => compareCards(cardById.get(a)!, cardById.get(b)!));
      neighbors.forEach((neighbor) => {
        remaining.delete(neighbor);
        queue.push(neighbor);
      });
    }
    components.push(component);
  }
  return components;
}

function findComponentRoot(component: string[], adjacency: Map<string, Set<string>>, cardById: Map<string, ExpressionCard>) {
  return [...component].sort((a, b) => {
    const degreeDiff = (adjacency.get(b)?.size || 0) - (adjacency.get(a)?.size || 0);
    return degreeDiff || compareCards(cardById.get(a)!, cardById.get(b)!);
  })[0];
}

function breadthFirstOrder(root: string, component: string[], adjacency: Map<string, Set<string>>, cardById: Map<string, ExpressionCard>) {
  const allowed = new Set(component);
  const visited = new Set<string>([root]);
  const order = [root];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = [...(adjacency.get(current) || [])]
      .filter((neighbor) => allowed.has(neighbor) && !visited.has(neighbor))
      .sort((a, b) => {
        const degreeDiff = (adjacency.get(b)?.size || 0) - (adjacency.get(a)?.size || 0);
        return degreeDiff || compareCards(cardById.get(a)!, cardById.get(b)!);
      });
    neighbors.forEach((neighbor) => {
      visited.add(neighbor);
      queue.push(neighbor);
      order.push(neighbor);
    });
  }
  // A component can only be disconnected if malformed relation data slipped
  // through; retain all ids deterministically rather than dropping a node.
  component.filter((id) => !visited.has(id)).sort(compareIds).forEach((id) => order.push(id));
  return order;
}

function findFreePosition(
  item: LayoutItem,
  preferred: { x: number; y: number },
  phase: number,
  nearestWidth = item.width,
  nearestHeight = item.height,
  occupied: SpatialHash,
) {
  const minimumRadius = Math.max(92, (item.width + nearestWidth) / 2 + NODE_GAP_X, (item.height + nearestHeight) / 2 + NODE_GAP_Y);
  // Try the preferred point first for an isolated root, then walk an unbounded
  // golden-angle spiral. The loop has no canvas boundary by design.
  for (let index = 0; ; index += 1) {
    const radius = index === 0 ? 0 : minimumRadius + 38 * Math.sqrt(index);
    const angle = phase + index * GOLDEN_ANGLE;
    const candidate: Rect = {
      x: preferred.x + Math.cos(angle) * radius,
      y: preferred.y + Math.sin(angle) * radius,
      width: item.width,
      height: item.height,
    };
    if (!occupied.hasCollision(candidate)) return { x: candidate.x, y: candidate.y };
  }
}

export function makeGraphLayout(
  cards: ExpressionCard[],
  relations: Relation[],
  centerId?: string,
  local = false,
): GraphLayout {
  const lookup = createLookup(cards);
  const cardById = lookup.byId;
  const adjacency = new Map<string, Set<string>>();
  cards.forEach((card) => adjacency.set(card.id, new Set<string>()));
  relations.forEach((relation) => {
    const targetId = resolveTargetId(relation, lookup);
    if (!targetId || targetId === relation.sourceExpressionId || !cardById.has(relation.sourceExpressionId)) return;
    adjacency.get(relation.sourceExpressionId)?.add(targetId);
    adjacency.get(targetId)?.add(relation.sourceExpressionId);
  });

  const visibleCards = local ? selectLocalCards(cards, adjacency, centerId) : cards;
  const visibleIds = new Set(visibleCards.map((card) => card.id));
  const items = new Map<string, LayoutItem>();
  const dense = visibleCards.length > 5;
  visibleCards.forEach((card) => items.set(card.id, {
    id: card.id,
    cardId: card.id,
    text: card.text,
    width: estimateNodeWidth(card.text),
    height: estimateNodeHeight(dense),
  }));

  // Dictionary expressions which have not been saved as Cards are still graph
  // nodes. One normalized expression maps to one node even if several saved
  // Cards point to it. Local graphs only retain the requested centre's links.
  const orphanSources = new Map<string, Set<string>>();
  relations.forEach((relation) => {
    if (!visibleIds.has(relation.sourceExpressionId)
      || resolveTargetId(relation, lookup)
      || !relation.targetText.trim()
      || (local && centerId && relation.sourceExpressionId !== centerId)) return;
    const id = orphanNodeId(relation.targetText);
    if (!items.has(id)) {
      const text = relation.targetText.trim();
      items.set(id, { id, text, width: estimateNodeWidth(text), height: estimateNodeHeight(dense) });
    }
    const sources = orphanSources.get(id) || new Set<string>();
    sources.add(relation.sourceExpressionId);
    orphanSources.set(id, sources);
  });

  if (items.size === 0) return { nodes: [], width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT, dense };

  const occupied = new SpatialHash();
  const coordinates = new Map<string, { x: number; y: number }>();
  const componentIds = visibleCards.map((card) => card.id);
  const components = connectedComponents(componentIds, adjacency, cardById);
  const requestedRoot = centerId && visibleIds.has(centerId) ? centerId : undefined;

  // Process the requested component first; disconnected components are then
  // seeded along a second golden-angle spiral around the existing graph.
  components.sort((a, b) => {
    const aHasCenter = requestedRoot && a.includes(requestedRoot) ? -1 : 0;
    const bHasCenter = requestedRoot && b.includes(requestedRoot) ? -1 : 0;
    return aHasCenter - bHasCenter || compareIds(a[0], b[0]);
  });

  components.forEach((component, componentIndex) => {
    const defaultRoot = findComponentRoot(component, adjacency, cardById);
    const root = requestedRoot && component.includes(requestedRoot) ? requestedRoot : defaultRoot;
    const order = breadthFirstOrder(root, component, adjacency, cardById);
    const componentPhase = stableHash(root) * Math.PI * 2 + componentIndex * GOLDEN_ANGLE;
    order.forEach((id, orderIndex) => {
      const item = items.get(id)!;
      const placedNeighbors = [...(adjacency.get(id) || [])]
        .filter((neighbor) => coordinates.has(neighbor));
      let preferred = { x: 0, y: 0 };
      if (placedNeighbors.length > 0) {
        preferred = placedNeighbors.reduce((sum, neighbor) => {
          const point = coordinates.get(neighbor)!;
          return { x: sum.x + point.x, y: sum.y + point.y };
        }, { x: 0, y: 0 });
        preferred.x /= placedNeighbors.length;
        preferred.y /= placedNeighbors.length;
      } else if (componentIndex > 0 || orderIndex > 0) {
        const componentRadius = 260 + Math.sqrt(componentIndex) * 180;
        preferred = {
          x: Math.cos(componentPhase) * componentRadius,
          y: Math.sin(componentPhase) * componentRadius,
        };
      }
      const nearest = placedNeighbors
        .map((neighbor) => items.get(neighbor))
        .filter(Boolean)
        .sort((a, b) => (b!.width + b!.height) - (a!.width + a!.height))[0];
      const point = findFreePosition(
        item,
        preferred,
        stableHash(id) * Math.PI * 2 + componentPhase,
        nearest?.width,
        nearest?.height,
        occupied,
      );
      coordinates.set(id, point);
      occupied.add(id, { ...point, width: item.width, height: item.height });
    });
  });

  // Place unresolved nodes near the average of their visible sources while
  // retaining the same collision and unbounded-extension guarantees.
  [...items.values()].filter((item) => !item.cardId).forEach((item, index) => {
    const sourceIds = [...(orphanSources.get(item.id) || [])].filter((id) => coordinates.has(id));
    const preferred = sourceIds.length > 0
      ? sourceIds.reduce((sum, id) => {
        const source = coordinates.get(id)!;
        return { x: sum.x + source.x / sourceIds.length, y: sum.y + source.y / sourceIds.length };
      }, { x: 0, y: 0 })
      : { x: 0, y: 0 };
    const nearestSource = sourceIds
      .map((id) => items.get(id))
      .filter(Boolean)
      .sort((a, b) => (b!.width + b!.height) - (a!.width + a!.height))[0];
    const point = findFreePosition(
      item,
      preferred,
      stableHash(item.id) * Math.PI * 2 + index * GOLDEN_ANGLE,
      nearestSource?.width,
      nearestSource?.height,
      occupied,
    );
    coordinates.set(item.id, point);
    occupied.add(item.id, { ...point, width: item.width, height: item.height });
  });

  const allRects = [...items.values()].map((item) => {
    const point = coordinates.get(item.id)!;
    return { item, left: point.x - item.width / 2, right: point.x + item.width / 2, top: point.y - item.height / 2, bottom: point.y + item.height / 2 };
  });
  const minLeft = Math.min(...allRects.map((rect) => rect.left));
  const maxRight = Math.max(...allRects.map((rect) => rect.right));
  const minTop = Math.min(...allRects.map((rect) => rect.top));
  const maxBottom = Math.max(...allRects.map((rect) => rect.bottom));
  // Keep the requested/high-degree root at the mathematical centre of the
  // canvas. The camera can then reset to the focused expression even when one
  // side of the organic spiral happens to be denser than the other.
  const horizontalExtent = Math.max(Math.abs(minLeft), Math.abs(maxRight));
  const verticalExtent = Math.max(Math.abs(minTop), Math.abs(maxBottom));
  const width = Math.max(MIN_CANVAS_WIDTH, Math.ceil((horizontalExtent + CANVAS_PADDING) * 2));
  const height = Math.max(MIN_CANVAS_HEIGHT, Math.ceil((verticalExtent + CANVAS_PADDING) * 2));
  const shiftX = width / 2;
  const shiftY = height / 2;
  const nodes = [...items.values()].map((item) => {
    const point = coordinates.get(item.id)!;
    return {
      id: item.id,
      text: item.text,
      cardId: item.cardId,
      x: point.x + shiftX,
      y: point.y + shiftY,
      width: item.width,
      height: item.height,
      dense,
    };
  });
  return { nodes, width, height, dense };
}
