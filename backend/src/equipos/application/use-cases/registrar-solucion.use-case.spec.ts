import { describe, it, expect, vi } from 'vitest';
import { RegistrarSolucionUseCase } from './registrar-solucion.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { TicketSoporteNoEncontradoError } from '../../domain/errors/equipos.errors';
import type { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';

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
      findByTicketId: vi
        .fn<ITicketSoporteRepository['findByTicketId']>()
        .mockResolvedValue(ticketSoporte),
      save: vi.fn<ITicketSoporteRepository['save']>(),
    };
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo);

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      solucion: 'Se reinstaló el cliente VPN.',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().solucionAplicada).toBe('Se reinstaló el cliente VPN.');
    expect(ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('falla con TicketSoporteNoEncontradoError si el satélite no existe', async () => {
    const ticketSoporteRepo = {
      findByTicketId: vi.fn<ITicketSoporteRepository['findByTicketId']>().mockResolvedValue(null),
      save: vi.fn<ITicketSoporteRepository['save']>(),
    };
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo);

    const result = await useCase.execute({ ticketId: 'no-existe', solucion: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketSoporteNoEncontradoError);
    expect(ticketSoporteRepo.save).not.toHaveBeenCalled();
  });
});
