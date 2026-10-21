import { describe, it, expect, vi } from 'vitest';
import { ObtenerEquipoDeTicketUseCase } from './obtener-equipo-de-ticket.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import type { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import type { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import type { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import type { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import type { Modulo } from '../../../shared/domain/modulos';

function makeTicket(solicitanteId = 'actor-1'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'No prende',
      descripcion: null,
      tipoId: 'tipo-soporte',
      estadoId: 'estado-nuevo',
      prioridadId: 'prioridad-media',
      cicloId: 'ciclo-1',
      ticketReferenciaId: null,
      solicitanteId,
    },
    'ticket-1',
  );
}

function makeTipo(modulo: Modulo): TipoTicketEntity {
  return TipoTicketEntity.create(
    { codigo: 'SOPORTE', nombre: 'Soporte', modulo, activo: true },
    'tipo-soporte',
  );
}

/** Alcance del solicitante del ticket, sin restricción de módulo. */
function alcance(overrides: Partial<AlcanceActorTicket> = {}): AlcanceActorTicket {
  return {
    actorId: 'actor-1',
    tienePermisoVerTodos: false,
    modulosPermitidos: null,
    ...overrides,
  };
}

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
    ticket?: TicketEntity | null;
  }) {
    const ticketSoporteRepo = {
      findByTicketId: vi
        .fn<ITicketSoporteRepository['findByTicketId']>()
        .mockResolvedValue(overrides?.ticketSoporte ?? null),
    };
    const equipoRepo = {
      findById: vi
        .fn<IEquipoInformaticoRepository['findById']>()
        .mockResolvedValue(overrides?.equipo ?? null),
    };
    const ticketRepo = {
      findById: vi
        .fn<ITicketRepository['findById']>()
        .mockResolvedValue(overrides?.ticket === undefined ? makeTicket() : overrides.ticket),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };
    const tipoTicketRepo = {
      findById: vi.fn<ITipoTicketRepository['findById']>().mockResolvedValue(makeTipo('TICKETS')),
    };
    const useCase = new ObtenerEquipoDeTicketUseCase(
      ticketSoporteRepo,
      equipoRepo,
      ticketRepo,
      tipoTicketRepo,
    );
    return { useCase, ticketSoporteRepo, equipoRepo, ticketRepo, tipoTicketRepo };
  }

  it('retorna el equipo cuando el satélite tiene equipoId', async () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-1',
      equipoId: 'equipo-1',
      descripcionProblema: 'No prende',
    });
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook Dell',
        numeroSerie: 'SN-123',
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    const { useCase, equipoRepo } = makeUseCase({ ticketSoporte, equipo });

    const result = await useCase.execute({ ticketId: 'ticket-1', ...alcance() });

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

    const result = await useCase.execute({ ticketId: 'ticket-1', ...alcance() });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo).toBeNull();
    expect(equipoRepo.findById).not.toHaveBeenCalled();
  });

  it('retorna equipo:null cuando no existe satélite ticket_soporte para el ticket', async () => {
    const { useCase } = makeUseCase({ ticketSoporte: null });

    const result = await useCase.execute({ ticketId: 'ticket-1', ...alcance() });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo).toBeNull();
  });

  describe('acceso al ticket (odd/permisos-por-tipo-ticket, S0)', () => {
    const ticketSoporteConEquipo = (): TicketSoporteEntity =>
      TicketSoporteEntity.create({
        ticketId: 'ticket-1',
        equipoId: 'equipo-1',
        descripcionProblema: 'No prende',
      });

    it('un ticket de un tipo de otro módulo es 404 aunque el actor sea su solicitante y tenga VER_TODOS', async () => {
      const { useCase, tipoTicketRepo, ticketSoporteRepo, equipoRepo } = makeUseCase({
        ticketSoporte: ticketSoporteConEquipo(),
      });
      tipoTicketRepo.findById.mockResolvedValue(makeTipo('EDILICIA'));

      const result = await useCase.execute({
        ticketId: 'ticket-1',
        ...alcance({ tienePermisoVerTodos: true, modulosPermitidos: ['TICKETS'] }),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(ticketSoporteRepo.findByTicketId).not.toHaveBeenCalled();
      expect(equipoRepo.findById).not.toHaveBeenCalled();
    });

    it('un ticket que el actor no ve por fila (ni solicitante, ni responsable, ni tarea, sin VER_TODOS) es 404', async () => {
      const { useCase, ticketSoporteRepo } = makeUseCase({
        ticketSoporte: ticketSoporteConEquipo(),
        ticket: makeTicket('otro-usuario'),
      });

      const result = await useCase.execute({
        ticketId: 'ticket-1',
        ...alcance({ modulosPermitidos: ['TICKETS'] }),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(ticketSoporteRepo.findByTicketId).not.toHaveBeenCalled();
    });

    it('un ticket inexistente es 404, igual que uno no accesible (no revela existencia)', async () => {
      const { useCase } = makeUseCase({ ticket: null });

      const result = await useCase.execute({ ticketId: 'no-existe', ...alcance() });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });

    it('un ticket de un tipo de sus módulos resuelve el equipo', async () => {
      const { useCase, equipoRepo } = makeUseCase({ ticketSoporte: ticketSoporteConEquipo() });

      const result = await useCase.execute({
        ticketId: 'ticket-1',
        ...alcance({ modulosPermitidos: ['TICKETS'] }),
      });

      expect(result.isOk()).toBe(true);
      expect(equipoRepo.findById).toHaveBeenCalledWith('equipo-1');
    });

    it('sin restricción de módulo (ROOT o ADMINISTRADOR) resuelve el equipo de un tipo de cualquier módulo', async () => {
      const { useCase, tipoTicketRepo } = makeUseCase({ ticketSoporte: ticketSoporteConEquipo() });
      tipoTicketRepo.findById.mockResolvedValue(makeTipo('EDILICIA'));

      const result = await useCase.execute({
        ticketId: 'ticket-1',
        ...alcance({ tienePermisoVerTodos: true, modulosPermitidos: null }),
      });

      expect(result.isOk()).toBe(true);
    });
  });
});
