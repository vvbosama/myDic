import type { DictionaryEntry } from '@/types';

const entries: Record<string, DictionaryEntry> = {
  significant: {
    expression: 'significant', phonetic: '/sɪɡˈnɪfɪkənt/', audio: 'mock://significant', found: true,
    partsOfSpeech: [{ type: 'adjective', senses: [{ definition: 'important or noticeable', examples: ['The decision had a significant impact.'] }, { definition: 'large enough to be noticed or have an effect', examples: ['There has been a significant increase in prices.'] }] }]
  },
  substantial: {
    expression: 'substantial', phonetic: '/səbˈstænʃəl/', audio: 'mock://substantial', found: true,
    partsOfSpeech: [{ type: 'adjective', senses: [{ definition: 'large in amount, value or importance', examples: ['The project requires a substantial investment.'] }] }]
  },
  mitigate: {
    expression: 'mitigate', phonetic: '/ˈmɪtɪɡeɪt/', audio: 'mock://mitigate', found: true,
    partsOfSpeech: [{ type: 'verb', senses: [{ definition: 'to make something less harmful, serious or unpleasant', examples: ['These measures could mitigate the risk.'] }] }]
  },
  alleviate: {
    expression: 'alleviate', phonetic: '/əˈliːvieɪt/', audio: 'mock://alleviate', found: true,
    partsOfSpeech: [{ type: 'verb', senses: [{ definition: 'to make something less severe or easier to bear', examples: ['The new policy may alleviate pressure on families.'] }] }]
  },
  'go a long way toward': {
    expression: 'go a long way toward', phonetic: '/ɡəʊ ə lɒŋ weɪ təˈwɔːd/', audio: 'mock://go-a-long-way-toward', found: true,
    partsOfSpeech: [{ type: 'phrase', senses: [{ definition: 'to help very much in achieving a result', examples: ['This change will go a long way toward addressing the problem.'] }] }]
  }
};

export async function lookupDictionary(expression: string): Promise<DictionaryEntry> {
  await new Promise((resolve) => setTimeout(resolve, 220));
  const key = expression.trim().toLocaleLowerCase();
  return entries[key] ?? { expression: expression.trim(), phonetic: '', found: false, partsOfSpeech: [] };
}
