/**
 * regla-env-vacio.lint.spec.ts — TDD RED phase (WU-4, sdd/fail-fast-env).
 *
 * Ref spec: REQ-9. Ref design: ADR-E4 (regla `no-restricted-syntax`, no un
 * plugin propio). Ref tasks: WU-4. Ref fix: issue #122 (falso negativo bajo
 * `CI=true`).
 *
 * Prueba programática de la regla de ESLint contra el `eslint.config.js`
 * real del proyecto, no una copia del selector en este archivo — así un
 * cambio accidental en la config real hace fallar este test, no solo una
 * verificación manual que nadie vuelve a correr.
 *
 * `lintear()` escribe el snippet en un ARCHIVO REAL de disco y lo lintea
 * invocando el BINARIO de ESLint como proceso hijo (`node_modules/.bin/eslint
 * --format json`) — NUNCA `ESLint#lintText` ni `ESLint#lintFiles` de la API
 * en proceso. Bajo `CI=true` (exactamente ese string) se probaron las tres
 * formas y solo esta funciona en TODOS los casos; las otras dos fallan de
 * maneras distintas, siempre en el mismo proceso Node de Vitest:
 *
 * - `lintText(codigo, {filePath})`: con un `filePath` que cae en un bloque
 *   con `parserOptions.project`, IGNORA el `codigo` recibido y analiza el
 *   archivo de disco en `filePath` — el bug original de este issue. Como
 *   esos archivos reales no contienen el literal prohibido, no había
 *   violación que reportar y el `expect(...).toBe(true)` fallaba.
 * - `lintFiles([rutaTemporal])` con un archivo real, nuevo, en disco:
 *   funciona para la PRIMERA invocación de todo el proceso; en la segunda y
 *   siguientes, `@typescript-eslint/parser` con `parserOptions.project`
 *   devuelve mensajes vacíos o un error fatal "the file was not found in any
 *   of the provided project(s)" para archivos que el proceso no vio antes de
 *   resolver el proyecto por primera vez — ni reusar el mismo path entre
 *   llamadas ni pre-crear todos los paths antes del primer lint alcanzan a
 *   evitarlo en los 25 casos de este archivo (quedó verificado a mano).
 *
 * Invocar el binario evita las dos trampas de arriba porque corre en un
 * proceso Node NUEVO, sin ningún cache de `@typescript-eslint/parser`
 * heredado del proceso de Vitest — el mismo motivo por el que
 * `npx eslint <archivo-real>` bajo `CI=true` SIEMPRE reportó bien la
 * violación durante el diagnóstico de este issue.
 *
 * El arranque de ESLint se paga UNA sola vez: el `beforeAll` lintea los 25
 * casos juntos, en una única invocación con 25 archivos temporales, y cada
 * `it` lee su resultado del lote. Una invocación por caso costaba 130 s en
 * este archivo; el lote cuesta un arranque. Es lo mismo que hace `eslint .`
 * en la compuerta real: un proceso, muchos archivos.
 *
 * El patrón prohibido viaja como string armado en runtime (no como literal
 * `?? ''` escrito en este archivo) para que este mismo spec no se autodenuncie
 * bajo la regla que está probando.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ESLint } from 'eslint';

/**
 * Este spec lintea con el BINARIO de ESLint como proceso hijo. El lote de
 * `beforeAll` paga ese arranque UNA vez para todos los casos que estan en
 * `TODOS_LOS_CASOS`, pero unos pocos tests no pueden entrar al lote porque
 * necesitan su propia invocacion (escriben un archivo temporal con una
 * extension o un nombre que el lote no puede derivar de `rutaArchivo`): el
 * control del `.spec.ts` y los tres de `scripts/migrate-tenants*.js`. Esos
 * pagan ~1-5 s cada uno, y con el `testTimeout` default de 5000 ms quedaban a
 * ~250 ms del limite: bajo la suite completa lo cruzaban y volvian rojo el
 * `pnpm test` de CUALQUIER ciclo del repo (verify de
 * `repuestos-autoridad-catalogo`, 2026-09-15). El margen va aca, no en el
 * `vitest.config.ts`, para no aflojar el limite del resto de la suite.
 */
