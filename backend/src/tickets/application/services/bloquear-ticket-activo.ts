import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * Toma el lock de fila del ticket y lo relee (odd/permisos-por-tipo-ticket, L45). Va dentro de la
 * transacción de una escritura que depende de que el ticket siga activo: `BorrarTicketUseCase` toma
 * el mismo lock, así que un borrado concurrente o terminó antes (y la relectura lo ve) o espera a
 * que esta escritura haga commit (y su chequeo de pendientes la ve). La lectura previa del caso de
 * uso, fuera de la transacción, no alcanza: entre esa lectura y la escritura el ticket se pudo
 * borrar.
 *
 * @param ticketRepo Repositorio de tickets, con el cliente de la transacción activa.
 * @param ticketId Id del ticket.
 * @returns `true` si el ticket existe y sigue activo con el lock tomado; `false` si ya no.
 */
export async function bloquearTicketActivo(
  ticketRepo: Pick<ITicketRepository, 'bloquear' | 'findById'>,
  ticketId: string,
): Promise<boolean> {
  await ticketRepo.bloquear(ticketId);
  const actual = await ticketRepo.findById(ticketId);
  return actual !== null && !actual.isDeleted();
}
