import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { GraphBoard } from '@/components/GraphBoard';
import { SectionCard } from '@/components/SectionCard';
import { useAppStore } from '@/store/useCoreStore';
import './index.scss';

export default function GraphPage() {
  const cards = useAppStore((state) => state.graphCards.filter((card) => !card.deletedAt));
  const relations = useAppStore((state) => state.graphRelations);
  const error = useAppStore((state) => state.error);
  const loading = useAppStore((state) => state.loading);
  const graphHasMore = useAppStore((state) => state.graphHasMore);
  const refreshGraph = useAppStore((state) => state.refreshGraph);
  const loadMoreGraph = useAppStore((state) => state.loadMoreGraph);
  const [focusedId, setFocusedId] = useState<string | undefined>();
  const recentCards = useMemo(() => [...cards].sort((a, b) => (b.libraryAddedAt || b.createdAt).localeCompare(a.libraryAddedAt || a.createdAt)).slice(0, 10), [cards]);
  return <ScrollView scrollY className='page-scroll'><View className='graph-page'><View className='graph-page__heading'><Text className='graph-page__eyebrow'>PERSONAL EXPRESSION NETWORK</Text><Text className='graph-page__title'>完整图谱</Text><Text className='graph-page__description'>拖动、缩放，沿着关系漫游你的表达世界。</Text></View>{error && <View className='empty-state'><Text>{error}</Text><Text className='copy-link' onClick={() => void refreshGraph().catch(() => undefined)}>重试</Text></View>}<SectionCard title='Global Graph'><GraphBoard cards={cards} relations={relations} centerId={focusedId} />{graphHasMore && <Text className='add-link' onClick={() => void loadMoreGraph().catch(() => undefined)}>{loading ? '载入中…' : '载入更多图谱节点'}</Text>}</SectionCard><SectionCard title='已收藏表达' action='查看全部' onAction={() => Taro.navigateTo({ url: '/pages/recent/index' })}><View className='graph-page__cards'>{recentCards.map((card) => <View key={card.id} className={`graph-page__card ${focusedId === card.id ? 'is-focused' : ''}`} onClick={() => setFocusedId(card.id)}><View><Text className='graph-page__card-text'>{card.text}</Text><Text className='graph-page__card-meta'>访问 {card.accessCount || 0} 次</Text></View><Text className='graph-page__card-open' onClick={(event) => { event.stopPropagation(); Taro.navigateTo({ url: `/pages/expression/index?id=${card.id}` }); }}>查看</Text></View>)}</View></SectionCard><View className='graph-page__legend'><Text><View className='legend-dot legend-dot--card' />已收藏</Text><Text><View className='legend-dot legend-dot--orphan' />未收藏词典表达</Text></View></View></ScrollView>;
}
