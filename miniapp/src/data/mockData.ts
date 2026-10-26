import type { ExpressionCard, Relation } from '@/types';

const now = '2026-09-29T08:00:00.000Z';

const baseCards: ExpressionCard[] = [
  {
    id: 'card-significant',
    text: 'significant',
    normalizedText: 'significant',
    personalUnderstanding: '表示某件事情达到值得注意的程度；比 important 更正式。',
    notes: '学术写作中很常见，尤其注意 significant increase。',
    createdAt: now,
    updatedAt: now,
    meanings: [
      {
        id: 'meaning-significant-1',
        content: '重要的；有意义的',
        sortOrder: 0,
        examples: [{ id: 'example-significant-1', content: 'The decision had a significant impact on the project.', sortOrder: 0 }]
      },
      {
        id: 'meaning-significant-2',
        content: '数量或程度显著的',
        sortOrder: 1,
        examples: [{ id: 'example-significant-2', content: 'There has been a significant increase in prices.', sortOrder: 0 }]
      }
    ]
  },
  {
    id: 'card-mitigate',
    text: 'mitigate',
    normalizedText: 'mitigate',
    personalUnderstanding: '使已经存在的负面问题程度降低，而不是完全解决。',
    notes: '比 reduce 更正式，常见搭配是 mitigate the risk。',
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z',
    meanings: [{ id: 'meaning-mitigate-1', content: '减轻；缓和', sortOrder: 0, examples: [{ id: 'example-mitigate-1', content: 'These measures can mitigate the risk.', sortOrder: 0 }] }]
  },
  {
    id: 'card-substantial',
    text: 'substantial',
    normalizedText: 'substantial',
    personalUnderstanding: '达到一个不可忽视、相当可观的程度。',
    notes: '',
    createdAt: '2026-09-27T08:00:00.000Z',
    updatedAt: '2026-09-27T08:00:00.000Z',
    meanings: [{ id: 'meaning-substantial-1', content: '大量的；可观的', sortOrder: 0, examples: [] }]
  },
  {
    id: 'card-important', text: 'important', normalizedText: 'important',
    personalUnderstanding: '重要的，值得优先关注的。', notes: '可以和 significant 比较语气和搭配。',
    createdAt: '2026-09-26T08:00:00.000Z', updatedAt: '2026-09-26T08:00:00.000Z',
    meanings: [{ id: 'meaning-important-1', content: '重要的', sortOrder: 0, examples: [{ id: 'example-important-1', content: 'It is important to understand the context.', sortOrder: 0 }] }]
  },
  {
    id: 'card-profound', text: 'profound', normalizedText: 'profound',
    personalUnderstanding: '影响深远、程度很深的。', notes: '比 deep 更正式。',
    createdAt: '2026-09-25T08:00:00.000Z', updatedAt: '2026-09-25T08:00:00.000Z',
    meanings: [{ id: 'meaning-profound-1', content: '深刻的；深远的', sortOrder: 0, examples: [] }]
  },
  {
    id: 'card-alleviate', text: 'alleviate', normalizedText: 'alleviate',
    personalUnderstanding: '减轻痛苦、压力或问题的严重程度。', notes: '常和 pressure、pain、suffering 搭配。',
    createdAt: '2026-09-24T08:00:00.000Z', updatedAt: '2026-09-24T08:00:00.000Z',
    meanings: [{ id: 'meaning-alleviate-1', content: '减轻；缓解', sortOrder: 0, examples: [] }]
  },
  {
    id: 'card-reduce', text: 'reduce', normalizedText: 'reduce',
    personalUnderstanding: '使数量、程度或规模变小。', notes: '比 mitigate 更通用。',
    createdAt: '2026-09-23T08:00:00.000Z', updatedAt: '2026-09-23T08:00:00.000Z',
    meanings: [{ id: 'meaning-reduce-1', content: '减少；降低', sortOrder: 0, examples: [] }]
  },
  {
    id: 'card-prevent', text: 'prevent', normalizedText: 'prevent',
    personalUnderstanding: '提前阻止某件事发生。', notes: '和 mitigate 的区别是 prevent 更强调不让问题发生。',
    createdAt: '2026-09-22T08:00:00.000Z', updatedAt: '2026-09-22T08:00:00.000Z',
    meanings: [{ id: 'meaning-prevent-1', content: '阻止；预防', sortOrder: 0, examples: [] }]
  },
  {
    id: 'card-contribute', text: 'contribute to', normalizedText: 'contribute to',
    personalUnderstanding: '对某个结果、目标或问题起到一部分作用。', notes: '写作中可以替换 help lead to。',
    createdAt: '2026-09-21T08:00:00.000Z', updatedAt: '2026-09-21T08:00:00.000Z',
    meanings: [{ id: 'meaning-contribute-1', content: '促成；有助于', sortOrder: 0, examples: [{ id: 'example-contribute-1', content: 'Small changes can contribute to a better outcome.', sortOrder: 0 }] }]
  },
  {
    id: 'card-go-a-long-way', text: 'go a long way toward', normalizedText: 'go a long way toward',
    personalUnderstanding: '对实现目标有很大帮助，但不一定完全解决问题。', notes: '后面常接动名词。',
    createdAt: '2026-09-20T08:00:00.000Z', updatedAt: '2026-09-20T08:00:00.000Z',
    meanings: [{ id: 'meaning-go-a-long-way-1', content: '大大有助于', sortOrder: 0, examples: [] }]
  }
];

