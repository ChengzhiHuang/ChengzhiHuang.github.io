import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
export default tseslint.config(
  { ignores: ['dist/**', '.astro/**', '.harness/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  { files: ['**/*.mjs'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
