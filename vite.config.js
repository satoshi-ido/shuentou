// [I-ENV-STACK] ビルド・開発サーバ。UI のエントリは src/ui/index.html。
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/ui',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
