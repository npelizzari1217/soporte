import { describe, it, expect, vi } from 'vitest';
import { RegistrarSolucionUseCase } from './registrar-solucion.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { TicketSoporteNoEncontradoError } from '../../domain/errors/equipos.errors';
import type { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import type { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

/** Actor que ve cualquier ticket: los casos de la solución no dependen del acceso. */
const ALCANCE_SIN_RESTRICCION = alcanceSinRestriccion('tecnico-1');

function makeTicket(tipoId = 'tipo-soporte'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Sin acceso a la VPN',
      descripcion: null,
      tipoId,
      estadoId: 'estado-en-proceso',
      prioridadId: 'prioridad-media',
      cicloId: 'ciclo-1',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-1',
    },
    'ticket-1',
  );
}

/** Repositorio del ticket base: existe y no es visible por tarea. */
function makeTicketRepo(ticket: TicketEntity | null = makeTicket()) {
  return {
    findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticket),
    esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
  };
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
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo, makeTicketRepo());

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
    const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo, makeTicketRepo());

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      solucion: 'X',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketSoporteNoEncontradoError);
    expect(ticketSoporteRepo.save).not.toHaveBeenCalled();
  });

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3, D5 c)', () => {
    function makeConSatelite(ticket: TicketEntity = makeTicket()) {
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
      const ticketRepo = makeTicketRepo(ticket);
      const useCase = new RegistrarSolucionUseCase(ticketSoporteRepo, ticketRepo);
      return { useCase, ticketSoporte, ticketSoporteRepo, ticketRepo };
    }
    // Mismo usuario: Soporte con Ver y Modificar, Mantenimiento solo con Ver.
    const alcance = alcancePorTipo('solicitante-1', {
      'tipo-soporte': ['LECTURA', 'MODIFICACION'],
      'tipo-mantenimiento': ['LECTURA'],
    });

    it('con MODIFICACION sobre el tipo registra la solución', async () => {
      const c = makeConSatelite();

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Se reinstaló el cliente VPN.',
        ...alcance,
      });

      expect(result.getValue().solucionAplicada).toBe('Se reinstaló el cliente VPN.');
      expect(c.ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
    });

    it('con solo LECTURA sobre el tipo es 403 y no se guarda la solución', async () => {
      const c = makeConSatelite(makeTicket('tipo-mantenimiento'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Intento',
        ...alcance,
      });

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(c.ticketSoporteRepo.save).not.toHaveBeenCalled();
      expect(c.ticketSoporte.solucionAplicada).toBeNull();
    });

    it('un ticket de un tipo sin LECTURA es 404 aunque el actor sea su solicitante; no se guarda', async () => {
      const c = makeConSatelite(makeTicket('tipo-electricidad'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Intento',
        ...alcance,
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketSoporteRepo.save).not.toHaveBeenCalled();
      expect(c.ticketSoporte.solucionAplicada).toBeNull();
    });

    it('un ticket que el actor no ve por fila (sin VER_TODOS, ni solicitante, ni responsable, ni tarea) es 404 y no se guarda', async () => {
      const c = makeConSatelite();

      const result = await c.useCase.execute({
        ticketId: 'ticket-1',
        solucion: 'Intento ajeno',
        ...alcancePorTipo('tecnico-1', { 'tipo-soporte': ['LECTURA', 'MODIFICACION'] }),
      });

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

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketSoporteRepo.findByTicketId).not.toHaveBeenCalled();
      expect(c.ticketSoporteRepo.save).not.toHaveBeenCalled();
    });

    it('sin restricción (ROOT o ADMINISTRADOR) registra la solución en un tipo sin filas', async () => {
      const c = makeConSatelite(makeTicket('tipo-electricidad'));

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
