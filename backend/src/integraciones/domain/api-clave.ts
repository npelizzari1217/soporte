/**
 * Permisos que puede llevar una clave de la API publica. Es un vocabulario propio de la clave: el
 * modulo TICKETS salio de la matriz de permisos de usuarios (odd/permisos-por-tipo-ticket, T9b) y
 * las claves conservan estos codigos (L50.3). Transicionar, asignar, equipos y compras quedan fuera
 * de la API.
 */
export const PERMISOS_API = ['TICKETS:LECTURA', 'TICKETS:ALTAS', 'TICKETS:COMENTAR'] as const;

export type PermisoApi = (typeof PERMISOS_API)[number];

/** Indica si un valor cualquiera es un permiso permitido para una clave. */
export function esPermisoApi(valor: unknown): valor is PermisoApi {
  return typeof valor === 'string' && (PERMISOS_API as readonly string[]).includes(valor);
}

/** Clave de API ya persistida. Nunca contiene la clave en claro, solo su sha256. */
export interface ApiClave {
  id: string;
  clienteId: string;
  /** Usuario de integracion en cuyo nombre actua la clave. */
  usuarioId: string;
  nombre: string;
  /** Primeros caracteres de la clave, visibles en la UI. */
  prefijo: string;
  /** sha256 hexadecimal de la clave completa. */
  hash: string;
  permisos: PermisoApi[];
  creadaPorId: string;
  creadaAt: Date;
  ultimoUsoAt: Date | null;
  revocadaAt: Date | null;
}

/** Datos para emitir una clave nueva. */
export type NuevaApiClave = Pick<
  ApiClave,
  'clienteId' | 'usuarioId' | 'nombre' | 'prefijo' | 'hash' | 'permisos' | 'creadaPorId'
>;
