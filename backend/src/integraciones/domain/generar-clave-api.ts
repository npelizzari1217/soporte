import { createHash, randomBytes } from 'node:crypto';

/** Prefijo reconocible de toda clave de la API (facilita detectarlas en repositorios filtrados). */
export const PREFIJO_CLAVE_API = 'sop_';
/** Largo del prefijo guardado y mostrado: `sop_` mas 8 caracteres aleatorios. */
const LARGO_PREFIJO_VISIBLE = PREFIJO_CLAVE_API.length + 8;

export interface ClaveApiGenerada {
  /** Clave en claro: se muestra una sola vez y no se persiste. */
  clave: string;
  prefijo: string;
  /** sha256 hexadecimal de la clave completa. */
  hash: string;
}

/** sha256 hexadecimal de una clave, para buscarla por hash. */
export function hashearClaveApi(clave: string): string {
  return createHash('sha256').update(clave).digest('hex');
}

/** Genera una clave con 32 bytes aleatorios en base64url (256 bits), su prefijo visible y su hash. */
export function generarClaveApi(): ClaveApiGenerada {
  const clave = `${PREFIJO_CLAVE_API}${randomBytes(32).toString('base64url')}`;
  return { clave, prefijo: clave.slice(0, LARGO_PREFIJO_VISIBLE), hash: hashearClaveApi(clave) };
}
