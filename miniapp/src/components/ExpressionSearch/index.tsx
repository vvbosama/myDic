import { useState } from 'react';
import { Input, View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

export function ExpressionSearch({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    const query = value.trim();
    if (!query) return Taro.showToast({ title: '请输入一个表达', icon: 'none' });
    Taro.navigateTo({ url: `/pages/search/index?q=${encodeURIComponent(query)}` });
  };
  return <View className='expression-search'><Text className='expression-search__icon'>⌕</Text><Input value={value} onInput={(event) => setValue(event.detail.value)} onConfirm={submit} confirmType='search' placeholder='搜索一个英语表达' className='expression-search__input' /><Text className='expression-search__button' onClick={submit}>搜索</Text></View>;
}
