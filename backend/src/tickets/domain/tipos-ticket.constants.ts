/**
 * Códigos FIJOS de tipos_ticket compartidos entre módulos (dominio de
 * tickets). Constante única para evitar duplicar el string literal en cada
 * consumidor (preventivo, SLA, seeder de tenants).
 *
 * Ref issue: #135 — el preventivo dejó de reusar el tipo `MANTENIMIENTO` de
 * EDILICIA y tiene su propio tipo `PREVENTIVO`, para que sus tickets no
 * entren en `cumplimientoSla`.
 */

/** Código FIJO del tipo de ticket que genera el barrido de mantenimiento preventivo. */
export const TIPO_CODIGO_PREVENTIVO = 'PREVENTIVO';
