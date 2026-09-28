import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/target/**',
      '**/node_modules/**',
      'pnpm-lock.yaml'
    ]
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'indesign',
              message: 'InDesign DOM access must stay in packages/indesign.'
            },
            {
              name: 'uxp',
              message: 'UXP runtime access must stay in host and plugin adapters.'
            }
          ]
        }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  },
  {
    files: ['packages/core/**/*.ts', 'packages/contracts/**/*.ts', 'packages/template/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['node:*', 'fs', 'path', 'uxp', 'indesign']
        }
      ]
    }
  }
);
