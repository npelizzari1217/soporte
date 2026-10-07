/** Constantes de la verificacion en dos pasos (sdd/verificacion-dos-pasos). */
const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

/** Desafio de login comun (T1). */
export const DESAFIO_DURACION_MS = 5 * MINUTO_MS;
/** Desafio de enrolamiento forzado: da tiempo a instalar la app (I1). */
export const DESAFIO_ENROLAMIENTO_DURACION_MS = 15 * MINUTO_MS;
/** Ticket posterior a la verificacion, para elegir cliente (L7). */
export const TICKET_DURACION_MS = 5 * MINUTO_MS;
/** Dispositivo confiable (T5). */
export const DISPOSITIVO_CONFIABLE_DURACION_MS = 30 * DIA_MS;
/** Ventana del limitador de intentos fallidos (I1). */
export const LIMITADOR_VENTANA_MS = 15 * MINUTO_MS;
/** Maximo de intentos por ventana (I1). */
export const LIMITADOR_MAX_INTENTOS = 5;
