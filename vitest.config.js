// [I-ENV-TOOLING]
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // M0 開始前はテストが存在しないため、0件を成功として扱う。
    passWithNoTests: true,
    // [I-ENV-TOOLING]［CI］実時刻に依存しない検査であるため、実行時間による打ち切りを設けない。
    testTimeout: 0,
    hookTimeout: 0,
  },
});
