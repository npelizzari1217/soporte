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

// ─── FITNESS RULE: degradación silenciosa de env a string vacío ───────────
// `process.env.X ?? ''` (o `|| ''`) convierte una variable de entorno
// faltante en un string vacío que sigue viajando por el sistema como si
// fuera un valor válido — ya pasó en producción con `APP_BASE_URL`: links
// rotos en los mails, y nadie lo notó porque no hubo ningún error.
// Ref spec: REQ-9. Ref design: ADR-E4 (mismo idiom que la fitness rule de
// Prisma de más abajo — `no-restricted-syntax`, sin plugin propio).
//
// OJO: `no-restricted-syntax` es un CUPO DE UNO. El flat config REEMPLAZA las
// opciones de una regla, no las fusiona: quien agregue otra fitness rule con
// este mismo nombre borra TODOS estos selectores y el lint sigue en verde.
// Si necesitás una nueva, sumala a `reglaEnvStringVacio`. Que no pase
// inadvertido lo cubre `src/config/regla-env-vacio.lint.spec.ts`, que lintea
// contra ESTE archivo y no contra una copia del selector: usa un filePath de
// `src/` y uno POR CADA bloque de `scripts/` (.mjs, .js, .ts), porque con uno
// solo se podía borrar la regla de los otros bloques sin que nada se pusiera
// rojo.
const MENSAJE_ENV_VACIO =
  'FITNESS RULE: una variable de entorno que degrada a string vacío viaja rota ' +
  'hasta el usuario final. Declarala en `src/config/validar-entorno.ts` y ' +
  'consumila desde `entorno`, o dale un default legítimo y documentalo en el README.';

// El ancla es `process.env` como DESCENDIENTE, no la posición exacta de `left`.
// Anclarla en `left.object.object.name` dejaba pasar el fallback encadenado
// `process.env.A || process.env.B || ''`: ahí el `left` del operador externo es
// otro LogicalExpression y la ruta nunca resolvía.
//
// Y `process.env` se escribe de DOS formas en el AST: `process.env` (property
// es un Identifier) y `process["env"]` (property es un Literal). Cubrir solo
// la primera dejaba pasar `process["env"].X ?? ''`, una asimetría boba porque
// el acceso por corchete a la VARIABLE sí estaba cubierto. Van como lista
// dentro de UN `:has`, no como dos entradas: dos entradas reportan el mismo
// nodo dos veces.
const ANCLA_PROCESS_ENV =
  ':has(MemberExpression[object.name="process"][property.name="env"],' +
  ' MemberExpression[object.name="process"][property.value="env"])';

// Dos operadores por dos formas de escribir el string vacío. Cerrar solo `??`
// deja abierto `||`, y cerrar solo el Literal deja abierto el TemplateLiteral
// vacío, que NO es un Literal en el AST y produce exactamente el mismo valor.
// Cada bypass es un token de diferencia.
const OPERADORES_DEGRADANTES = ['??', '||'];
const FORMAS_DE_VACIO = [
  '[right.type="Literal"][right.value=""]',
  '[right.type="TemplateLiteral"][right.expressions.length=0][right.quasis.0.value.raw=""]',
];

// El ternario NO es una variante exótica: `process.env.X ? process.env.X : ''`
// es la misma degradación con otra sintaxis, y el idiom ya vive en el repo
// (`shared.module.ts`, para STORAGE_DIR, ahí con `undefined` en vez de vacío).
//
// Las DOS orientaciones, porque invertir la condición es un token de
// diferencia: `!process.env.X ? '' : process.env.X` y
// `process.env.X === undefined ? '' : process.env.X` ponen la lectura en el
// `alternate` y el vacío en el `consequent`. Esta última forma es la que
// produce mecánicamente una limpieza de `strict-boolean-expressions`.
//
// En las dos se exige que UNA RAMA sea la lectura de env y la OTRA el vacío,
// no que `process.env` aparezca en cualquier lado: `process.env.FLAG ? 'si' :
// ''` arma una etiqueta y no es esta enfermedad.
//
// El precio de esa precisión: acá el ancla SÍ es una ruta fija, o sea lo que
// más arriba se descarta para `??`/`||`. Es deliberado, no un descuido. Deja
// afuera el ternario cuya rama es algo DERIVADO de la lectura
// (`process.env.A ? process.env.A.trim() : ..`) y el encadenado en forma de
// ternario; los dos están declarados en el docblock de `config/entorno.ts`.
const RAMAS_TERNARIO = [
  { lectura: 'consequent', vacio: 'alternate' },
  { lectura: 'alternate', vacio: 'consequent' },
];

// `process.env` (property Identifier) vs `process["env"]` (property Literal).
const ACCESOS_A_ENV = ['name', 'value'];

const reglaEnvStringVacio = {
  'no-restricted-syntax': [
    'error',
    ...OPERADORES_DEGRADANTES.flatMap((operador) =>
      FORMAS_DE_VACIO.map((formaVacia) => ({
        selector: `LogicalExpression[operator="${operador}"]${formaVacia}${ANCLA_PROCESS_ENV}`,
        message: MENSAJE_ENV_VACIO,
      })),
    ),
    ...RAMAS_TERNARIO.flatMap(({ lectura, vacio }) =>
      ACCESOS_A_ENV.flatMap((acceso) =>
        FORMAS_DE_VACIO.map((formaVacia) => ({
          selector:
            `ConditionalExpression[${lectura}.object.object.name="process"]` +
            `[${lectura}.object.property.${acceso}="env"]` +
            // Las formas del vacío se declaran una sola vez, sobre `right`, y
            // se reapuntan a la rama que toque. OJO si agregás una: el replace
            // es sobre el string del selector, así que una propiedad que
            // contenga "right" en el nombre saldría mutilada.
            formaVacia.replace(/right/g, vacio),
          message: MENSAJE_ENV_VACIO,
        })),
      ),
    ),
  ],
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

      ...reglaEnvStringVacio,

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
      ...reglaEnvStringVacio,
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
      ...reglaEnvStringVacio,
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
      ...reglaEnvStringVacio,
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
