import { useEffect, useMemo } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { ExpressionSearch } from '@/components/ExpressionSearch';
import { GraphBoard } from '@/components/GraphBoard';
import { SectionCard } from '@/components/SectionCard';
import { useAppStore } from '@/store/useCoreStore';
import { normalizeExpression } from '@/utils/text';
import './index.scss';

export default function HomePage() {
  const cards = useAppStore((state) => state.cards.filter((card) => !card.deletedAt));
  const graphCards = useAppStore((state) => state.graphCards.filter((card) => !card.deletedAt));
  const graphRelations = useAppStore((state) => state.graphRelations);
  const mode = useAppStore((state) => state.mode);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const initialize = useAppStore((state) => state.initialize);
  const resetMockData = useAppStore((state) => state.resetMockData);

  // The DevTools simulator can restore a page without replaying App.onLaunch.
  // initialize() is idempotent, so this safely guarantees that API data is loaded.
  useEffect(() => {
    void initialize();
  }, [initialize]);

  const recent = useMemo(() => [...cards].sort((a, b) => (b.libraryAddedAt || b.createdAt).localeCompare(a.libraryAddedAt || a.createdAt)).slice(0, 3), [cards]);
  const recentGraphCards = useMemo(() => [...graphCards].sort((a, b) => (b.libraryAddedAt || b.createdAt).localeCompare(a.libraryAddedAt || a.createdAt)).slice(0, 5), [graphCards]);
  const graphPreview = useMemo(() => {
    const recentIds = new Set(recentGraphCards.map((card) => card.id));
    const previewIds = new Set(recentIds);
    const cardsById = new Map(graphCards.map((card) => [card.id, card]));
    const cardsByText = new Map(graphCards.map((card) => [card.normalizedText || normalizeExpression(card.text), card]));

    // The home graph is intentionally a focused preview: keep the five newest
    // saved Cards, then add every saved Card directly connected to any of them.
    // This gives the thumbnail network shape without loading the full universe.
    graphRelations.forEach((relation) => {
      const sourceIsRecent = recentIds.has(relation.sourceExpressionId);
      const targetCard = (relation.targetExpressionId ? cardsById.get(relation.targetExpressionId) : undefined)
        || cardsByText.get(normalizeExpression(relation.targetText));
      if (sourceIsRecent && targetCard) previewIds.add(targetCard.id);
      if (targetCard && recentIds.has(targetCard.id)) previewIds.add(relation.sourceExpressionId);
    });
    return graphCards.filter((card) => previewIds.has(card.id));
  }, [graphCards, graphRelations, recentGraphCards]);
  return <ScrollView scrollY className='page-scroll'><View className='home-page'>
    <View className='home-page__hero'><Text className='home-page__eyebrow'>PERSONAL EXPRESSION NETWORK</Text><Text className='home-page__title'>My Language{`\n`}Universe</Text><Text className='home-page__subtitle'>把遇见的表达，变成属于你的语言世界。</Text><ExpressionSearch /></View>
    {error && <View className='empty-state'><Text>{error}</Text><Text className='copy-link' onClick={() => void initialize(true)}>重试连接</Text></View>}
    {loading && cards.length === 0 && <View className='empty-state'>正在载入表达网络…</View>}
    <SectionCard title='Personal Graph Preview' action='查看完整图谱' onAction={() => Taro.switchTab({ url: '/pages/graph/index' })}><GraphBoard cards={graphPreview} relations={graphRelations} centerId={recentGraphCards[0]?.id} toolbarLabel={recentGraphCards.length ? `最近 ${recentGraphCards.length} 个收藏 · 直接关联` : '最近收藏 · 直接关联'} /></SectionCard>
    <SectionCard title='最近添加' action='查看全部' onAction={() => Taro.navigateTo({ url: '/pages/recent/index' })}><View className='recent-list'>{recent.map((card) => <View key={card.id} className='recent-item' onClick={() => Taro.navigateTo({ url: `/pages/expression/index?id=${card.id}` })}><View><Text className='recent-item__text'>{card.text}</Text><Text className='recent-item__hint'>{card.meanings[0]?.content || '还没有添加个人理解'}</Text></View><Text className='recent-item__arrow'>→</Text></View>)}</View></SectionCard>
    {mode === 'mock' && <View className='home-page__tools'><Text onClick={() => { resetMockData(); Taro.showToast({ title: 'Mock 数据已重置', icon: 'none' }); }}>重置本地 Mock 数据</Text></View>}
  </View></ScrollView>;
}
