import { describe, it, expect, vi } from 'vitest';
import { ObtenerEquipoDeTicketUseCase } from './obtener-equipo-de-ticket.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import type { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import type { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import type { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

function makeTicket(solicitanteId = 'actor-1', tipoId = 'tipo-soporte'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'No prende',
      descripcion: null,
      tipoId,
      estadoId: 'estado-nuevo',
      prioridadId: 'prioridad-media',
      cicloId: 'ciclo-1',
      ticketReferenciaId: null,
      solicitanteId,
    },
    'ticket-1',
  );
}

/** Alcance del solicitante del ticket, con solo `LECTURA` sobre el tipo Soporte. */
function alcance(): AlcanceActorTicket {
  return alcancePorTipo('actor-1', { 'tipo-soporte': ['LECTURA'] });
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
    const useCase = new ObtenerEquipoDeTicketUseCase(ticketSoporteRepo, equipoRepo, ticketRepo);
    return { useCase, ticketSoporteRepo, equipoRepo, ticketRepo };
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

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3)', () => {
    const ticketSoporteConEquipo = (): TicketSoporteEntity =>
      TicketSoporteEntity.create({
        ticketId: 'ticket-1',
        equipoId: 'equipo-1',
        descripcionProblema: 'No prende',
      });

    it('un ticket de un tipo sin LECTURA es 404 aunque el actor sea su solicitante', async () => {
      const { useCase, ticketSoporteRepo, equipoRepo } = makeUseCase({
        ticketSoporte: ticketSoporteConEquipo(),
        ticket: makeTicket('actor-1', 'tipo-mantenimiento'),
      });

      const result = await useCase.execute({
        ticketId: 'ticket-1',
        ...alcancePorTipo('actor-1', {
          'tipo-soporte': ['LECTURA', 'VER_TODOS'],
          'tipo-mantenimiento': ['VER_TODOS', 'MODIFICACION'],
        }),
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(ticketSoporteRepo.findByTicketId).not.toHaveBeenCalled();
      expect(equipoRepo.findById).not.toHaveBeenCalled();
    });

    it('un ticket que el actor no ve por fila (ni solicitante, ni responsable, ni tarea, sin VER_TODOS) es 404', async () => {
      const { useCase, ticketSoporteRepo } = makeUseCase({
        ticketSoporte: ticketSoporteConEquipo(),
        ticket: makeTicket('otro-usuario'),
      });

      const result = await useCase.execute({ ticketId: 'ticket-1', ...alcance() });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(ticketSoporteRepo.findByTicketId).not.toHaveBeenCalled();
    });

    it('un ticket inexistente es 404, igual que uno no accesible (no revela existencia)', async () => {
      const { useCase } = makeUseCase({ ticket: null });

      const result = await useCase.execute({ ticketId: 'no-existe', ...alcance() });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });

    it('con solo LECTURA sobre el tipo resuelve el equipo', async () => {
      const { useCase, equipoRepo } = makeUseCase({ ticketSoporte: ticketSoporteConEquipo() });

      const result = await useCase.execute({ ticketId: 'ticket-1', ...alcance() });

      expect(result.isOk()).toBe(true);
      expect(equipoRepo.findById).toHaveBeenCalledWith('equipo-1');
    });

    it('sin restricción (ROOT o ADMINISTRADOR) resuelve el equipo de un tipo sin filas', async () => {
      const { useCase } = makeUseCase({
        ticketSoporte: ticketSoporteConEquipo(),
        ticket: makeTicket('otro-usuario', 'tipo-mantenimiento'),
      });

      const result = await useCase.execute({
        ticketId: 'ticket-1',
        ...alcanceSinRestriccion('actor-1'),
      });

      expect(result.isOk()).toBe(true);
    });
  });
});
