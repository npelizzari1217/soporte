// @ts-check
'use strict';

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  // ─── Base: TypeScript + Prettier ───────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      // Override prettier rules (disables conflicting formatting rules)
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Permit _underscore-prefixed params and variables as intentionally unused
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ─── FITNESS RULE: PrismaService / @prisma/client fuera de infrastructure ───
      // Cualquier archivo fuera de infrastructure/ que importe prisma falla el lint.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '.prisma/*', '**/node_modules/.prisma/*'],
              message:
                'FITNESS RULE: @prisma/client y los clientes generados (.prisma/) sólo pueden ' +
                'importarse desde archivos dentro de **/infrastructure/**. ' +
                'Mové este import al adaptador de infraestructura correspondiente.',
            },
          ],
        },
      ],
    },
  },

  // ─── Override para infrastructure/: se permite importar Prisma ────────────
  {
    files: ['src/**/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // ─── Ignorados ───────────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