vi.setConfig({ testTimeout: 30_000 });

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

const RUTA_BACKEND = path.resolve(__dirname, '../..');
const BIN_ESLINT = path.join(RUTA_BACKEND, 'node_modules', '.bin', 'eslint');
const PREFIJO_TEMPORAL = 'lintear-tmp-';

const OPERADORES = ['??', '||'] as const;
const FORMAS = ['punto', 'corchete', 'template', 'encadenado', 'env-por-corchete'] as const;

/** Los 10 casos `operador × forma`, la fuente de la que salen los `it.each`. */
const CASOS_OPERADOR_FORMA = OPERADORES.flatMap((operador) =>
  FORMAS.map((forma) => [operador, forma] as const),
);

/** Los 6 ternarios degradantes. El idiom ya vive en `shared.module.ts`. */
const CASOS_TERNARIO: ReadonlyArray<readonly [string, string]> = [
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
];

/**
 * Los snippets que NO deben marcarse. Viven acá arriba, y no dentro de cada
 * `it`, porque el lote de más abajo necesita conocerlos ANTES de correr: son
 * parte de la misma invocación única de ESLint.
 */
const NEGATIVOS = {
  ternarioConUndefined: 'const x = process.env.STORAGE_DIR ? process.env.STORAGE_DIR : undefined;',
  etiquetaDesdeFlag: "const x = process.env.FLAG ? 'si' : '';",
  defaultNoVacio: "const x = process.env.APP_BASE_URL ?? 'http://localhost:5173';",
  defaultNumerico: 'const x = process.env.PORT ?? 3000;',
  arbolYaMigrado: 'const x = entorno.APP_BASE_URL;',
} as const;

/**
 * Archivos reales bajo cuyo directorio se evalúan los casos del selector de
 * `new Pool(` (ADR-1 de sdd/sesion-utc-y-backfill-de-fechas). Viven ACÁ ARRIBA,
 * no dentro de su `describe`, porque `TODOS_LOS_CASOS` los necesita ANTES de
 * correr: son parte de la misma invocación única de ESLint. Declararlos
 * adentro fue lo que dejó a esos tests en el camino lento.
 */
const ARCHIVO_PRODUCCION_CUBIERTO = path.resolve(
  __dirname,
  '../shared/infrastructure/persistence/prisma.service.ts',
);
const ARCHIVO_POSTGRES_ADMIN = path.resolve(
  __dirname,
  '../clientes/infrastructure/postgres-admin.service.ts',
);
const ARCHIVO_TENANT_SEEDER = path.resolve(
  __dirname,
  '../clientes/infrastructure/tenant-seeder.adapter.ts',
);
const SNIPPET_POOL = 'const x = new Pool({});';

/** Un caso a lintear: el snippet y el archivo real bajo cuyo directorio se evalúa. */
type CasoALintear = { readonly codigo: string; readonly rutaArchivo: string };

/**
 * TODOS los casos del archivo, en una sola lista. Se arma con los mismos
 * datos que consumen los `it.each` de abajo, así que no hay una segunda
 * fuente de verdad que pueda quedar desincronizada: si un `it` linteara algo
 * que no está acá, el lote no lo cubre y `lintear()` cae al camino lento
 * (correcto, solo más caro), nunca a un resultado equivocado.
 */