// Keep a realistic-looking larger fixture available for graph and list
// performance checks without hand-maintaining hundreds of nearly identical
// objects. The first ten cards above remain the curated demo vocabulary; the
// generated cards are deliberately deterministic so screenshots and tests do
// not change between launches.
const generatedRoots = [
  'analyze', 'anticipate', 'clarify', 'collaborate', 'compose', 'convey',
  'demonstrate', 'derive', 'differentiate', 'emphasize', 'enhance', 'establish',
  'evaluate', 'facilitate', 'formulate', 'illustrate', 'implement', 'indicate',
  'interpret', 'maintain', 'obtain', 'prioritize', 'promote', 'reinforce',
  'relevant', 'resolve', 'retain', 'specify', 'strengthen', 'transform'
];

const generatedCards: ExpressionCard[] = Array.from({ length: 190 }, (_, index) => {
  const serial = String(index + 1).padStart(3, '0');
  const text = `${generatedRoots[index % generatedRoots.length]} ${serial}`;
  const timestamp = new Date(Date.parse(now) - (index + 10) * 86400000).toISOString();
  return {
    id: `card-mock-${serial}`,
    text,
    normalizedText: text.toLocaleLowerCase(),
    personalUnderstanding: `Mock Card ${serial}，用于测试大规模表达图谱。`,
    notes: '这是用于 Phase 1 性能验证的 Mock 数据。',
    createdAt: timestamp,
    updatedAt: timestamp,
    meanings: [{
      id: `meaning-mock-${serial}`,
      content: `与 ${generatedRoots[index % generatedRoots.length]} 相关的测试表达`,
      sortOrder: 0,
      examples: []
    }]
  };
});

export const seedCards: ExpressionCard[] = [...baseCards, ...generatedCards];

const baseRelations: Relation[] = [
  { id: 'relation-significant-substantial', pairId: 'pair-significant-substantial', sourceExpressionId: 'card-significant', targetText: 'substantial', targetExpressionId: 'card-substantial', relationType: 'Synonym', symmetric: true, createdAt: now },
  { id: 'relation-significant-important', pairId: 'pair-significant-important', sourceExpressionId: 'card-significant', targetText: 'important', targetExpressionId: 'card-important', relationType: 'Contrast', symmetric: true, createdAt: now },
  { id: 'relation-significant-profound', pairId: 'pair-significant-profound', sourceExpressionId: 'card-significant', targetText: 'profound', targetExpressionId: 'card-profound', relationType: 'Related', symmetric: true, createdAt: now },
  { id: 'relation-significant-impact', pairId: 'pair-significant-impact', sourceExpressionId: 'card-significant', targetText: 'significant impact', relationType: 'Extension', symmetric: true, createdAt: now },
  { id: 'relation-mitigate-alleviate', pairId: 'pair-mitigate-alleviate', sourceExpressionId: 'card-mitigate', targetText: 'alleviate', targetExpressionId: 'card-alleviate', relationType: 'Related', symmetric: true, createdAt: now },
  { id: 'relation-mitigate-reduce', pairId: 'pair-mitigate-reduce', sourceExpressionId: 'card-mitigate', targetText: 'reduce', targetExpressionId: 'card-reduce', relationType: 'Contrast', symmetric: true, createdAt: now },
  { id: 'relation-mitigate-prevent', pairId: 'pair-mitigate-prevent', sourceExpressionId: 'card-mitigate', targetText: 'prevent', targetExpressionId: 'card-prevent', relationType: 'Related', symmetric: true, createdAt: now },
  { id: 'relation-mitigate-risk', pairId: 'pair-mitigate-risk', sourceExpressionId: 'card-mitigate', targetText: 'mitigate the risk', relationType: 'Extension', symmetric: true, createdAt: now },
  { id: 'relation-contribute-go-long-way', pairId: 'pair-contribute-go-long-way', sourceExpressionId: 'card-contribute', targetText: 'go a long way toward', targetExpressionId: 'card-go-a-long-way', relationType: 'Related', symmetric: true, createdAt: now }
];

// A sparse chain plus periodic links to the curated vocabulary gives the
// graph meaningful connected components while keeping the fixture cheap to
// create. All records are single undirected edges (symmetric=true).
const generatedRelations: Relation[] = generatedCards.flatMap((card, index) => {
  const previous = index > 0 ? generatedCards[index - 1] : baseCards[0];
  const relationType: Relation['relationType'] = index % 3 === 0 ? 'Related' : index % 3 === 1 ? 'Extension' : 'Scenario';
  const chain: Relation = {
    id: `relation-mock-chain-${String(index + 1).padStart(3, '0')}`,
    pairId: `pair-mock-chain-${String(index + 1).padStart(3, '0')}`,
    sourceExpressionId: card.id,
    targetText: previous.text,
    targetExpressionId: previous.id,
    relationType,
    symmetric: true,
    createdAt: card.createdAt
  };
  if (index % 4 !== 0) return [chain];
  const hub = baseCards[1 + (index % 3)];
  return [chain, {
    id: `relation-mock-hub-${String(index + 1).padStart(3, '0')}`,
    pairId: `pair-mock-hub-${String(index + 1).padStart(3, '0')}`,
    sourceExpressionId: card.id,
    targetText: hub.text,
    targetExpressionId: hub.id,
    relationType: 'Related',
    symmetric: true,
    createdAt: card.createdAt
  }];
});

export const seedRelations: Relation[] = [...baseRelations, ...generatedRelations];
