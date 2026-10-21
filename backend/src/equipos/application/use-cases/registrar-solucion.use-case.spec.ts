import { describe, it, expect, vi } from 'vitest';
import { RegistrarSolucionUseCase } from './registrar-solucion.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { TicketSoporteNoEncontradoError } from '../../domain/errors/equipos.errors';
import type { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import type { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import type { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import type { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import type { Modulo } from '../../../shared/domain/modulos';

/** Actor que ve cualquier ticket: los casos de la solución no dependen del acceso. */
const ALCANCE_SIN_RESTRICCION: AlcanceActorTicket = {
  actorId: 'tecnico-1',
  tienePermisoVerTodos: true,
  modulosPermitidos: null,
};

function makeTicket(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Sin acceso a la VPN',
      descripcion: null,
      tipoId: 'tipo-soporte',
      estadoId: 'estado-en-proceso',
      prioridadId: 'prioridad-media',
      cicloId: 'ciclo-1',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-1',
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

/** Repositorios del ticket base: existe, de un tipo del módulo TICKETS, sin visibilidad por tarea. */
function makeReposTicket(ticket: TicketEntity | null = makeTicket()) {
  const ticketRepo = {
    findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticket),
    esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
  };
  const tipoTicketRepo = {
    findById: vi.fn<ITipoTicketRepository['findById']>().mockResolvedValue(makeTipo('TICKETS')),
  };
  return { ticketRepo, tipoTicketRepo };
}

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
    const { ticketRepo, tipoTicketRepo } = makeReposTicket();
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo, ticketRepo, tipoTicketRepo);

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      solucion: 'Se reinstaló el cliente VPN.',
      ...ALCANCE_SIN_RESTRICCION,
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
    const { ticketRepo, tipoTicketRepo } = makeReposTicket();
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo, ticketRepo, tipoTicketRepo);

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      solucion: 'X',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketSoporteNoEncontradoError);
    expect(ticketSoporteRepo.save).not.toHaveBeenCalled();
  });

  describe('acceso al ticket (odd/permisos-por-tipo-ticket, S0)', () => {
    function makeConSatelite() {
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
      const repos = makeReposTicket();
      const useCase = new RegistrarSolucionUseCase(
        ticketSoporteRepo,
        repos.ticketRepo,
        repos.tipoTicketRepo,
      );
      return { useCase, ticketSoporte, ticketSoporteRepo, ...repos };
    }

    it('un ticket de un tipo de otro módulo es 404 aunque el actor tenga VER_TODOS; no se guarda la solución', async () => {
      const c = makeConSatelite();
      c.tipoTicketRepo.findById.mockResolvedValue(makeTipo('EDILICIA'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Intento ajeno',
        ...ALCANCE_SIN_RESTRICCION,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketSoporteRepo.save).not.toHaveBeenCalled();
      expect(c.ticketSoporte.solucionAplicada).toBeNull();
    });

    it('un ticket que el actor no ve por fila (sin VER_TODOS, ni solicitante, ni responsable, ni tarea) es 404 y no se guarda', async () => {
      const c = makeConSatelite();

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Intento ajeno',
        actorId: 'tecnico-1',
        tienePermisoVerTodos: false,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-1', 'tecnico-1');
      expect(c.ticketSoporteRepo.save).not.toHaveBeenCalled();
    });

    it('un ticket base inexistente es 404, sin buscar el satélite', async () => {
      const c = makeConSatelite();
      c.ticketRepo.findById.mockResolvedValue(null);

      const result = await c.useCase.execute({
        ticketId: 'no-existe',
        solucion: 'X',
        ...ALCANCE_SIN_RESTRICCION,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketSoporteRepo.findByTicketId).not.toHaveBeenCalled();
      expect(c.ticketSoporteRepo.save).not.toHaveBeenCalled();
    });

    it('un ticket de un tipo de sus módulos que el actor ve registra la solución', async () => {
      const c = makeConSatelite();

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Se reinstaló el cliente VPN.',
        actorId: 'solicitante-1',
        tienePermisoVerTodos: false,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isOk()).toBe(true);
      expect(c.ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
    });

    it('sin restricción de módulo (ROOT o ADMINISTRADOR) registra la solución en un tipo de cualquier módulo', async () => {
      const c = makeConSatelite();
      c.tipoTicketRepo.findById.mockResolvedValue(makeTipo('EDILICIA'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Se reinstaló el cliente VPN.',
        ...ALCANCE_SIN_RESTRICCION,
      });

      expect(result.isOk()).toBe(true);
      expect(c.ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
