/**
 * [UNIT] — `ResolutorReparacion` (odd/ticket-unificado).
 *
 * Las rutas `/reparaciones/:reparacionId` aceptan el id del satélite (el que devolvía el listado
 * antes) y el del ticket (el que devuelve ahora). El 404 nombra siempre la reparación pedida.
 */
import { DomainError, Result } from '../../../shared/domain/result';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';
import { ResolutorReparacion } from './acceso-reparacion';

function armar(satelite: TicketEdiliciaEntity | null) {
  const ediliciaRepo = { findById: vi.fn().mockResolvedValue(satelite) };
  const operar = vi.fn(async (ticketId: string): Promise<Result<string, DomainError>> =>
    Result.ok(ticketId),
  );
  return { resolutor: new ResolutorReparacion(ediliciaRepo), ediliciaRepo, operar };
}

describe('ResolutorReparacion', () => {
  it('con el id de un satélite, opera sobre su ticket', async () => {
    const { resolutor, operar } = armar(
      TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid' }, 'satelite-uuid'),
    );

    const result = await resolutor.sobreTicket('satelite-uuid', operar);

    expect(result.getValue()).toBe('ticket-uuid');
    expect(operar).toHaveBeenCalledWith('ticket-uuid');
  });

  it('con un id que no es de un satélite, lo usa como id de ticket', async () => {
    const { resolutor, operar, ediliciaRepo } = armar(null);

    const result = await resolutor.sobreTicket('ticket-sin-satelite', operar);

    expect(result.getValue()).toBe('ticket-sin-satelite');
    expect(ediliciaRepo.findById).toHaveBeenCalledWith('ticket-sin-satelite');
    expect(operar).toHaveBeenCalledWith('ticket-sin-satelite');
  });

  it('un satélite dado de baja es 404 de la reparación, sin operar', async () => {
    const satelite = TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid' }, 'satelite-uuid');
    satelite.softDelete();
    const { resolutor, operar } = armar(satelite);

    const result = await resolutor.sobreTicket('satelite-uuid', operar);

    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(result.getError().message).toBe('Ticket edilicio con id "satelite-uuid" no encontrado.');
    expect(operar).not.toHaveBeenCalled();
  });

  it('el 404 del ticket se traduce al de la reparación pedida, sin nombrar el ticket', async () => {
    const { resolutor } = armar(
      TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid' }, 'satelite-uuid'),
    );

    const result = await resolutor.sobreTicket('satelite-uuid', async () =>
      Result.fail(new TicketNoEncontradoError('ticket-uuid')),
    );

    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(result.getError().message).toBe('Ticket edilicio con id "satelite-uuid" no encontrado.');
  });

  it('cualquier otro error pasa tal cual', async () => {
    const { resolutor } = armar(null);
    const prohibido = new AccionSobreTipoNoPermitidaError('MODIFICACION');

    const result = await resolutor.sobreTicket('ticket-uuid', async () => Result.fail(prohibido));

    expect(result.getError()).toBe(prohibido);
  });
});
