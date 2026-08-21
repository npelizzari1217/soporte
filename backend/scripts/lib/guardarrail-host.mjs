// Guardarraíl de host: ningún test ni comando de regeneración se conecta o
// muta una base fuera de localhost/127.0.0.1/::1.
//
// Ref spec: sdd/regeneracion-reproducible, spec "guardarrail-host-bd".
// Ref design: sdd/regeneracion-reproducible D1-D3.
//
// PURO por construcción: ninguna función de este módulo toca `process.env`
// ni el filesystem. Los puntos de entrada (globalSetup de Vitest, CLI de
// `regenerar-entorno.mjs`) son los que leen el mundo y le pasan mapas ya
// armados — eso es lo que hace testeable el corte sin conectarse a nada y
// sin recursión (ver D2).
//
// Decisión de producto CERRADA: sin escape hatch. No hay variable de
// entorno, flag ni modo "solo advertir" que desarme este freno. La forma en
// que se logra es estructural: `asegurarHostLocal` ni siquiera lee
// `process.env`, así que no hay ningún nombre de variable que pueda
// inspeccionar para saltearse.

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1']);

/** Clave de entorno que se considera una URL de base de datos por su nombre. */
const PATRON_CLAVE_BD = /^DATABASE_URL/i;

/** Valor que se considera una URL de base de datos por su forma, aunque la clave no matchee. */
const PATRON_VALOR_BD = /^postgres(ql)?:\/\//i;

/**
 * Error del guardarraíl: un host rechazado o una URL que no se pudo
 * interpretar (fail-closed). El mensaje siempre nombra el host y el
 * `contexto` recibido — el llamador compone ahí el origen (`.env` o
 * variable de sesión) para que el mensaje sea accionable.
 */
export class ErrorHostNoLocal extends Error {
  /**
   * @param {string} host Host rechazado, o la URL cruda si no se pudo parsear.
   * @param {string} contexto Descripción de dónde viene la URL (clave + origen).
   */
  constructor(host, contexto) {
    super(
      `Host no local rechazado por el guardarraíl (${contexto}): "${host}". ` +
        'Solo se permite localhost, 127.0.0.1 o ::1 — sin excepción.',
    );
    this.name = 'ErrorHostNoLocal';
    this.host = host;
    this.contexto = contexto;
  }
}

/**
 * ¿El hostname (ya extraído de una URL) es local? Acepta la forma con o sin
 * corchetes de IPv6 (`::1` y `[::1]`).
 * @param {unknown} hostname
 * @returns {boolean}
 */
export function esHostLocal(hostname) {
  if (typeof hostname !== 'string') return false;
  const normalizado = hostname.replace(/^\[|\]$/g, '');
  return HOSTS_LOCALES.has(normalizado);
}

/**
 * Aborta si el host de `url` no es local. Fail-closed: una URL que no se
 * puede parsear también aborta (no "no entendí, dejo pasar").
 * @param {string} url
 * @param {string} contexto Texto libre para el mensaje de error (clave + origen).
 * @throws {ErrorHostNoLocal}
 */
export function asegurarHostLocal(url, contexto) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new ErrorHostNoLocal(String(url), contexto);
  }
  if (!esHostLocal(parsed.hostname)) {
    throw new ErrorHostNoLocal(parsed.hostname, contexto);
  }
}

/**
 * Redacta la contraseña de una URL de conexión para poder imprimirla sin
 * filtrar el secreto. Ante una URL inválida devuelve un texto de reemplazo
 * en vez de explotar — esta función es de diagnóstico, no de validación.
 * @param {string} url
 * @returns {string}
 */
export function redactarUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(url inválida, no se puede redactar)';
  }
}

/**
 * Extrae de un mapa de variables de entorno las que parecen URLs de base de
 * datos: por nombre de clave (`DATABASE_URL*`) o por forma del valor
 * (`postgres(ql)://`).
 * @param {Record<string, string | undefined>} envMap
 * @returns {Array<{clave: string, valor: string}>}
 */
export function recolectarUrlsDeBd(envMap) {
  const resultado = [];
  for (const [clave, valor] of Object.entries(envMap ?? {})) {
    if (typeof valor !== 'string' || valor.length === 0) continue;
    if (PATRON_CLAVE_BD.test(clave) || PATRON_VALOR_BD.test(valor)) {
      resultado.push({ clave, valor });
    }
  }
  return resultado;
}

/**
 * Clasifica el origen de una clave según en qué mapa esté presente. La
 * combinación "en ambos" es el modo de falla real que motivó este
 * guardarraíl: `dotenv`/`process.loadEnvFile` no pisan una variable ya
 * presente en el shell, así que el valor efectivo termina siendo el del
 * shell aunque `.env` diga otra cosa.
 * @param {boolean} enShell
 * @param {boolean} enArchivo
 * @returns {'sesión de shell' | 'archivo .env' | 'sesión de shell (PISA a .env)' | 'desconocido'}
 */
export function clasificarOrigen(enShell, enArchivo) {
  if (enShell && enArchivo) return 'sesión de shell (PISA a .env)';
  if (enShell) return 'sesión de shell';
  if (enArchivo) return 'archivo .env';
  return 'desconocido';
}

/**
 * Audita todas las URLs de base de datos encontradas en `envProceso` y
 * `envArchivo`, clasifica su origen y valida cada una con
 * `asegurarHostLocal`. NUNCA lanza: devuelve hallazgos y violaciones para
 * que el llamador (el adaptador que sí puede cortar la corrida) decida qué
 * hacer. Pura: no toca `process.env` ni el filesystem, ambos mapas ya
 * vienen armados por quien la invoca.
 * @param {{envProceso?: Record<string, string | undefined>, envArchivo?: Record<string, string | undefined>, rutaArchivo?: string}} entrada
 * @returns {{
 *   hallazgos: Array<{clave: string, host: string | null, origen: string, urlRedactada: string, ok: boolean}>,
 *   violaciones: Array<{clave: string, origen: string, mensaje: string}>,
 * }}
 */
export function auditarEntorno({ envProceso = {}, envArchivo = {} } = {}) {
  const urlsShell = recolectarUrlsDeBd(envProceso);
  const urlsArchivo = recolectarUrlsDeBd(envArchivo);

  const claves = new Set([
    ...urlsShell.map((u) => u.clave),
    ...urlsArchivo.map((u) => u.clave),
  ]);

  const hallazgos = [];
  const violaciones = [];

  for (const clave of claves) {
    const enShell = urlsShell.find((u) => u.clave === clave);
    const enArchivo = urlsArchivo.find((u) => u.clave === clave);
    const origen = clasificarOrigen(Boolean(enShell), Boolean(enArchivo));
    // Valor efectivo: el del shell si está en ambos (dotenv no pisa lo ya presente).
    const valorEfectivo = enShell ? enShell.valor : enArchivo.valor;
    const contexto = `${clave} (${origen})`;

    let host = null;
    try {
      host = new URL(valorEfectivo).hostname.replace(/^\[|\]$/g, '');
    } catch {
      // Se reporta más abajo como violación (URL inválida = fail-closed).
    }

    let ok = true;
    let mensaje;
    try {
      asegurarHostLocal(valorEfectivo, contexto);
    } catch (error) {
      ok = false;
      mensaje = error.message;
    }

    hallazgos.push({ clave, host, origen, urlRedactada: redactarUrl(valorEfectivo), ok });
    if (!ok) violaciones.push({ clave, origen, mensaje });
  }

  return { hallazgos, violaciones };
}
