import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'artifacts/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  ...tseslint.configs.recommended,
  {
    // Pure logic must be seeded and deterministic (CLAUDE.md): use createRng, not Math.random.
    files: ['src/core/**', 'src/case/**', 'src/world/**', 'server/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use a seeded stream from src/core/rng.ts.' },
      ],
    },
  },
);
