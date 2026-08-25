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
 * Arma una degradación a string vacío, sin escribir el literal prohibido en el
 * código fuente de este archivo.
 *
 * @param operador Operador que aplica el default.
 * @param forma Cómo se llega a `process.env` y cómo se escribe el vacío.
 * @returns Una línea de código con el patrón que la regla tiene que marcar.
 */
function degradacionAVacio(
  operador: '??' | '||',
  forma: 'punto' | 'corchete' | 'template' | 'encadenado',
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
  }
}

async function lintear(codigo: string): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '../..') });
  return eslint.lintText(codigo, { filePath: RUTA_ARCHIVO_REAL });
}

function tieneViolacionDeLaRegla(resultados: ESLint.LintResult[]): boolean {
  return resultados.some((r) => r.messages.some((m) => m.ruleId === 'no-restricted-syntax'));
}

describe('regla no-restricted-syntax: degradación de env a string vacío', () => {
  const OPERADORES = ['??', '||'] as const;
  const FORMAS = ['punto', 'corchete', 'template', 'encadenado'] as const;

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
