import type { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import { useAppStore } from '@/store/useCoreStore';
import './app.scss';

function App(props: PropsWithChildren) {
  useLaunch(() => {
    void useAppStore.getState().initialize();
  });
  return props.children;
}

export default App;
