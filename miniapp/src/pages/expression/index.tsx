import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { GraphBoard } from '@/components/GraphBoard';
import { SectionCard } from '@/components/SectionCard';
import { useAppStore } from '@/store/useCoreStore';
import type { GraphSnapshot, Relation, RelationType } from '@/types';
import { normalizeExpression } from '@/utils/text';
import './index.scss';

const relationTypes: RelationType[] = ['Synonym', 'Contrast', 'Related', 'Extension', 'Scenario', 'Custom'];

export default function ExpressionPage() {
  const router = useRouter();
  const id = router.params.id || '';
  const card = useAppStore((state) => state.getCard(id));
  const loadCard = useAppStore((state) => state.loadCard);
  const cards = useAppStore((state) => state.cards.filter((item) => !item.deletedAt));
  const relations = useAppStore((state) => state.relations);
  const fetchRelations = useAppStore((state) => state.fetchRelations);
  const loadLocalGraph = useAppStore((state) => state.loadLocalGraph);
  const incrementCardAccess = useAppStore((state) => state.incrementCardAccess);
  const createRelation = useAppStore((state) => state.createRelation);
  const updateRelation = useAppStore((state) => state.updateRelation);
  const deleteRelation = useAppStore((state) => state.deleteRelation);
  const [showRelationEditor, setShowRelationEditor] = useState(false);
  const [editingRelationId, setEditingRelationId] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [typeIndex, setTypeIndex] = useState(0);
  const [customName, setCustomName] = useState('');
  const [localGraph, setLocalGraph] = useState<GraphSnapshot>({ cards: [], relations: [] });
  const [loadFinished, setLoadFinished] = useState(Boolean(card));
  const refreshDetail = useCallback(async () => {
    if (!id) return;
    try {
      await loadCard(id);
      await fetchRelations(id);
      setLocalGraph(await loadLocalGraph(id));
    } catch {
      Taro.showToast({ title: '载入失败，请重试', icon: 'none' });
    } finally {
      setLoadFinished(true);
    }
  }, [fetchRelations, id, loadCard, loadLocalGraph]);
  useEffect(() => { void refreshDetail(); }, [refreshDetail]);
  const visibleCards = useMemo(() => {
    const byId = new Map(cards.map((item) => [item.id, item]));
    localGraph.cards.forEach((item) => byId.set(item.id, { ...byId.get(item.id), ...item }));
    return [...byId.values()];
  }, [cards, localGraph.cards]);
  const accessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAccessTimer = useCallback(() => {
    if (accessTimer.current) clearTimeout(accessTimer.current);
    accessTimer.current = null;
  }, []);
  const startAccessTimer = useCallback(() => {
    stopAccessTimer();
    if (!id) return;
    accessTimer.current = setTimeout(() => {
      void incrementCardAccess(id);
      accessTimer.current = null;
    }, 5000);
  }, [id, incrementCardAccess, stopAccessTimer]);
  useDidShow(startAccessTimer);
  useDidHide(stopAccessTimer);
  useEffect(() => stopAccessTimer, [stopAccessTimer]);
  const localRelations = useMemo(() => {
    const seen = new Set<string>();
    return relations.filter((relation) => relation.sourceExpressionId === id || relation.targetExpressionId === id).filter((relation) => {
      const isSource = relation.sourceExpressionId === id;
      const targetText = isSource ? relation.targetText : (visibleCards.find((item) => item.id === relation.sourceExpressionId)?.text || relation.targetText);
      const key = `${normalizeExpression(targetText)}|${relation.relationType}|${relation.customRelationName || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [relations, id, visibleCards]);
  if (!card) return <View className='missing-card'><Text>{loadFinished ? '找不到这个 Expression Card' : '正在载入 Expression Card…'}</Text><Text className='copy-link' onClick={() => void refreshDetail()}>重试</Text></View>;
  const openRelationEditor = (relation?: Relation) => { if (!relation) { setEditingRelationId(null); setTarget(''); setTypeIndex(0); setCustomName(''); setShowRelationEditor(true); return; } const isSource = relation.sourceExpressionId === card.id; const relationTarget = isSource ? relation.targetText : (visibleCards.find((item) => item.id === relation.sourceExpressionId)?.text || relation.targetText); setEditingRelationId(relation.id); setTarget(relationTarget); setTypeIndex(Math.max(0, relationTypes.indexOf(relation.relationType))); setCustomName(relation.customRelationName || ''); setShowRelationEditor(true); };
  const saveRelation = async () => { if (!target.trim()) return Taro.showToast({ title: '请输入关联表达', icon: 'none' }); if (relationTypes[typeIndex] === 'Custom' && !customName.trim()) return Taro.showToast({ title: '请输入自定义关系名称', icon: 'none' }); const targetCard = visibleCards.find((item) => item.normalizedText === normalizeExpression(target)); const customRelationName = relationTypes[typeIndex] === 'Custom' ? customName.trim() : undefined; try { if (editingRelationId) await updateRelation(editingRelationId, { targetText: target.trim(), targetExpressionId: targetCard?.id, relationType: relationTypes[typeIndex], customRelationName }, card.id); else await createRelation({ sourceId: card.id, targetText: target.trim(), targetId: targetCard?.id, relationType: relationTypes[typeIndex], customRelationName }); await fetchRelations(card.id); setLocalGraph(await loadLocalGraph(card.id)); setTarget(''); setCustomName(''); setEditingRelationId(null); setShowRelationEditor(false); Taro.showToast({ title: '关系已保存', icon: 'none' }); } catch { Taro.showToast({ title: '关系保存失败，请重试', icon: 'none' }); } };
  const removeRelation = async (relationId: string) => { try { await deleteRelation(relationId); await fetchRelations(card.id); setLocalGraph(await loadLocalGraph(card.id)); } catch { Taro.showToast({ title: '删除失败，请重试', icon: 'none' }); } };
  return <ScrollView scrollY className='page-scroll'><View className='expression-page'><View className='expression-page__header'><View className='expression-page__header-actions'><Text className='expression-page__home' onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>⌂ 首页</Text><Text className='expression-page__edit' onClick={() => Taro.navigateTo({ url: `/pages/editor/index?id=${card.id}` })}>编辑</Text></View><Text className='expression-page__title'>{card.text}</Text><Text className='expression-page__meta'>Expression Card</Text></View>
    <SectionCard title='我的理解'><Text className='personal-copy'>{card.personalUnderstanding || '还没有写下自己的理解。'}</Text></SectionCard>
    <SectionCard title='Meaning'><View>{card.meanings.length === 0 && <Text className='empty-copy'>还没有 Meaning，去编辑页添加一个吧。</Text>}{card.meanings.map((meaning, index) => <View key={meaning.id} className='meaning-block'><View className='meaning-block__title'><Text>Meaning {index + 1}</Text><Text>{meaning.content}</Text></View>{meaning.examples.map((example) => <Text key={example.id} className='example-line'>• {example.content}</Text>)}</View>)}</View></SectionCard>
    <SectionCard title='我的笔记'><Text className='personal-copy'>{card.notes || '还没有添加笔记。'}</Text></SectionCard>
    <SectionCard title='我的联想'><View>{localRelations.length === 0 && <Text className='empty-copy'>还没有关系，试着连接一个表达。</Text>}{localRelations.map((relation) => { const isSource = relation.sourceExpressionId === card.id; const targetText = isSource ? relation.targetText : (visibleCards.find((item) => item.id === relation.sourceExpressionId)?.text || relation.targetText); const targetId = isSource ? relation.targetExpressionId : relation.sourceExpressionId; return <View key={relation.id} className='relation-line'><View onClick={() => targetId ? Taro.navigateTo({ url: `/pages/expression/index?id=${targetId}` }) : Taro.navigateTo({ url: `/pages/dictionary/index?expression=${encodeURIComponent(targetText)}` })}><Text className='relation-line__target'>{targetText}</Text><Text className='relation-line__type'>{relation.customRelationName || relation.relationType}</Text></View><View className='relation-line__actions'><Text className='relation-line__edit' onClick={() => openRelationEditor(relation)}>编辑</Text><Text className='relation-line__delete' onClick={() => void removeRelation(relation.id)}>删除</Text></View></View>; })}<Text className='add-link' onClick={() => openRelationEditor()}>＋ 添加关系</Text></View></SectionCard>
    <SectionCard title='局部网络'><GraphBoard cards={localGraph.cards.length ? localGraph.cards : visibleCards} relations={localGraph.relations.length ? localGraph.relations : localRelations} centerId={card.id} local /></SectionCard>
    {showRelationEditor && <View className='relation-modal'><View className='relation-modal__mask' onClick={() => setShowRelationEditor(false)} /><View className='relation-modal__panel'><Text className='relation-modal__title'>{editingRelationId ? '编辑关系' : '添加关系'}</Text><Input value={target} onInput={(event) => setTarget(event.detail.value)} placeholder='关联到哪个表达？' className='relation-modal__input' /><Text className='relation-modal__label'>关系类型</Text><View className='relation-types'>{relationTypes.map((type, index) => <Text key={type} className={`relation-type ${index === typeIndex ? 'is-selected' : ''}`} onClick={() => setTypeIndex(index)}>{type}</Text>)}</View>{relationTypes[typeIndex] === 'Custom' && <Input value={customName} onInput={(event) => setCustomName(event.detail.value)} placeholder='自定义关系名称' className='relation-modal__input' />}<Button className='primary-button' onClick={saveRelation}>{editingRelationId ? '保存修改' : '创建关系'}</Button></View></View>}
  </View></ScrollView>;
}
