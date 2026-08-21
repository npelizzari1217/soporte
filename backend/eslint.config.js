// @ts-check
'use strict';

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

// ─── Globals del runtime de Node ───────────────────────────────────────────
// Se declaran a mano y NO con el paquete `globals`: eslint 10 dejó de
// arrastrarlo (tampoco arrastra `@eslint/js`, por eso el set de reglas base
// de más abajo va explícito en vez de spreadear `js.configs.recommended`).
// Sumar dos dependencias nuevas para una lista de nombres que no cambia no
// se paga; el día que el preset vuelva a estar disponible, esto se borra.
const globalsNode = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  fetch: 'readonly',
  structuredClone: 'readonly',
  queueMicrotask: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
};

// CommonJS suma el wrapper del módulo. Sólo aplica a los `.js` de scripts/:
// backend/package.json no declara `"type": "module"`, así que ahí `.js` es
// CJS y `.mjs` es ESM.
const globalsCommonJs = {
  ...globalsNode,
  __dirname: 'readonly',
  __filename: 'readonly',
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
};

// ─── Reglas base para JavaScript plano ─────────────────────────────────────
// Subconjunto de `eslint:recommended` elegido a dedo: sólo reglas que
// atrapan errores reales (variable inexistente, código muerto, catch vacío)
// y que no tiran falsos positivos en scripts one-off. El estilo lo resuelve
// prettier, no hace falta duplicarlo acá.
const reglasBaseJs = {
  'no-undef': 'error',
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  // Un catch vacío se traga el error sin dejar rastro: es exactamente lo que
  // las reglas del proyecto prohíben.
  'no-empty': ['error', { allowEmptyCatch: false }],
  'no-unreachable': 'error',
  'no-constant-condition': 'error',
  'no-cond-assign': 'error',
  'no-dupe-args': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-fallthrough': 'error',
  'no-func-assign': 'error',
  'no-obj-calls': 'error',
  'no-self-assign': 'error',
  'no-sparse-arrays': 'error',
  'require-yield': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
};

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
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
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

  // ─── scripts/ · ESM (.mjs) ────────────────────────────────────────────────
  // El glob es por extensión y no por lista de archivos A PROPÓSITO: un script
  // nuevo en scripts/ (o en scripts/lib/) queda linteado el día que se crea,
  // sin que nadie se tenga que acordar de darlo de alta en ningún lado.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globalsNode,
    },
    plugins: { prettier: prettierPlugin },
    rules: {
      ...reglasBaseJs,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
    },
  },

  // ─── scripts/ · CommonJS (.js) ────────────────────────────────────────────
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globalsCommonJs,
    },
    plugins: { prettier: prettierPlugin },
    rules: {
      ...reglasBaseJs,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
    },
  },

  // ─── scripts/ · TypeScript (.ts, specs incluidos) ─────────────────────────
  // Mismo set que src/ MENOS la fitness rule de Prisma: los scripts son
  // justamente los que hablan con la base sin pasar por un adaptador de
  // infraestructura, esa regla no tiene sentido acá.
  // `no-undef` no se activa (viene apagado del preset de typescript-eslint):
  // en TypeScript el compilador ya resuelve los identificadores, y la regla
  // no ve los tipos globales de Node ni los de vitest.
  {
    files: ['scripts/**/*.ts'],
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
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ─── Ignorados ───────────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
