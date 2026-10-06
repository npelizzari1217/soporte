/**
 * Política de notificación de transiciones de estado (ADR-6).
 *
 * Determina qué estados DESTINO disparan la emisión de `TicketEstadoCambiado`
 * (T13) al transicionar. Función pura, dominio sin Prisma/NestJS.
 *
 * El envío real de email es Fase 4 — acá SÓLO se decide si corresponde
 * emitir el evento de dominio.
 *
 * Ref spec: sdd/tickets-core/spec T13. Ref design: ADR-6. Tarea: T7.1.
 */
// ESPERANDO_CLIENTE (sdd/sla-primera-respuesta-y-pausa, ADR-5): al entrar a la espera el solicitante
// recibe un mail. Salir de la espera hacia EN_PROCESO no es notificable, así que no envía el de espera.
const ESTADOS_NOTIFICABLES = new Set<string>(['RESUELTO', 'CERRADO', 'ESPERANDO_CLIENTE']);

/**
 * @param codigo Código semántico del estado destino (ej. "RESUELTO").
 * @returns `true` si la transición a ese estado debe notificarse.
 */
export function esEstadoNotificable(codigo: string): boolean {
  return ESTADOS_NOTIFICABLES.has(codigo);
}
