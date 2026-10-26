import { PropsWithChildren } from 'react';
import { View, Text } from '@tarojs/components';
import './index.scss';

export function SectionCard({ title, action, onAction, children }: PropsWithChildren<{ title: string; action?: string; onAction?: () => void }>) {
  return <View className='section-card'><View className='section-card__header'><Text className='section-card__title'>{title}</Text>{action && <Text className={`section-card__action ${onAction ? 'is-clickable' : ''}`} onClick={onAction}>{action}</Text>}</View>{children}</View>;
}
