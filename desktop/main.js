// [I-ENV-STACK]【配布版の読み込み】・[I-PLAN-SUBMISSION]【配布形態】
// 配布版の主プロセス。vite build の出力を独自スキームで配信し、窓に読み込む。
import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENTRY_URL, ORIGIN, SCHEME, resolveDistPath } from './resolve.js';

// 包んだ後も desktop/ と dist/ が同じ階層に並ぶ（desktop/package.js）。
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // ゲームは外部と通信しない。オリジンの外への遷移と新しい窓を許さない。
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.loadURL(ENTRY_URL);
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, (request) => {
    const filePath = resolveDistPath(DIST_DIR, request.url);
    if (filePath === null) return new Response('Not Found', { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
