import { describe, it, expect, vi } from 'vitest';
import { ObtenerEquipoDeTicketUseCase } from './obtener-equipo-de-ticket.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

/**
 * [U][RED→GREEN] — ObtenerEquipoDeTicketUseCase: resuelve el equipo
 * vinculado a un ticket de soporte para mostrarlo en el detalle del ticket.
 *
 * Ref: detalle-equipo-en-ticket (sin equipoId asociado en el satélite →
 * `equipo: null`, sin lanzar error).
 */
describe('ObtenerEquipoDeTicketUseCase', () => {
  function makeUseCase(overrides?: {
    ticketSoporte?: TicketSoporteEntity | null;
    equipo?: EquipoInformaticoEntity | null;
  }) {
    const ticketSoporteRepo = {
      findByTicketId: vi.fn().mockResolvedValue(overrides?.ticketSoporte ?? null),
    };
    const equipoRepo = {
      findById: vi.fn().mockResolvedValue(overrides?.equipo ?? null),
    };
    const useCase = new ObtenerEquipoDeTicketUseCase(ticketSoporteRepo as never, equipoRepo as never);
    return { useCase, ticketSoporteRepo, equipoRepo };
  }

  it('retorna el equipo cuando el satélite tiene equipoId', async () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-1',
      equipoId: 'equipo-1',
      descripcionProblema: 'No prende',
    });
    const equipo = EquipoInformaticoEntity.create(
      { nombre: 'Notebook Dell', numeroSerie: 'SN-123', marca: null, modelo: null, fechaAdquisicion: null, ubicacionId: null },
      'equipo-1',
    );
    const { useCase, equipoRepo } = makeUseCase({ ticketSoporte, equipo });

    const result = await useCase.execute({ ticketId: 'ticket-1' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo).toEqual({
      id: 'equipo-1',
      nombre: 'Notebook Dell',
      numeroSerie: 'SN-123',
    });
    expect(equipoRepo.findById).toHaveBeenCalledWith('equipo-1');
  });

  it('retorna equipo:null cuando el satélite existe pero equipoId es null', async () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-1',
      equipoId: null,
      descripcionProblema: 'Sin acceso a la VPN',
    });
    const { useCase, equipoRepo } = makeUseCase({ ticketSoporte });

    const result = await useCase.execute({ ticketId: 'ticket-1' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo).toBeNull();
    expect(equipoRepo.findById).not.toHaveBeenCalled();
  });

  it('retorna equipo:null cuando no existe satélite ticket_soporte para el ticket', async () => {
    const { useCase } = makeUseCase({ ticketSoporte: null });

    const result = await useCase.execute({ ticketId: 'no-existe' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo).toBeNull();
  });
});
