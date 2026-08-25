/**
 * validar-entorno.ts — validación pura del contrato de entorno requerido.
 *
 * Ref spec: REQ-1, REQ-2. Ref design: ADR-E3 (calca la separación puro/adaptador
 * de `scripts/lib/guardarrail-host.mjs`).
 * Ref tasks: WU-1 1.3.
 *
 * PURO por construcción: ninguna función de este módulo toca `process.env` ni
 * el filesystem. El adaptador (`entorno.ts`) es el único punto que lee el
 * mundo real y le pasa un mapa ya armado — eso es lo que hace testeable el
 * corte sin depender de mutar variables globales del proceso.
 */

/** Variables de entorno requeridas para que el proceso pueda arrancar. */
export const VARIABLES_REQUERIDAS = ['DATABASE_URL_MASTER', 'APP_BASE_URL', 'JWT_SECRET'] as const;

export type VariableRequerida = (typeof VARIABLES_REQUERIDAS)[number];

/** Entorno ya validado: exactamente las 3 claves requeridas, con valor no vacío. */
export type EntornoRequerido = Record<VariableRequerida, string>;

/**
 * Una variable requerida ausente o vacía. Solo lleva la clave: el texto que ve
 * el operador lo arma `ErrorEntornoInvalido` a partir de todas las violaciones
 * juntas, así que un mensaje por violación sería una segunda fuente de verdad
 * que nadie lee.
 */
export interface Violacion {
  clave: VariableRequerida;
}

/**
 * ¿El valor de una variable requerida cuenta como "ausente"? Ausente, cadena
 * vacía y solo-espacios se tratan igual (REQ-2): un valor vacío llegaría
 * intacto hasta el punto de consumo y degradaría en silencio.
 */
function estaAusente(valor: string | undefined): boolean {
  return valor === undefined || valor.trim() === '';
}

/**
 * Valida un mapa de entorno contra `VARIABLES_REQUERIDAS`. Nunca lanza:
 * devuelve las violaciones encontradas para que el llamador decida qué hacer
 * (calca `auditarEntorno` de `guardarrail-host.mjs`).
 * @param env Mapa de variables de entorno a validar (no necesariamente `process.env`).
 * @returns Una violación por cada variable requerida ausente o vacía.
 */
export function validarEntorno(env: Record<string, string | undefined>): Violacion[] {
  const violaciones: Violacion[] = [];
  for (const clave of VARIABLES_REQUERIDAS) {
    if (estaAusente(env[clave])) {
      violaciones.push({ clave });
    }
  }
  return violaciones;
}

/**
 * Error de arranque: una o más variables de entorno requeridas faltan o están
 * vacías. El mensaje nombra la(s) variable(s), NUNCA su valor — evita que un
 * secreto termine en un log de arranque.
 */
export class ErrorEntornoInvalido extends Error {
  readonly violaciones: readonly Violacion[];

  constructor(violaciones: Violacion[]) {
    const claves = violaciones.map((v) => v.clave).join(', ');
    super(`[config-entorno] Falta configurar: ${claves}`);
    this.name = 'ErrorEntornoInvalido';
    this.violaciones = violaciones;
    // Fix para el prototype chain en TypeScript cuando se extiende Error.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lee una variable YA validada como presente y la devuelve sin espacios al
 * borde. `estaAusente` trimea para decidir presencia; guardar el valor con el
 * padding intacto lo dejaría viajar hasta el punto de consumo — una
 * `APP_BASE_URL` con espacios termina interpolada en los links de los mails.
 * @param env Mapa de variables de entorno ya validado.
 * @param clave Variable requerida a leer.
 * @throws {ErrorEntornoInvalido} Defensivo: inalcanzable si `validarEntorno` ya pasó.
 */
function leerValidada(env: Record<string, string | undefined>, clave: VariableRequerida): string {
  const valor = env[clave];
  if (valor === undefined) {
    throw new ErrorEntornoInvalido([{ clave }]);
  }
  return valor.trim();
}

/**
 * Valida `env` y devuelve el entorno requerido ya congelado, o lanza
 * `ErrorEntornoInvalido` nombrando todas las variables faltantes.
 *
 * Las 3 claves van escritas una por una a propósito, sin aserción de tipo: si
 * alguien agrega una variable a `VARIABLES_REQUERIDAS`, `EntornoRequerido`
 * crece y este literal deja de compilar. Un `{} as EntornoRequerido` armado en
 * un loop se habría quedado callado ante esa misma deriva.
 * @param env Mapa de variables de entorno a validar (no necesariamente `process.env`).
 * @throws {ErrorEntornoInvalido} Si falta o está vacía alguna variable requerida.
 */
export function construirEntorno(
  env: Record<string, string | undefined>,
): Readonly<EntornoRequerido> {
  const violaciones = validarEntorno(env);
  if (violaciones.length > 0) {
    throw new ErrorEntornoInvalido(violaciones);
  }

  return Object.freeze({
    DATABASE_URL_MASTER: leerValidada(env, 'DATABASE_URL_MASTER'),
    APP_BASE_URL: leerValidada(env, 'APP_BASE_URL'),
    JWT_SECRET: leerValidada(env, 'JWT_SECRET'),
  });
}
