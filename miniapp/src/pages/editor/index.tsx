import { useEffect, useState } from 'react';
import { Button, Input, ScrollView, Text, Textarea, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useAppStore } from '@/store/useCoreStore';
import type { Meaning } from '@/types';
import { createId } from '@/utils/text';
import './index.scss';

export default function EditorPage() {
  const router = useRouter();
  const id = router.params.id || '';
  const card = useAppStore((state) => state.getCard(id));
  const loadCard = useAppStore((state) => state.loadCard);
  const updateCard = useAppStore((state) => state.updateCard);
  const deleteCard = useAppStore((state) => state.deleteCard);
  const [understanding, setUnderstanding] = useState(card?.personalUnderstanding || '');
  const [notes, setNotes] = useState(card?.notes || '');
  const [meanings, setMeanings] = useState<Meaning[]>(card?.meanings || []);
  const [loadFinished, setLoadFinished] = useState(Boolean(card));
  useEffect(() => { if (!card && id) void loadCard(id).finally(() => setLoadFinished(true)); }, [card, id, loadCard]);
  useEffect(() => { if (card) { setUnderstanding(card.personalUnderstanding); setNotes(card.notes); setMeanings(card.meanings); } }, [card?.id]);
  if (!card) return <View className='missing-card'><Text>{loadFinished ? '找不到这个 Card' : '正在载入 Card…'}</Text></View>;
  const save = async () => { try { await updateCard(card.id, { personalUnderstanding: understanding, notes, meanings }); Taro.showToast({ title: '已保存', icon: 'success' }); setTimeout(() => Taro.navigateBack(), 450); } catch { Taro.showToast({ title: '保存失败，请重试', icon: 'none' }); } };
  const removeCard = async () => { const result = await Taro.showModal({ title: '删除这个 Card？', content: '个人理解、Meaning 和 Example 会被删除，已建立的关系会保留为未收藏表达。' }); if (!result.confirm) return; try { await deleteCard(card.id); Taro.switchTab({ url: '/pages/home/index' }); } catch { Taro.showToast({ title: '删除失败，请重试', icon: 'none' }); } };
  const addMeaning = () => setMeanings((items) => [...items, { id: createId('meaning'), content: '', sortOrder: items.length, examples: [] }]);
  const updateMeaning = (meaningId: string, content: string) => setMeanings((items) => items.map((item) => item.id === meaningId ? { ...item, content } : item));
  const removeMeaning = (meaningId: string) => setMeanings((items) => items.filter((item) => item.id !== meaningId).map((item, index) => ({ ...item, sortOrder: index })));
  const addExample = (meaningId: string) => setMeanings((items) => items.map((item) => item.id === meaningId ? { ...item, examples: [...item.examples, { id: createId('example'), content: '', sortOrder: item.examples.length }] } : item));
  const updateExample = (meaningId: string, exampleId: string, content: string) => setMeanings((items) => items.map((item) => item.id === meaningId ? { ...item, examples: item.examples.map((example) => example.id === exampleId ? { ...example, content } : example) } : item));
  const removeExample = (meaningId: string, exampleId: string) => setMeanings((items) => items.map((item) => item.id === meaningId ? { ...item, examples: item.examples.filter((example) => example.id !== exampleId) } : item));
  return <ScrollView scrollY className='page-scroll'><View className='editor-page'><View className='editor-page__heading'><Text className='editor-page__eyebrow'>EDIT EXPRESSION CARD</Text><Text className='editor-page__title'>{card.text}</Text></View><View className='editor-field'><Text className='editor-field__label'>我的理解</Text><Textarea value={understanding} onInput={(event) => setUnderstanding(event.detail.value)} maxlength={1000} placeholder='用你自己的话解释这个表达' className='editor-field__textarea' /></View><View className='editor-field'><View className='editor-field__label-row'><Text className='editor-field__label'>Meaning</Text><Text className='editor-add' onClick={addMeaning}>＋ 添加 Meaning</Text></View>{meanings.length === 0 && <Text className='editor-empty'>还没有 Meaning。</Text>}{meanings.map((meaning, index) => <View key={meaning.id} className='meaning-editor'><View className='meaning-editor__top'><Text className='meaning-editor__index'>Meaning {index + 1}</Text><Text className='meaning-editor__remove' onClick={() => removeMeaning(meaning.id)}>删除</Text></View><Input value={meaning.content} onInput={(event) => updateMeaning(meaning.id, event.detail.value)} placeholder='输入这个 Meaning' className='editor-field__input' />{meaning.examples.map((example) => <View key={example.id} className='example-editor'><Input value={example.content} onInput={(event) => updateExample(meaning.id, example.id, event.detail.value)} placeholder='输入例句' className='editor-field__input example-editor__input' /><Text onClick={() => removeExample(meaning.id, example.id)} className='example-editor__remove'>删除</Text></View>)}<Text className='editor-add editor-add--small' onClick={() => addExample(meaning.id)}>＋ 添加例句</Text></View>)}</View><View className='editor-field'><Text className='editor-field__label'>我的笔记</Text><Textarea value={notes} onInput={(event) => setNotes(event.detail.value)} maxlength={2000} placeholder='记录搭配、语气和使用提醒' className='editor-field__textarea' /></View><Button className='save-button' onClick={save}>保存 Card</Button><Text className='delete-card-link' onClick={removeCard}>删除这个 Card</Text></View></ScrollView>;
}
