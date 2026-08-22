import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio del módulo `reparaciones/` (Fase 3, F3-E1..E5).
 *
 * Mismo patrón que `compras/domain/errors/compras.errors.ts`: cada error
 * extiende `DomainError`, expone un `code` estable y se modela con
 * `Result.fail()` — nunca `throw` para fallos esperados del dominio.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1..E5. Ref design: "Firmas TS
 * clave" (lista de errores de reparaciones.errors.ts). Tarea: T6.6.
 */

/**
 * TicketEdiliciaNoEncontradoError — el satélite `ticket_edilicia` con el
 * id/ticketId indicado no existe (o no fue creado — el ticket puede no ser
 * de tipo EDILICIA).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-E3, F3-E4, F3-E5.
 */
export class TicketEdiliciaNoEncontradoError extends DomainError {
  readonly code = 'TICKET_EDILICIA_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Ticket edilicio con id "${id}" no encontrado.`);
  }
}

/**
 * SubtareaNoEncontradaError — la subtarea edilicia con el id indicado no
 * existe o fue eliminada (soft delete).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-E4, F3-E5.
 */
export class SubtareaNoEncontradaError extends DomainError {
  readonly code = 'SUBTAREA_NO_ENCONTRADA';

  constructor(subtareaId: string) {
    super(`Subtarea edilicia con id "${subtareaId}" no encontrada o fue eliminada.`);
  }
}

/**
 * ExportacionDemasiadoGrandeError — la exportación a CSV del listado de
 * reparaciones excedería el tope de filas (`TOPE_FILAS_EXPORT`, 5000).
 * → HTTP 422 en la capa de presentación.
 *
 * Mismo criterio que `equipos/domain/errors/equipos.errors.ts` (sdd/exportar-listados-csv,
 * decisión D2): existe para NO entregar un CSV truncado en silencio.
 *
 * El mensaje es el mismo criterio que equipos, no el de tickets: este export
 * NO tiene filtros que acotar (spec, capability exportacion-reparaciones —
 * "No filter parameters are accepted"), así que decirle al usuario "acotá
 * los filtros" sería una instrucción imposible de seguir. El mensaje dice
 * honestamente que la lista superó el volumen soportado y señala la
 * exportación por partes como lo que hay que habilitar — un próximo paso
 * real, no una acción que el usuario no puede tomar.
 *
 * Ref: sdd/exportar-listados-csv/spec, capability exportacion-reparaciones.
 */
export class ExportacionDemasiadoGrandeError extends DomainError {
  readonly code = 'EXPORTACION_DEMASIADO_GRANDE';

  constructor(total: number, tope: number) {
    super(
      `El listado de reparaciones tiene ${total} filas y el máximo soportado por la exportación es ${tope}. ` +
        `Hace falta habilitar la exportación en partes para poder descargar este listado.`,
    );
  }
}

/**
 * CompraNoEncontradaError — la compra con el id indicado no existe (o fue
 * eliminada, soft delete) al intentar vincularla a una reparación.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref: sdd/reparacion-bloqueada-por-compra/design, D7 (validación de
 * existencia vía `ICompraRepository.findByIdConItems`). Tarea: WU1.9.
 */
export class CompraNoEncontradaError extends DomainError {
  readonly code = 'COMPRA_NO_ENCONTRADA';

  constructor(compraId: string) {
    super(`Compra con id "${compraId}" no encontrada.`);
  }
}

/**
 * VinculoNoEncontradoError — no existe un vínculo entre la reparación y la
 * compra indicadas al intentar desvincularlas.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref: sdd/reparacion-bloqueada-por-compra/design, ruta DELETE
 * `/reparaciones/:reparacionId/compras/:compraId`. Tarea: WU1.9.
 */
export class VinculoNoEncontradoError extends DomainError {
  readonly code = 'VINCULO_NO_ENCONTRADO';

  constructor(ticketEdiliciaId: string, compraId: string) {
    super(
      `No existe un vínculo entre la reparación "${ticketEdiliciaId}" y la compra "${compraId}".`,
    );
  }
}