const TODOS_LOS_CASOS: readonly CasoALintear[] = [
  ...CASOS_OPERADOR_FORMA.map(([operador, forma]) => ({
    codigo: degradacionAVacio(operador, forma),
    rutaArchivo: RUTA_ARCHIVO_REAL,
  })),
  ...CASOS_TERNARIO.map(([, codigo]) => ({ codigo, rutaArchivo: RUTA_ARCHIVO_REAL })),
  ...RUTAS_POR_BLOQUE.map(([, rutaArchivo]) => ({
    codigo: degradacionAVacio('??', 'punto'),
    rutaArchivo,
  })),
  ...Object.values(NEGATIVOS).map((codigo) => ({ codigo, rutaArchivo: RUTA_ARCHIVO_REAL })),
  // Casos del selector de `new Pool(` que pasan por `lintear()`. Sin estas
  // cuatro entradas caen al camino lento y pagan ~4,75 s de arranque de ESLint
  // cada uno — ver el comentario de `vi.setConfig` arriba.
  { codigo: SNIPPET_POOL, rutaArchivo: ARCHIVO_PRODUCCION_CUBIERTO },
  { codigo: degradacionAVacio('??', 'punto'), rutaArchivo: ARCHIVO_PRODUCCION_CUBIERTO },
  { codigo: SNIPPET_POOL, rutaArchivo: ARCHIVO_POSTGRES_ADMIN },
  { codigo: SNIPPET_POOL, rutaArchivo: ARCHIVO_TENANT_SEEDER },
];

function claveDe(codigo: string, rutaArchivo: string): string {
  return `${rutaArchivo} ${codigo}`;
}

/**
 * Ruta del archivo temporal para un caso. Vive en el MISMO directorio que
 * `rutaArchivo` y con su MISMA extensión, para que lo cubra el mismo bloque
 * de `eslint.config.js` y quede dentro de los `include` de
 * `tsconfig.eslint.json` (son globs sobre `src`, `test` y `scripts`: no hace
 * falta que el archivo preexista). El nombre no lleva `.spec.` ni `.test.`
 * para que Vitest no lo recolecte como archivo de test.
 */
function rutaTemporalPara(rutaArchivo: string): string {
  return path.join(
    path.dirname(rutaArchivo),
    `${PREFIJO_TEMPORAL}${randomBytes(6).toString('hex')}${path.extname(rutaArchivo)}`,
  );
}

/**
 * Corre el binario de ESLint contra archivos reales y devuelve el mismo
 * shape que `ESLint#lintFiles` (`--format json` es exactamente ese array).
 * ESLint sale con código != 0 cuando encuentra errores de lint — el caso
 * ESPERADO para los snippets que violan la regla — así que un exit != 0 con
 * stdout no es una falla de este helper, es el resultado normal.
 */
