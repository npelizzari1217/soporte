/**
 * regla-env-vacio.lint.spec.ts — TDD RED phase (WU-4, sdd/fail-fast-env).
 *
 * Ref spec: REQ-9. Ref design: ADR-E4 (regla `no-restricted-syntax`, no un
 * plugin propio). Ref tasks: WU-4.
 *
 * Prueba programática de la regla de ESLint contra el `eslint.config.js`
 * real del proyecto, no una copia del selector en este archivo — así un
 * cambio accidental en la config real hace fallar este test, no solo una
 * verificación manual que nadie vuelve a correr.
 *
 * `filePath` apunta a un archivo real ya incluido en `tsconfig.eslint.json`
 * (este mismo spec): `@typescript-eslint` con `parserOptions.project`
 * necesita que el archivo analizado exista en el proyecto de TS, aunque el
 * *contenido* lintado sea un snippet en memoria vía `lintText`.
 *
 * El patrón prohibido viaja como string armado en runtime (no como literal
 * `?? ''` escrito en este archivo) para que este mismo spec no se autodenuncie
 * bajo la regla que está probando.
 */
import path from 'node:path';
import { ESLint } from 'eslint';

const RUTA_ARCHIVO_REAL = __filename;

/**
 * Un archivo real por CADA bloque de `eslint.config.js` que spreadea la regla,
 * porque la spreadea en cada uno por separado: cubrir solo uno dejaba borrar
 * la regla de los otros sin que nada se pusiera rojo.
 *
 * El bloque de `src/**‌/infrastructure/**` importa especialmente: hoy solo
 * apaga `no-restricted-imports`, pero es un override sobre `src/`, así que el
 * día que alguien le agregue su propia fitness rule con el nombre
 * `no-restricted-syntax` mata esta regla en TODO `infrastructure/` — que es
 * justo donde viven las lecturas de entorno.
 *
 * El bloque base de `src/` lo cubre el resto del archivo, que lintea bajo
 * `RUTA_ARCHIVO_REAL`.
 */
const RUTAS_POR_BLOQUE: ReadonlyArray<readonly [string, string]> = [
  ['scripts .mjs', path.resolve(__dirname, '../../scripts/lib/guardarrail-host.mjs')],
  ['scripts .js', path.resolve(__dirname, '../../scripts/migrate-tenants.js')],
  ['scripts .ts', path.resolve(__dirname, '../../scripts/lib/barrido-huerfanas.spec.ts')],
  [
    'src/**/infrastructure/**',
    path.resolve(__dirname, '../shared/infrastructure/crypto/aes-gcm-secret-cipher.ts'),
  ],
];

/**
 * Arma una degradación a string vacío, sin escribir el literal prohibido en el
 * código fuente de este archivo.
 *
 * @param operador Operador que aplica el default.
 * @param forma Cómo se llega a `process.env` y cómo se escribe el vacío.
 * @returns Una línea de código con el patrón que la regla tiene que marcar.
 */
function degradacionAVacio(
  operador: '??' | '||',
  forma: 'punto' | 'corchete' | 'template' | 'encadenado' | 'env-por-corchete',
): string {
  const comillaVacia = "''";
  const templateVacio = '``';
  switch (forma) {
    case 'punto':
      return `const x = process.env.APP_BASE_URL ${operador} ${comillaVacia};`;
    case 'corchete':
      return `const x = process.env['APP_BASE_URL'] ${operador} ${comillaVacia};`;
    // Un TemplateLiteral vacío NO es un `Literal` en el AST y produce el mismo
    // string vacío: un selector anclado solo en `Literal` lo dejaba pasar.
    case 'template':
      return `const x = process.env.APP_BASE_URL ${operador} ${templateVacio};`;
    // El fallback encadenado es el que uno escribe sin pensar el día que suma
    // una variable de respaldo. Acá el `left` del operador externo es otro
    // LogicalExpression, así que anclar en `left.object.object` no resolvía.
    case 'encadenado':
      return `const x = process.env.A ${operador} process.env.B ${operador} ${comillaVacia};`;
    // El corchete sobre `env` mismo, no sobre la variable: `property` pasa a
    // ser un Literal en vez de un Identifier.
    case 'env-por-corchete':
      return `const x = process["env"].APP_BASE_URL ${operador} ${comillaVacia};`;
  }
}

/**
 * Lintea un snippet contra el `eslint.config.js` real.
 *
 * @param codigo Snippet a analizar.
 * @param rutaArchivo Archivo real bajo el que se lo evalúa; decide qué bloque
 *   de config aplica. Por defecto, este mismo spec (o sea `src/`).
 * @returns Los resultados de ESLint.
 */
