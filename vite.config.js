// [I-ENV-STACK] ビルド・開発サーバ。UI のエントリは src/ui/index.html。
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/ui',
  server: {
    // 開発サーバのルート（src/ui）の外にある層（src/engine ほか）の変更を取りこぼすと、
    // 画面だけが新しく engine が古いまま提供される。取りこぼしを避けるため監視を巡回に固定する。
    watch: { usePolling: true, interval: 300 },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
