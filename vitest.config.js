// [I-ENV-TOOLING]
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // M0 開始前はテストが存在しないため、0件を成功として扱う。
    passWithNoTests: true,
  },
});
