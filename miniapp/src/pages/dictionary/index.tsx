import { useEffect, useMemo, useState } from 'react';
import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { SectionCard } from '@/components/SectionCard';
import { useAppStore } from '@/store/useCoreStore';
import { compareExpressions, explainExpression, suggestRelations } from '@/services/mockAi';
import { lookupDictionary } from '@/services/mockDictionary';
import type { AiExplanation, AiSuggestion, DictionaryEntry } from '@/types';
import './index.scss';

export default function DictionaryPage() {
  const router = useRouter();
  const expression = decodeURIComponent(router.params.expression || '');
  const createCard = useAppStore((state) => state.createCard);
  const findCard = useAppStore((state) => state.findCard);
  const createRelation = useAppStore((state) => state.createRelation);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [explanation, setExplanation] = useState<AiExplanation | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [compareWith, setCompareWith] = useState('');
  const [compareResult, setCompareResult] = useState('');
  const [loading, setLoading] = useState('');
  const card = useMemo(() => findCard(expression), [findCard, expression]);
  useEffect(() => { if (expression) void lookupDictionary(expression).then(setEntry); }, [expression]);
  const addToLibrary = async () => { try { const created = await createCard(expression); Taro.redirectTo({ url: `/pages/expression/index?id=${created.id}` }); } catch { Taro.showToast({ title: '保存失败，请重试', icon: 'none' }); } };
  const copy = (text: string) => { Taro.setClipboardData({ data: text }); };
  const runExplain = async () => { setLoading('explain'); setExplanation(await explainExpression(expression)); setLoading(''); };
  const runSuggest = async () => { setLoading('suggest'); setSuggestions(await suggestRelations(expression)); setLoading(''); };
  const runCompare = async () => { if (!compareWith.trim()) return Taro.showToast({ title: '请输入另一个表达', icon: 'none' }); setLoading('compare'); setCompareResult(await compareExpressions(expression, compareWith.trim())); setLoading(''); };
  const addSuggestion = async (suggestion: AiSuggestion) => { const source = findCard(expression); if (!source) return Taro.showToast({ title: '请先加入表达库，再添加关系', icon: 'none' }); const target = findCard(suggestion.expression); try { await createRelation({ sourceId: source.id, targetText: suggestion.expression, targetId: target?.id, relationType: suggestion.relation }); Taro.showToast({ title: '关系已添加', icon: 'none' }); } catch { Taro.showToast({ title: '关系保存失败，请重试', icon: 'none' }); } };
  return <ScrollView scrollY className='page-scroll'><View className='dictionary-page'><View className='dictionary-page__heading'><Text className='dictionary-page__home' onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>⌂ 首页</Text><Text className='dictionary-page__expression'>{expression}</Text>{entry?.phonetic && <Text className='dictionary-page__phonetic'>{entry.phonetic}</Text>}</View>
    {!entry && <View className='empty-state'>正在查询 Mock Dictionary…</View>}
    {entry && !entry.found && <View className='empty-state'><Text>暂无词典结果</Text><Text className='empty-state__hint'>你仍然可以把它加入自己的表达库。</Text></View>}
    {entry?.found && <SectionCard title='Dictionary'><View className='dictionary-page__source'>Free Dictionary Mock</View>{entry.partsOfSpeech.map((part) => <View key={part.type} className='dictionary-part'><Text className='dictionary-part__type'>{part.type}</Text>{part.senses.map((sense, index) => <View key={`${part.type}-${index}`} className='dictionary-sense'><Text className='dictionary-sense__definition'>{sense.definition}</Text>{sense.examples.map((example) => <Text key={example} className='dictionary-sense__example'>“{example}”</Text>)}</View>)}</View>)}{entry.audio && <Text className='dictionary-page__audio' onClick={() => Taro.showToast({ title: 'Mock 音频：稍后接入', icon: 'none' })}>◉ 播放发音</Text>}</SectionCard>}
    <SectionCard title='AI Understanding'><View className='ai-actions'><Button onClick={runExplain}>{loading === 'explain' ? '理解中…' : '💡 帮我理解'}</Button><Button onClick={runSuggest}>{loading === 'suggest' ? '联想中…' : '💡 联想表达'}</Button></View>{explanation && <View className='ai-result'><Text className='ai-result__label'>核心感觉</Text><Text className='ai-result__text'>{explanation.summary}</Text><Text className='ai-result__label'>使用场景</Text><Text className='ai-result__text'>{explanation.usage}</Text><Text className='ai-result__label'>记忆提示</Text><Text className='ai-result__text'>{explanation.memoryTip}</Text><Text className='copy-link' onClick={() => copy(`${explanation.summary}\n${explanation.usage}\n${explanation.memoryTip}`)}>复制 AI 解释</Text></View>}{suggestions.length > 0 && <View className='suggestion-list'>{suggestions.map((suggestion) => <View key={`${suggestion.expression}-${suggestion.relation}`} className='suggestion-item'><View><Text className='suggestion-item__text'>{suggestion.expression}</Text><Text className='suggestion-item__reason'>{suggestion.relation} · {suggestion.reason}</Text></View><View className='suggestion-item__right'><Text className='suggestion-item__status'>{findCard(suggestion.expression) ? '已收藏' : '未收藏'}</Text><Text className='suggestion-item__add' onClick={() => addSuggestion(suggestion)}>添加</Text></View></View>)}</View>}</SectionCard>
    <SectionCard title='AI Compare'><View className='compare-row'><Input value={compareWith} onInput={(event) => setCompareWith(event.detail.value)} placeholder='输入另一个表达' className='compare-row__input' /><Button onClick={runCompare}>{loading === 'compare' ? '比较中…' : '比较'}</Button></View>{compareResult && <View className='ai-result'><Text className='ai-result__text'>{compareResult}</Text><Text className='copy-link' onClick={() => copy(compareResult)}>复制比较结果</Text></View>}</SectionCard>
    {!card && <Button className='primary-button' onClick={addToLibrary}>＋ 加入我的表达库</Button>}{card && <Button className='primary-button' onClick={() => Taro.redirectTo({ url: `/pages/expression/index?id=${card.id}` })}>进入我的 Card</Button>}
  </View></ScrollView>;
}
