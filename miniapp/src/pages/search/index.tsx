import { useEffect, useState } from 'react';
import { Input, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useAppStore } from '@/store/useCoreStore';
import { lookupDictionary } from '@/services/mockDictionary';
import type { DictionaryEntry } from '@/types';
import './index.scss';

export default function SearchPage() {
  const searchCard = useAppStore((state) => state.searchCard);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<DictionaryEntry | null>(null);
  const [searched, setSearched] = useState(false);
  useLoad((params) => { if (params.q) { const value = decodeURIComponent(params.q); setQuery(value); void search(value); } });
  useEffect(() => { if (query) void search(query); }, []);
  const search = async (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setSearched(true);
    try {
      const card = await searchCard(clean);
      if (card) { Taro.redirectTo({ url: `/pages/expression/index?id=${card.id}` }); return; }
      setResult(await lookupDictionary(clean));
    } catch {
      Taro.showToast({ title: '核心服务请求失败，请重试', icon: 'none' });
    }
  };
  return <ScrollView scrollY className='page-scroll'><View className='search-page'><Input value={query} onInput={(event) => setQuery(event.detail.value)} onConfirm={() => search(query)} confirmType='search' placeholder='搜索一个英语表达' className='search-page__input' /><Text className='search-page__tip'>优先检查你的表达库，未收藏的表达会进入词典。</Text>{searched && result && <View className='search-result' onClick={() => Taro.navigateTo({ url: `/pages/dictionary/index?expression=${encodeURIComponent(result.expression)}` })}><View className='search-result__status'>{result.found ? '词典结果' : '暂无词典结果'}</View><Text className='search-result__text'>{result.expression}</Text><Text className='search-result__arrow'>→</Text></View>}</View></ScrollView>;
}
