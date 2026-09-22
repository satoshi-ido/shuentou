// [I-ENV-TOOLING]
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

// I-ENV-LAYOUT「参照してよい範囲」をゾーンとして写す。
const LAYOUT_ZONES = {
  'src/num': [],
  'src/data': ['src/num'],
  'src/engine': ['src/num', 'src/data'],
  'src/ai': ['src/num', 'src/data', 'src/engine'],
  'src/worker': ['src/ai', 'src/engine', 'src/data'],
  'src/ui': ['src/num', 'src/data', 'src/engine'],
  'tools/audit': ['src/num', 'src/data', 'src/engine', 'src/ai'],
  'tools/genmaster': ['src/num', 'src/data'],
  'tools/docindex': [],
};
const ALL_ZONES = Object.keys(LAYOUT_ZONES);

// target/from はグロブではなく素のディレクトリ表記にする。Windows ではパス区切りが
// バックスラッシュになり、グロブ扱い（minimatch）だと一致しなくなるため。
const dependencyDirectionZones = ALL_ZONES.map((zone) => ({
  target: `./${zone}`,
  from: ALL_ZONES.filter((other) => other !== zone && !LAYOUT_ZONES[zone].includes(other)).map(
    (other) => `./${other}`,
  ),
}));

// I-ENV-STACK［乱数・時刻APIの禁止］・本項［禁止事項の検査規則］乱数の行：src/ui を含む全層に適用する。
const randomRestriction = {
  rules: {
    'no-restricted-properties': [
      'error',
      {
        object: 'Math',
        property: 'random',
        message: '乱数の参照を禁止する（I-ENV-STACK／I-ENV-TOOLING）',
      },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'crypto', message: '乱数の参照を禁止する（I-ENV-STACK／I-ENV-TOOLING）' },
    ],
  },
};

// 決定論層（src/engine・src/ai・src/data・src/num・src/worker・tools/）に適用する禁止事項一式。
const deterministicLayerRestriction = {
  rules: {
    ...randomRestriction.rules,
    'no-restricted-properties': [
      'error',
      ...randomRestriction.rules['no-restricted-properties'].slice(1),
      { object: 'Date', property: 'now', message: '実時刻の参照を禁止する（I-ENV-TOOLING）' },
      {
        object: 'performance',
        property: 'now',
        message: '実時刻の参照を禁止する（I-ENV-TOOLING）',
      },
      {
        object: 'Math',
        property: 'sqrt',
        message: '標準の平方根を禁止する。isqrt を用いる（I-NUM-HELPERS）',
      },
      { object: 'Math', property: 'pow', message: '標準の冪を禁止する（I-NUM-HELPERS）' },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: "NewExpression[callee.name='Date']",
        message: '実時刻の参照を禁止する（I-ENV-TOOLING）',
      },
      {
        selector: 'Literal[raw=/^[0-9]*\\.[0-9]+$/]',
        message: '浮動小数リテラルを禁止する。centi の整数で表す（I-NUM-FIXEDPOINT）',
      },
      {
        selector: "BinaryExpression[operator='/']",
        message: '除算演算子を禁止する。I-NUM-HELPERS のヘルパを用いる',
      },
      {
        selector: "AssignmentExpression[operator='/=']",
        message: '除算演算子を禁止する。I-NUM-HELPERS のヘルパを用いる',
      },
      {
        selector: "NewExpression[callee.name='Map']",
        message: 'Map を禁止する。辞書は素のオブジェクトで表す（I-STATE-JSON）',
      },
      {
        selector: "NewExpression[callee.name='Set']",
        message: 'Set を禁止する。集合はソート済み配列で表す（I-STATE-JSON）',
      },
    ],
  },
};

export default tseslint.config(
  // docs/ はプロトタイプ実装（00#3.1）を含み、実装に引き継がずいかなる事実の正本でもないため対象外とする。
  { ignores: ['node_modules/**', 'docs/**', 'dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['tools/**/*.{ts,js}', '*.config.js'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
  {
    plugins: { import: importPlugin },
    rules: {
      'import/no-cycle': ['error', { maxDepth: Infinity }],
    },
  },
  {
    files: ['src/**/*.{ts,js}', 'tools/**/*.{ts,js}'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', { zones: dependencyDirectionZones }],
    },
  },
  {
    files: [
      'src/engine/**/*.{ts,js}',
      'src/ai/**/*.{ts,js}',
      'src/data/**/*.{ts,js}',
      'src/num/**/*.{ts,js}',
      'src/worker/**/*.{ts,js}',
      'tools/**/*.{ts,js}',
    ],
    ...deterministicLayerRestriction,
  },
  {
    files: ['src/ui/**/*.{ts,js}'],
    ...randomRestriction,
  },
);
