import { describe, it, expect, vi } from 'vitest';
import { RegistrarSolucionUseCase } from './registrar-solucion.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { TicketSoporteNoEncontradoError } from '../../domain/errors/equipos.errors';

/**
 * T13.3 [U][RED→GREEN] — RegistrarSolucionUseCase: setea solucion_aplicada.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q5.
 */
describe('RegistrarSolucionUseCase', () => {
  it('registra la solución del ticket_soporte', async () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-1',
      equipoId: null,
      descripcionProblema: 'Sin acceso a la VPN',
    });
    const ticketSoporteRepo = {
      findByTicketId: vi.fn().mockResolvedValue(ticketSoporte),
      save: vi.fn(),
    };
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo as never);

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      solucion: 'Se reinstaló el cliente VPN.',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().solucionAplicada).toBe('Se reinstaló el cliente VPN.');
    expect(ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('falla con TicketSoporteNoEncontradoError si el satélite no existe', async () => {
    const ticketSoporteRepo = { findByTicketId: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo as never);

    const result = await useCase.execute({ ticketId: 'no-existe', solucion: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketSoporteNoEncontradoError);
    expect(ticketSoporteRepo.save).not.toHaveBeenCalled();
  });
});
