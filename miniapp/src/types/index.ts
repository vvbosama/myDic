export type RelationType = 'Synonym' | 'Contrast' | 'Related' | 'Extension' | 'Scenario' | 'Custom';

export interface Example {
  id: string;
  content: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Meaning {
  id: string;
  content: string;
  sortOrder: number;
  examples: Example[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ExpressionCard {
  id: string;
  text: string;
  normalizedText: string;
  personalUnderstanding: string;
  notes: string;
  meanings: Meaning[];
  createdAt: string;
  updatedAt: string;
  /** Time the Card most recently entered the library; editing never changes it. */
  libraryAddedAt?: string;
  /** Persisted detail-page visits; a visit counts after 5 seconds. */
  accessCount?: number;
  deletedAt?: string;
}

export interface Relation {
  id: string;
  /** One undirected endpoint pair. Multiple label rows can share this edge. */
  edgeId?: string;
  pairId?: string;
  sourceExpressionId: string;
  targetText: string;
  targetExpressionId?: string;
  relationType: RelationType;
  customRelationName?: string;
  symmetric: boolean;
  createdAt: string;
}

export type ExpressionSort = 'created_desc' | 'access_desc' | 'access_asc';

export interface GraphSnapshot {
  cards: ExpressionCard[];
  relations: Relation[];
}

export interface DictionarySense {
  definition: string;
  examples: string[];
}

export interface DictionaryPartOfSpeech {
  type: string;
  senses: DictionarySense[];
}

export interface DictionaryEntry {
  expression: string;
  phonetic: string;
  audio?: string;
  partsOfSpeech: DictionaryPartOfSpeech[];
  found: boolean;
}

export interface AiSuggestion {
  expression: string;
  relation: RelationType;
  reason: string;
}

export interface AiExplanation {
  summary: string;
  usage: string;
  memoryTip: string;
}