function lintearConElBinario(rutasArchivo: readonly string[]): ESLint.LintResult[] {
  try {
    const salida = execFileSync(BIN_ESLINT, ['--format', 'json', '--no-color', ...rutasArchivo], {
      cwd: RUTA_BACKEND,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return parsearSalidaDeEslint(salida);
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === 'string' && stdout.length > 0) {
      return parsearSalidaDeEslint(stdout);
    }
    throw error;
  }
}

/**
 * Valida la forma de lo que devuelve el proceso hijo antes de tratarlo como
 * `ESLint.LintResult[]`. `AGENTS.md` prohíbe los casts sin chequear, y acá el
 * dato viene de afuera del proceso: si un día ESLint cambia el formato, un
 * cast silencioso lo convertiría en "sin violación" — el mismo falso verde que
 * este archivo existe para impedir.
 */
function parsearSalidaDeEslint(salida: string): ESLint.LintResult[] {
  const parseado: unknown = JSON.parse(salida);
  if (!Array.isArray(parseado)) {
    throw new Error(`ESLint --format json no devolvió un array: ${salida.slice(0, 200)}`);
  }
  for (const resultado of parseado) {
    const candidato = resultado as { filePath?: unknown; messages?: unknown };
    if (typeof candidato.filePath !== 'string' || !Array.isArray(candidato.messages)) {
      throw new Error(
        `ESLint --format json devolvió un elemento sin \`filePath\`/\`messages\`: ${JSON.stringify(
          resultado,
        ).slice(0, 200)}`,
      );
    }
  }
  return parseado as ESLint.LintResult[];
}

/**
 * Barre temporales que hayan sobrevivido a una corrida anterior. El `finally`
 * de más abajo cubre una excepción, pero NO un SIGKILL (una corrida abortada,
 * un timeout del runner): ahí el archivo queda en el árbol y rompe
 * `pnpm typecheck` y `pnpm build`, que sí lo ven. Barrer al arrancar es la
 * red que el `finally` no puede tender.
 */
function barrerTemporalesHuerfanos(): void {
  const directorios = new Set(TODOS_LOS_CASOS.map((caso) => path.dirname(caso.rutaArchivo)));
  for (const directorio of directorios) {
    for (const nombre of readdirSync(directorio)) {
      if (nombre.startsWith(PREFIJO_TEMPORAL)) {
        rmSync(path.join(directorio, nombre), { force: true });
      }
    }
  }
}

/**
 * Lintea TODOS los casos del archivo en UNA sola invocación de ESLint.
 *
 * Por qué una sola y no una por caso: cada invocación paga el arranque de
 * ESLint más la resolución de `parserOptions.project` (`tsconfig.eslint.json`
 * contra todo el árbol de `src`). Con una invocación por caso este archivo
 * tardaba 130 s; con el lote tarda lo que tarda un solo arranque. Y es
 * exactamente lo que hace `eslint .` en la compuerta real: un proceso,
 * muchos archivos.
 */
function lintearTodo(): Map<string, ESLint.LintResult[]> {
  const temporales = TODOS_LOS_CASOS.map((caso) => ({
    caso,
    rutaTemporal: rutaTemporalPara(caso.rutaArchivo),
  }));
  for (const { caso, rutaTemporal } of temporales) writeFileSync(rutaTemporal, caso.codigo);
  try {
    const resultados = lintearConElBinario(temporales.map((t) => t.rutaTemporal));
    const porRuta = new Map(resultados.map((r) => [path.resolve(r.filePath), r]));
    const porCaso = new Map<string, ESLint.LintResult[]>();
    for (const { caso, rutaTemporal } of temporales) {
      const resultado = porRuta.get(path.resolve(rutaTemporal));
      if (resultado !== undefined) {
        porCaso.set(claveDe(caso.codigo, caso.rutaArchivo), [resultado]);
      }
    }
    return porCaso;
  } finally {
    for (const { rutaTemporal } of temporales) rmSync(rutaTemporal, { force: true });
  }
}

let resultadosDelLote: Map<string, ESLint.LintResult[]> | null = null;

/**
 * Devuelve el resultado de ESLint para un snippet, tomado del lote. Si el
 * caso no estuviera en el lote (alguien agregó un `it` sin sumarlo a
 * `TODOS_LOS_CASOS`), cae al camino de una invocación suelta: más lento,
 * nunca incorrecto.
 *
 * Se lintea un ARCHIVO REAL de disco con el BINARIO de ESLint — nunca
 * `ESLint#lintText` ni `ESLint#lintFiles` de la API en proceso. Ver el
 * comment de la cabecera del archivo: bajo `CI=true` las dos formas en
 * proceso mienten, cada una a su manera.
 *
 * @param codigo Snippet a analizar.
 * @param rutaArchivo Archivo real bajo cuyo directorio se lo evalúa; decide
 *   qué bloque de config aplica. Por defecto, este mismo spec (o sea `src`).
 * @returns Los resultados de ESLint.
 */
function lintear(codigo: string, rutaArchivo: string = RUTA_ARCHIVO_REAL): ESLint.LintResult[] {
  const delLote = resultadosDelLote?.get(claveDe(codigo, rutaArchivo));
  if (delLote !== undefined) return delLote;

  const rutaTemporal = rutaTemporalPara(rutaArchivo);
  writeFileSync(rutaTemporal, codigo);
  try {
    return lintearConElBinario([rutaTemporal]);
  } finally {
    rmSync(rutaTemporal, { force: true });
  }
}

/**
 * ¿Los resultados marcan la regla `no-restricted-syntax`? Ruidoso a propósito
 * ante las DOS formas en que ESLint puede decir "no analicé nada" sin decirlo
 * con esas palabras (ver el comment del archivo):
 *
 * 1. Un mensaje FATAL de parseo (`fatal: true`, ej. "the file was not found
 *    in any of the provided project(s)") — no es una violación de NINGUNA
 *    regla, es que el archivo nunca se analizó.
 * 2. Cero mensajes en TOTAL, de NINGUNA regla — cada snippet de este archivo
 *    declara `const x = ...;` sin usar `x`, así que
 *    `@typescript-eslint/no-unused-vars` SIEMPRE reporta algo; un resultado
 *    sin mensajes solo puede significar que ESLint analizó otra cosa (el
 *    bug de `lintText` original de este issue).
 */
function tieneViolacionDeLaRegla(resultados: ESLint.LintResult[]): boolean {
  const mensajesFatales = resultados.flatMap((r) => r.messages.filter((m) => m.fatal));
  if (mensajesFatales.length > 0) {
    throw new Error(
      `ESLint no pudo analizar el archivo (error fatal de parseo), no es "sin violación": ` +
        mensajesFatales.map((m) => m.message).join(' | '),
    );
  }
  const totalMensajes = resultados.reduce((total, r) => total + r.messages.length, 0);
  if (totalMensajes === 0) {
    throw new Error(
      'ESLint no reportó NINGÚN mensaje (de ninguna regla): esto no es "sin violación", es ' +
        'que no se analizó nada. Ver el comment de `lintear()`/`tieneViolacionDeLaRegla()`.',
    );
  }
  return resultados.some((r) => r.messages.some((m) => m.ruleId === 'no-restricted-syntax'));
}

describe('regla no-restricted-syntax: degradación de env a string vacío', () => {
  // El lote entero corre una sola vez, acá: es el único arranque de ESLint
  // del archivo. El timeout alto es el costo de resolver
  // `parserOptions.project` contra todo el árbol, que se paga UNA vez.
  beforeAll(() => {
    barrerTemporalesHuerfanos();
    resultadosDelLote = lintearTodo();
  }, 120_000);

  afterAll(() => {
    barrerTemporalesHuerfanos();
  });

  it.each(CASOS_OPERADOR_FORMA)(
    'marca la degradación con `%s` en su forma %s',
    (operador, forma) => {
      const resultados = lintear(degradacionAVacio(operador, forma));

      expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
    },
  );

  it.each(CASOS_TERNARIO)('marca el ternario degradante (%s)', (_caso, codigo) => {
    // El ternario no es exótico: el idiom ya vive en `shared.module.ts` para
    // STORAGE_DIR (ahí con `undefined`, que sí es legítimo).
    const resultados = lintear(codigo);

    expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
  });

  it.each(RUTAS_POR_BLOQUE)(
    'rige en el bloque de %s, no solo en el base de `src/`',
    (_extension, rutaArchivo) => {
      // Sin un caso POR BLOQUE, alguien podía borrar la regla de los bloques
      // no cubiertos y la suite seguía en verde: el spec lintaba siempre bajo
      // un `filePath` de `src/`, así que solo probaba ese bloque de la config.
      const resultados = lintear(degradacionAVacio('??', 'punto'), rutaArchivo);

      expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
    },
  );

  it('NO marca un ternario con `undefined`, que es un default legítimo', () => {
    expect(tieneViolacionDeLaRegla(lintear(NEGATIVOS.ternarioConUndefined))).toBe(false);
  });

  it('NO marca un ternario que arma una etiqueta a partir de un flag', () => {
    // El consequent no es la lectura de env: no es esta enfermedad.
    expect(tieneViolacionDeLaRegla(lintear(NEGATIVOS.etiquetaDesdeFlag))).toBe(false);
  });

  it('NO marca un default legítimo (no vacío)', () => {
    expect(tieneViolacionDeLaRegla(lintear(NEGATIVOS.defaultNoVacio))).toBe(false);
  });

  it('NO marca un default numérico legítimo', () => {
    expect(tieneViolacionDeLaRegla(lintear(NEGATIVOS.defaultNumerico))).toBe(false);
  });

  it('NO marca el árbol ya migrado (lectura desde `entorno`, no desde `process.env`)', () => {
    expect(tieneViolacionDeLaRegla(lintear(NEGATIVOS.arbolYaMigrado))).toBe(false);
  });
});

/**
 * `new Pool(` fuera del helper `conUtc()` — WU1 (sdd/sesion-utc-y-backfill-de-fechas),
 * ADR-1. Bloque NUEVO en `eslint.config.js`, agregado el mismo día que este:
 * mismo criterio que arriba (archivo real de disco + binario de ESLint), pero
 * los casos de acá NO están en `TODOS_LOS_CASOS`/`lintearTodo()` — `lintear()`
 * cae a su camino lento (una invocación suelta por caso), documentado como
 * correcto, solo más caro. Sumarlos al lote no vale la pena por 3 casos.
 *
 * El caso de exención de `*.spec.ts` NO puede usar `lintear()`: esa función
 * arma el nombre temporal con `path.extname(rutaArchivo)`, que para
 * `algo.spec.ts` devuelve solo `.ts` (el `extname` de Node corta en el
 * ÚLTIMO punto) — el temporal quedaría `lintear-tmp-xxxx.ts`, SIN el sufijo
 * `.spec.`, y nunca matchearía el `ignores: ['**‌/*.spec.ts']` del bloque
 * nuevo, sin importar si la regla anda bien o no. Por eso ese caso arma su
 * propio nombre temporal con el sufijo completo.
 */
describe('regla no-restricted-syntax: `new Pool(` fuera del helper conUtc (ADR-1)', () => {
  // Directorio real que SÍ cae bajo el bloque nuevo (`src/**/*.ts`, sin estar
  // en sus `ignores`): el de `prisma.service.ts`, ya migrado a `conUtc()`.
  // Nunca el de este propio spec (`src/config/`, que no está en `ignores`
  // tampoco — pero probar ahí mezclaría de dónde sale la cobertura real).

  function marcaPoolFueraDelHelper(resultados: ESLint.LintResult[]): boolean {
    return resultados.some((r) =>
      r.messages.some((m) => m.ruleId === 'no-restricted-syntax' && /pg\.Pool/.test(m.message)),
    );
  }

  it('marca `new Pool(` en un archivo de producción cubierto por el bloque nuevo', () => {
    const resultados = lintear(SNIPPET_POOL, ARCHIVO_PRODUCCION_CUBIERTO);

    expect(marcaPoolFueraDelHelper(resultados)).toBe(true);
  });

  it('NO marca `new Pool(` en un `*.spec.ts` (ADR-7: los specs de round-trip abren pg crudo a propósito)', () => {
    const rutaTemporalSpec = path.join(
      path.dirname(ARCHIVO_PRODUCCION_CUBIERTO),
      `${PREFIJO_TEMPORAL}${randomBytes(6).toString('hex')}.spec.ts`,
    );
    writeFileSync(rutaTemporalSpec, SNIPPET_POOL);
    try {
      const resultados = lintearConElBinario([rutaTemporalSpec]);
      expect(marcaPoolFueraDelHelper(resultados)).toBe(false);
    } finally {
      rmSync(rutaTemporalSpec, { force: true });
    }
  });

  it('la regla de env vacío SIGUE marcando en el mismo bloque (CUPO DE UNO: sumar el selector de Pool no la borró)', () => {
    const resultados = lintear(degradacionAVacio('??', 'punto'), ARCHIVO_PRODUCCION_CUBIERTO);

    expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
  });

  // WU2 (sdd/sesion-utc-y-backfill-de-fechas, tareas 2.2-2.4): estos dos
  // archivos SALIERON de los `ignores` del bloque de `src/**/*.ts` al migrar
  // a `conUtc()` — si alguien los vuelve a agregar a `ignores` sin migrarlos
  // de nuevo, este test se pone rojo.

  it('marca `new Pool(` en postgres-admin.service.ts (WU2 2.2: ya no está en `ignores`)', () => {
    const resultados = lintear(SNIPPET_POOL, ARCHIVO_POSTGRES_ADMIN);

    expect(marcaPoolFueraDelHelper(resultados)).toBe(true);
  });

  it('marca `new Pool(` en tenant-seeder.adapter.ts (WU2 2.3: ya no está en `ignores`)', () => {
    const resultados = lintear(SNIPPET_POOL, ARCHIVO_TENANT_SEEDER);

    expect(marcaPoolFueraDelHelper(resultados)).toBe(true);
  });
});

/**
 * `new Pool(` fuera del helper conUtc en `scripts/migrate-tenants.js` — WU2
 * (sdd/sesion-utc-y-backfill-de-fechas), tarea 2.4, ADR-1. Bloque NUEVO en
 * `eslint.config.js` (`files: ['scripts/migrate-tenants*.js']`), DESPUÉS del
 * bloque general de `scripts/**‌/*.js` para sobrescribirlo solo en este
 * archivo — ver el comment de ese bloque.
 *
 * El glob usa un SUFIJO (`migrate-tenants*.js`), no el nombre literal, para
 * que un archivo temporal real (`migrate-tenants-tmp-<hex>.js`, en el MISMO
 * directorio que el script de producción) matchee el bloque específico sin
 * tocar el archivo real — mismo motivo que el caso `.spec.ts` de arriba: acá
 * tampoco alcanza `lintear()` (que arma el temporal a partir de
 * `path.extname()`, sin el prefijo del nombre), así que arma su propio
 * archivo temporal con el prefijo correcto.
 */
describe('regla no-restricted-syntax: `new Pool(` + env vacío en scripts/migrate-tenants.js (WU2 2.4, ADR-1)', () => {
  const ARCHIVO_MIGRATE_TENANTS = path.resolve(__dirname, '../../scripts/migrate-tenants.js');
  const SNIPPET_POOL_CJS = 'const x = new Pool({});';

  function marcaPoolFueraDelHelper(resultados: ESLint.LintResult[]): boolean {
    return resultados.some((r) =>
      r.messages.some((m) => m.ruleId === 'no-restricted-syntax' && /pg\.Pool/.test(m.message)),
    );
  }

  function rutaTemporalMigrateTenants(): string {
    return path.join(
      path.dirname(ARCHIVO_MIGRATE_TENANTS),
      `migrate-tenants-tmp-${randomBytes(6).toString('hex')}.js`,
    );
  }

  it('marca `new Pool(` en el bloque específico de migrate-tenants.js', () => {
    const rutaTemporal = rutaTemporalMigrateTenants();
    writeFileSync(rutaTemporal, SNIPPET_POOL_CJS);
    try {
      const resultados = lintearConElBinario([rutaTemporal]);
      expect(marcaPoolFueraDelHelper(resultados)).toBe(true);
    } finally {
      rmSync(rutaTemporal, { force: true });
    }
  });

  it('la regla de env vacío SIGUE marcando en ese mismo bloque (CUPO DE UNO: sumar el selector de Pool no la borró)', () => {
    const rutaTemporal = rutaTemporalMigrateTenants();
    writeFileSync(rutaTemporal, degradacionAVacio('??', 'punto'));
    try {
      const resultados = lintearConElBinario([rutaTemporal]);
      expect(tieneViolacionDeLaRegla(resultados)).toBe(true);
    } finally {
      rmSync(rutaTemporal, { force: true });
    }
  });

  it('un script `scripts/` cualquiera (fuera del prefijo `migrate-tenants`) NO cae bajo este bloque específico', () => {
    // Control negativo: prueba que el glob de sufijo no se filtró al bloque
    // general de `scripts/**/*.js` — un archivo temporal SIN el prefijo
    // `migrate-tenants` (mismo nombre que usa el resto de este spec para
    // otros bloques) no debe marcar Pool, solo env vacío.
    const rutaTemporal = path.join(
      path.dirname(ARCHIVO_MIGRATE_TENANTS),
      `lintear-tmp-${randomBytes(6).toString('hex')}.js`,
    );
    writeFileSync(rutaTemporal, SNIPPET_POOL_CJS);
    try {
      const resultados = lintearConElBinario([rutaTemporal]);
      expect(marcaPoolFueraDelHelper(resultados)).toBe(false);
    } finally {
      rmSync(rutaTemporal, { force: true });
    }
  });
});
