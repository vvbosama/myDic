import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { SectionCard } from '@/components/SectionCard';
import { useAppStore } from '@/store/useCoreStore';
import { formatDate } from '@/utils/text';
import type { ExpressionSort } from '@/types';
import './index.scss';

const sortOptions: Array<{ value: ExpressionSort; label: string }> = [
  { value: 'created_desc', label: '时间倒序' },
  { value: 'access_desc', label: '访问次数降序' },
  { value: 'access_asc', label: '访问次数升序' },
];

export default function RecentPage() {
  const cards = useAppStore((state) => state.cards.filter((card) => !card.deletedAt));
  const refreshExpressions = useAppStore((state) => state.refreshExpressions);
  const loadMoreExpressions = useAppStore((state) => state.loadMoreExpressions);
  const hasMore = useAppStore((state) => state.listHasMore);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const [sortMode, setSortMode] = useState<ExpressionSort>('created_desc');
  useEffect(() => { void refreshExpressions(sortMode).catch(() => undefined); }, [refreshExpressions, sortMode]);
  const recent = useMemo(() => [...cards].sort((a, b) => {
    if (sortMode === 'access_asc') {
      return (a.accessCount || 0) - (b.accessCount || 0) || b.updatedAt.localeCompare(a.updatedAt);
    }
    if (sortMode === 'access_desc') {
      return (b.accessCount || 0) - (a.accessCount || 0) || b.updatedAt.localeCompare(a.updatedAt);
    }
    return (b.libraryAddedAt || b.createdAt).localeCompare(a.libraryAddedAt || a.createdAt);
  }), [cards, sortMode]);
  const sortDescription = sortMode === 'created_desc' ? '按最近加入表达库的时间回顾，不受编辑时间影响。' : sortMode === 'access_desc' ? '优先查看访问频率较高的表达。' : '优先查看较少访问、适合复习的表达。';
  return <ScrollView scrollY className='page-scroll'><View className='recent-page'><View className='recent-page__heading'><Text className='recent-page__eyebrow'>REVIEW YOUR UNIVERSE</Text><Text className='recent-page__title'>最近添加</Text><Text className='recent-page__description'>{sortDescription}</Text></View><SectionCard title='全部表达'><View className='recent-page__sortbar'><Text className='recent-page__sort-label'>排序</Text>{sortOptions.map((option) => <Text key={option.value} className={`recent-page__sort-option ${sortMode === option.value ? 'is-active' : ''}`} onClick={() => setSortMode(option.value)}>{option.label}</Text>)}</View>{error && <View className='empty-state'><Text>{error}</Text><Text className='copy-link' onClick={() => void refreshExpressions(sortMode).catch(() => undefined)}>重试</Text></View>}<View className='recent-page__list'>{recent.map((card) => <View key={card.id} className='recent-page__item' onClick={() => Taro.navigateTo({ url: `/pages/expression/index?id=${card.id}` })}><View className='recent-page__item-main'><View className='recent-page__item-top'><Text className='recent-page__expression'>{card.text}</Text><Text className='recent-page__date'>{formatDate(card.libraryAddedAt || card.createdAt)}</Text></View><Text className='recent-page__understanding'>{card.personalUnderstanding || card.meanings[0]?.content || '还没有添加个人理解'}</Text>{card.notes && <Text className='recent-page__notes'>笔记：{card.notes}</Text>}<Text className='recent-page__meaning-count'>{card.meanings.length} 个 Meaning · {card.meanings.reduce((total, meaning) => total + meaning.examples.length, 0)} 个例句 · 访问 {card.accessCount || 0} 次</Text></View><Text className='recent-page__arrow'>→</Text></View>)}</View>{hasMore && <Text className='add-link' onClick={() => void loadMoreExpressions().catch(() => undefined)}>{loading ? '载入中…' : '载入更多（每页 50 条）'}</Text>}</SectionCard></View></ScrollView>;
}
