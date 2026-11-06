import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { CertificacionTicketCerradoError } from '../../domain/errors/certificados.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';

/** Estados en los que no se emite ni se anula un certificado (L26). */
const ESTADOS_SIN_CERTIFICACION: ReadonlySet<string> = new Set(['CERRADO', 'CANCELADO']);

/**
 * Un ticket CERRADO o CANCELADO no emite ni anula certificados (odd/edilicia-obra-externa, L26).
 * Se pregunta sobre el ticket releído con el lock: entre la lectura previa y la escritura otro actor
 * lo pudo cerrar.
 *
 * @param estadoRepo Catálogo de estados.
 * @param ticket Ticket releído con el lock tomado.
 * @returns Ok, o `CertificacionTicketCerradoError`.
 */
export async function verificarTicketCertificable(
  estadoRepo: Pick<IEstadoRepository, 'findById'>,
  ticket: TicketEntity,
): Promise<Result<void, DomainError>> {
  const estado = await estadoRepo.findById(ticket.estadoId);
  if (estado && ESTADOS_SIN_CERTIFICACION.has(estado.codigo)) {
    return Result.fail(new CertificacionTicketCerradoError());
  }
  return Result.ok(undefined);
}
