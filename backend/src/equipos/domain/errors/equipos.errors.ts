import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio del módulo `equipos/` (Fase 3, F3-Q1..Q5, F3-M1).
 *
 * Mismo patrón que `compras/domain/errors/compras.errors.ts` y
 * `reparaciones/domain/errors/reparaciones.errors.ts`: cada error extiende
 * `DomainError`, expone un `code` estable y se modela con `Result.fail()` —
 * nunca `throw` para fallos esperados del dominio.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1..Q5. Ref design: "Firmas TS
 * clave" (lista de errores de equipos.errors.ts). Tarea: T10.6.
 */

/**
 * EquipoNoEncontradoError — el equipo informático con el id indicado no
 * existe (o fue soft-deleted).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-Q1, F3-Q2.
 */
export class EquipoNoEncontradoError extends DomainError {
  readonly code = 'EQUIPO_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Equipo informático con id "${id}" no encontrado o fue eliminado.`);
  }
}

/**
 * EquipoInvalidoError — el `equipoId` recibido al crear un ticket de
 * soporte no existe, no está `activo`, o fue eliminado (soft delete).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q4.
 */
export class EquipoInvalidoError extends DomainError {
  readonly code = 'EQUIPO_INVALIDO';

  constructor(equipoId: string) {
    super(
      `El equipo con id "${equipoId}" no existe, está inactivo, o fue eliminado. ` +
        `No puede vincularse a un ticket de soporte.`,
    );
  }
}

/**
 * NumeroSerieDuplicadoError — el `numeroSerie` provisto ya está en uso por
 * otro equipo del tenant (índice único parcial `WHERE numero_serie IS NOT NULL`).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q1.
 */
export class NumeroSerieDuplicadoError extends DomainError {
  readonly code = 'NUMERO_SERIE_DUPLICADO';

  constructor(numeroSerie: string) {
    super(`Ya existe un equipo con el número de serie "${numeroSerie}" en este tenant.`);
  }
}

/**
 * TipoComponenteIdRequeridoError — falta `tipoComponenteId` al crear un
 * componente de equipo. NORMALIZADO a `Result.fail` (ADR-9): soporte1
 * lanzaba excepción; este proyecto usa el mismo criterio Result que el
 * resto de factories.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q2.
 */
export class TipoComponenteIdRequeridoError extends DomainError {
  readonly code = 'TIPO_COMPONENTE_ID_REQUERIDO';

  constructor() {
    super('tipoComponenteId es obligatorio para crear un componente de equipo.');
  }
}

/**
 * TipoComponenteInactivoError — el `tipoComponenteId` referenciado existe
 * pero está `activo=false`. Un tipo inactivo bloquea NUEVOS componentes
 * (los ya existentes no se ven afectados).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q2.
 */
export class TipoComponenteInactivoError extends DomainError {
  readonly code = 'TIPO_COMPONENTE_INACTIVO';

  constructor(tipoComponenteId: string) {
    super(
      `El tipo de componente con id "${tipoComponenteId}" está inactivo. ` +
        `No se pueden agregar nuevos componentes de este tipo.`,
    );
  }
}

/**
 * ComponenteNoEncontradoError — el componente de equipo con el id indicado
 * no existe o fue eliminado (soft delete).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-Q2.
 */
export class ComponenteNoEncontradoError extends DomainError {
  readonly code = 'COMPONENTE_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Componente de equipo con id "${id}" no encontrado o fue eliminado.`);
  }
}

/**
 * TicketSoporteNoEncontradoError — el satélite `ticket_soporte` con el
 * id/ticketId indicado no existe.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-Q4, F3-Q5.
 */
export class TicketSoporteNoEncontradoError extends DomainError {
  readonly code = 'TICKET_SOPORTE_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Ticket de soporte con id "${id}" no encontrado.`);
  }
}
