import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de los certificados de avance de obra (odd/edilicia-obra-externa, T3b, S5, S6, S8).
 * El 403 por falta de `CERTIFICAR` es `AccionSobreTipoNoPermitidaError`, el mismo de las demás
 * acciones por tipo.
 */

/** Solo un ticket con modalidad EXTERNA certifica avance (S5). → HTTP 422. */
export class CertificadoSoloExternoError extends DomainError {
  readonly code = 'CERTIFICADO_SOLO_EXTERNO';

  constructor() {
    super('Solo un ticket con modalidad externa certifica avance de obra.');
  }
}

/** Los pesos de las tareas activas tienen que sumar 100 antes de certificar (S4). → HTTP 422. */
export class PesosIncompletosParaCertificarError extends DomainError {
  readonly code = 'PESOS_INCOMPLETOS_PARA_CERTIFICAR';

  constructor(suma: number) {
    super(`Los pesos de las tareas suman ${suma} %: tienen que sumar 100 % antes de certificar.`);
  }
}

/** Por qué una tarea pedida no entra en el certificado. */
export type MotivoTareaNoCertificable = 'inexistente' | 'no-completada' | 'ya-certificada';

const TEXTO_MOTIVO: Record<MotivoTareaNoCertificable, string> = {
  inexistente: 'no es una tarea activa de este ticket',
  'no-completada': 'todavía no está completada',
  'ya-certificada': 'ya está en un certificado vigente',
};

/**
 * Una tarea pedida no se puede certificar (S5): no es una tarea activa del ticket, no está
 * completada, o ya está en un certificado vigente. → HTTP 422.
 */
export class TareaNoCertificableError extends DomainError {
  readonly code = 'TAREA_NO_CERTIFICABLE';

  constructor(descripcion: string, motivo: MotivoTareaNoCertificable) {
    super(`La tarea «${descripcion}» ${TEXTO_MOTIVO[motivo]}.`);
  }
}

/** No se emite ni se anula con el ticket CERRADO o CANCELADO (L26). → HTTP 422. */
export class CertificacionTicketCerradoError extends DomainError {
  readonly code = 'CERTIFICACION_TICKET_CERRADO';

  constructor() {
    super('Un ticket cerrado o cancelado no admite emitir ni anular certificados.');
  }
}

/**
 * Un ticket EXTERNA no se cierra con tareas sin certificar (S10). → HTTP 422.
 */
export class TicketExternoConTareasSinCertificarError extends DomainError {
  readonly code = 'TICKET_EXTERNO_CON_TAREAS_SIN_CERTIFICAR';

  constructor(cantidad: number) {
    super(
      cantidad === 1
        ? 'El ticket tiene 1 tarea sin certificar: certifíquela antes de cerrarlo.'
        : `El ticket tiene ${cantidad} tareas sin certificar: certifíquelas antes de cerrarlo.`,
    );
  }
}

/** El certificado no existe o no es de este ticket. → HTTP 404. */
export class CertificadoNoEncontradoError extends DomainError {
  readonly code = 'CERTIFICADO_NO_ENCONTRADO';

  constructor(certificadoId: string) {
    super(`El certificado "${certificadoId}" no existe en este ticket.`);
  }
}

/** El certificado ya estaba anulado (S8). → HTTP 409. */
export class CertificadoYaAnuladoError extends DomainError {
  readonly code = 'CERTIFICADO_YA_ANULADO';

  constructor(numero: number) {
    super(`El certificado N.º ${numero} ya está anulado.`);
  }
}