async function lintear(
  codigo: string,
  rutaArchivo: string = RUTA_ARCHIVO_REAL,
): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '../..') });
  return eslint.lintText(codigo, { filePath: rutaArchivo });
}

function tieneViolacionDeLaRegla(resultados: ESLint.LintResult[]): boolean {
  return resultados.some((r) => r.messages.some((m) => m.ruleId === 'no-restricted-syntax'));
}

describe('regla no-restricted-syntax: degradación de env a string vacío', () => {
  const OPERADORES = ['??', '||'] as const;
  const FORMAS = ['punto', 'corchete', 'template', 'encadenado', 'env-por-corchete'] as const;

  it.each(OPERADORES.flatMap((operador) => FORMAS.map((forma) => [operador, forma] as const)))(
    'marca la degradación con `%s` en su forma %s',
    async (operador, forma) => {
      const resultados = await lintear(degradacionAVacio(operador, forma));

      expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
    },
    // El primer `lintText` de la suite paga el costo frío de resolver
    // `parserOptions.project` (`tsconfig.eslint.json`) contra el árbol
    // real de `src/`; el timeout global de 5s no alcanza para esa carga.
    15_000,
  );

  it.each([
    ['comilla vacía', "const x = process.env.APP_BASE_URL ? process.env.APP_BASE_URL : '';"],
    ['template vacío', 'const x = process.env.APP_BASE_URL ? process.env.APP_BASE_URL : ``;'],
    [
      'acceso por corchete',
      "const x = process.env['APP_BASE_URL'] ? process.env['APP_BASE_URL'] : '';",
    ],
    // Las dos orientaciones invertidas: la lectura queda en el `alternate` y
    // el vacío en el `consequent`. Invertir la condición es un token de
    // diferencia, y la forma con `=== undefined` es la que produce
    // mecánicamente una limpieza de `strict-boolean-expressions`.
    ['condición negada', "const x = !process.env.APP_BASE_URL ? '' : process.env.APP_BASE_URL;"],
    [
      'comparación con undefined',
      "const x = process.env.APP_BASE_URL === undefined ? '' : process.env.APP_BASE_URL;",
    ],
    [
      'negada con corchete sobre env',
      'const x = !process["env"].APP_BASE_URL ? `` : process["env"].APP_BASE_URL;',
    ],
  ])('marca el ternario degradante (%s)', async (_caso, codigo) => {
    // El ternario no es exótico: el idiom ya vive en `shared.module.ts` para
    // STORAGE_DIR (ahí con `undefined`, que sí es legítimo).
    const resultados = await lintear(codigo);

    expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
  });

  it.each(RUTAS_POR_BLOQUE)(
    'rige en el bloque de %s, no solo en el base de `src/`',
    async (_extension, rutaArchivo) => {
      // Sin un caso POR BLOQUE, alguien podía borrar la regla de los bloques
      // no cubiertos y la suite seguía en verde: el spec lintaba siempre bajo
      // un `filePath` de `src/`, así que solo probaba ese bloque de la config.
      const resultados = await lintear(degradacionAVacio('??', 'punto'), rutaArchivo);

      expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
    },
  );

  it('NO marca un ternario con `undefined`, que es un default legítimo', async () => {
    const resultados = await lintear(
      'const x = process.env.STORAGE_DIR ? process.env.STORAGE_DIR : undefined;',
    );

    expect(tieneViolacionDeLaRegla(resultados)).toBe(false);
  });

  it('NO marca un ternario que arma una etiqueta a partir de un flag', async () => {
    // El consequent no es la lectura de env: no es esta enfermedad.
    const resultados = await lintear("const x = process.env.FLAG ? 'si' : '';");

    expect(tieneViolacionDeLaRegla(resultados)).toBe(false);
  });

  it('NO marca un default legítimo (no vacío)', async () => {
    const resultados = await lintear(
      "const x = process.env.APP_BASE_URL ?? 'http://localhost:5173';",
    );

    expect(tieneViolacionDeLaRegla(resultados)).toBe(false);
  });

  it('NO marca un default numérico legítimo', async () => {
    const resultados = await lintear('const x = process.env.PORT ?? 3000;');

    expect(tieneViolacionDeLaRegla(resultados)).toBe(false);
  });

  it('NO marca el árbol ya migrado (lectura desde `entorno`, no desde `process.env`)', async () => {
    const resultados = await lintear('const x = entorno.APP_BASE_URL;');

    expect(tieneViolacionDeLaRegla(resultados)).toBe(false);
  });
});
