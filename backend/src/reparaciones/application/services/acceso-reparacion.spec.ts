/**
 * [UNIT] — `comoReparacion` (odd/ticket-unificado).
 *
 * Las rutas `/reparaciones/:reparacionId` reciben el id del ticket. El 404 nombra siempre la
 * reparación pedida; los demás resultados pasan tal cual.
 */
import { DomainError, Result } from '../../../shared/domain/result';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';
import { comoReparacion } from './acceso-reparacion';

describe('comoReparacion', () => {
  it('un resultado exitoso pasa tal cual', () => {
    const ok = Result.ok<string, DomainError>('hecho');

    expect(comoReparacion('ticket-uuid', ok)).toBe(ok);
  });

  it('el 404 del ticket se traduce al de la reparación pedida', () => {
    const result = comoReparacion(
      'ticket-uuid',
      Result.fail<string, DomainError>(new TicketNoEncontradoError('ticket-uuid')),
    );

    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(result.getError().message).toBe('Ticket edilicio con id "ticket-uuid" no encontrado.');
  });

  it('cualquier otro error pasa tal cual', () => {
    const prohibido = new AccionSobreTipoNoPermitidaError('MODIFICACION');

    const result = comoReparacion('ticket-uuid', Result.fail<string, DomainError>(prohibido));

    expect(result.getError()).toBe(prohibido);
  });
});
