import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'artifacts/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  ...tseslint.configs.recommended,
);
