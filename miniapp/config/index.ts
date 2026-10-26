import path from 'path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';

const config: UserConfigExport = defineConfig({
  projectName: 'expression-network',
  date: '2026-09-29',
  designWidth: 750,
  deviceRatio: { 375: 2, 640: 2.34, 750: 1, 828: 1.81 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  alias: {
    '@': path.resolve(__dirname, '..', 'src')
  },
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false }
  },
  defineConstants: {
    'process.env.APP_DATA_MODE': JSON.stringify(process.env.APP_DATA_MODE || 'api'),
    'process.env.APP_API_BASE_URL': JSON.stringify(process.env.APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1')
  },
  mini: {},
  h5: {}
});

export default config;
