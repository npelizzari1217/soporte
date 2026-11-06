import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio de las tareas de un ticket (odd/tareas-con-tecnico). Los devuelve
 * `TareaTicketEntity` dentro de un `Result`; el caso de uso decide cómo exponerlos.
 */

/** La tarea fue dada de baja: ya no se completa, descompleta, asigna ni borra. */
export class TareaEliminadaError extends DomainError {
  readonly code = 'TAREA_ELIMINADA';

  constructor(tareaId: string) {
    super(`La tarea "${tareaId}" fue eliminada.`);
  }
}

/** Completar una tarea que ya está completada pisaría el registro de quién la completó. */
export class TareaYaCompletadaError extends DomainError {
  readonly code = 'TAREA_YA_COMPLETADA';

  constructor(tareaId: string) {
    super(`La tarea "${tareaId}" ya está completada.`);
  }
}

/** Descompletar una tarea pendiente no tiene efecto, y se informa en vez de ignorarlo. */
export class TareaNoCompletadaError extends DomainError {
  readonly code = 'TAREA_NO_COMPLETADA';

  constructor(tareaId: string) {
    super(`La tarea "${tareaId}" no está completada.`);
  }
}

/**
 * La tarea no existe, fue dada de baja o pertenece a otro ticket. Las tres se informan igual: un
 * id de otro ticket no revela que la tarea existe. → HTTP 404.
 */
export class TareaNoEncontradaError extends DomainError {
  readonly code = 'TAREA_NO_ENCONTRADA';

  constructor(tareaId: string) {
    super(`No existe la tarea "${tareaId}" en el ticket.`);
  }
}

/**
 * El actor ve el ticket pero no puede hacer esta acción sobre sus tareas (CA3, CA4). → HTTP 403.
 */
export class TareaAccionNoPermitidaError extends DomainError {
  readonly code = 'TAREA_ACCION_NO_PERMITIDA';

  constructor(accion: string) {
    super(`El usuario no tiene permiso para ${accion} tareas de este ticket.`);
  }
}

/**
 * El técnico propuesto no es TECNICO ni COLABORADOR con el módulo del tipo del ticket, la regla
 * del punto 9 (CA3). → HTTP 422.
 */
export class TecnicoTareaNoElegibleError extends DomainError {
  readonly code = 'TECNICO_TAREA_NO_ELEGIBLE';

  constructor(tecnicoId: string) {
    super(`El usuario "${tecnicoId}" no puede ser técnico de una tarea de este ticket.`);
  }
}

/**
 * El peso pedido dejaría la suma de las tareas activas del ticket por encima de 100 %
 * (odd/edilicia-obra-externa, S9, L16). El sistema no redistribuye: el usuario baja a mano el peso
 * de otras tareas antes. → HTTP 422.
 */
export class PesoTareasExcedeTotalError extends DomainError {
  readonly code = 'PESO_TAREAS_EXCEDE_TOTAL';

  constructor(sumaResultante: number) {
    super(
      `Con ese peso, las tareas del ticket sumarían ${sumaResultante} %, por encima del 100 %. ` +
        'Baje primero el peso de otras tareas.',
    );
  }
}

/**
 * El peso de las tareas solo se usa en tickets con modalidad EXTERNA (odd/edilicia-obra-externa,
 * S4): en uno interno no mide nada y guardarlo dejaría un dato sin significado. → HTTP 422.
 */
export class PesoTareaSoloExternoError extends DomainError {
  readonly code = 'PESO_TAREA_SOLO_EXTERNO';

  constructor() {
    super('El peso de las tareas solo se usa en tickets con modalidad externa.');
  }
}

/** Lo que se intentó hacer con una tarea certificada (S8). */
export type CambioSobreTareaCertificada = 'repesar' | 'eliminar' | 'descompletar';

const TEXTO_CAMBIO: Record<CambioSobreTareaCertificada, string> = {
  repesar: 'cambiarle el peso',
  eliminar: 'eliminarla',
  descompletar: 'descompletarla',
};

/**
 * La tarea está en un certificado vigente (odd/edilicia-obra-externa, S8): no se repesa, borra ni
 * descompleta sin anular antes el certificado. → HTTP 422.
 */
export class TareaCertificadaError extends DomainError {
  readonly code = 'TAREA_CERTIFICADA';

  constructor(descripcion: string, cambio: CambioSobreTareaCertificada) {
    super(
      `La tarea «${descripcion}» está en un certificado vigente: anule el certificado antes de ${TEXTO_CAMBIO[cambio]}.`,
    );
  }
}

/**
 * El ticket está bloqueado por una compra en curso: sus tareas son de solo lectura (ni crear,
 * completar, descompletar, eliminar ni asignar técnico), para cualquier actor
 * (odd/ticket-cerrado-solo-lectura, S2; odd/ticket-unificado, S5). Un ticket RESUELTO, CERRADO o
 * CANCELADO se rechaza antes con `TicketSoloComentariosError` (odd/cerrado-solo-comentarios).
 * → HTTP 422.
 */
export class TareaTicketNoEditableError extends DomainError {
  readonly code = 'TAREA_TICKET_NO_EDITABLE';

  constructor() {
    super(
      'La reparación está bloqueada por una compra en curso y no acepta cambios en sus tareas.',
    );
  }
}
