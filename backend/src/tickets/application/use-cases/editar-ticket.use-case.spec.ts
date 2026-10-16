/**
 * T6.5 [UNIT] — RED→GREEN: `EditarTicketUseCase` (T8 — titulo/descripcion/
 * prioridad, NUNCA estado).
 *
 * Ref spec: sdd/tickets-core/spec T8. Tarea: T6.5.
 */
import { EditarTicketUseCase } from './editar-ticket.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketReprioritizadoEvent } from '../../domain/events/ticket-reprioritizado.event';
import {
  TicketNoEncontradoError,
  PrioridadNoEncontradaError,
  TicketBloqueadoParaEdicionError,
  SectorTicketInexistenteError,
} from '../../domain/errors/tickets.errors';
import { SectorEntity } from '../../../sectores/domain/entities/sector.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { unstubbed } from '../../../testing/mocks';

/**
 * Estados de catálogo indexados por id — `estadoRepo.findById(ticket.estadoId)`
 * resuelve el código semántico para la regla de bloqueo por estado.
 */
const ESTADOS: Record<string, EstadoEntity> = {
  'estado-nuevo-uuid': EstadoEntity.create(
    { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 1, activo: true },
    'estado-nuevo-uuid',
  ),
  'estado-asignado-uuid': EstadoEntity.create(
    { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
    'estado-asignado-uuid',
  ),
  'estado-en-proceso-uuid': EstadoEntity.create(
    { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 3, activo: true },
    'estado-en-proceso-uuid',
  ),
};

function makeTicket(estadoId = 'estado-nuevo-uuid'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Titulo original',
      descripcion: 'Descripcion original',
      tipoId: 'tipo-uuid',
      estadoId,
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

describe('EditarTicketUseCase', () => {
  function makeCollaborators(ticket: TicketEntity | null) {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticket),
      save: vi.fn<ITicketRepository['save']>().mockResolvedValue(undefined),
      findByIds: unstubbed('findByIds'),
      findByNumero: unstubbed('findByNumero'),
      findLastSecuencia: unstubbed('findLastSecuencia'),
      findAll: unstubbed('findAll'),
      count: unstubbed('count'),
      esVisiblePara: unstubbed('esVisiblePara'),
      bloquear: unstubbed('bloquear'),
      delete: unstubbed('delete'),
    };
    const prioridadRepo = {
      findById: vi
        .fn<IPrioridadRepository['findById']>()
        .mockResolvedValue(
          PrioridadEntity.create(
            { codigo: 'ALTA', nombre: 'Alta', color: null, orden: 3, activo: true },
            'prioridad-alta-uuid',
          ),
        ),
      findByCodigo: unstubbed('findByCodigo'),
      findIdByCodigo: unstubbed('findIdByCodigo'),
      findAllActive: unstubbed('findAllActive'),
      save: unstubbed('save'),
    };
    const estadoRepo = {
      findById: vi.fn<IEstadoRepository['findById']>((id) => Promise.resolve(ESTADOS[id] ?? null)),
      findByCodigo: unstubbed('findByCodigo'),
      findIdByCodigo: unstubbed('findIdByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    const eventPublisher = { publish: vi.fn<IDomainEventPublisher['publish']>() };
    // Sector existente pero DESACTIVADO: la edicion lo acepta igual (odd/ubicacion-sector-ticket).
    const sectorRepo = {
      findById: vi.fn(async (id: string) =>
        id === 'sector-uuid'
          ? SectorEntity.create({ codigo: 'COMP', nombre: 'Computacion', activo: false }, id)
          : null,
      ),
    };
    const useCase = new EditarTicketUseCase(
      ticketRepo,
      prioridadRepo,
      estadoRepo,
      eventPublisher,
      sectorRepo,
    );
    return { useCase, ticketRepo, prioridadRepo, estadoRepo, eventPublisher, sectorRepo };
  }

  it('actualiza titulo/descripcion/prioridadId y persiste', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'Nuevo titulo',
      descripcion: 'Nueva descripcion',
      prioridadId: 'prioridad-alta-uuid',
      actorEsRoot: false,
    });

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket.titulo).toBe('Nuevo titulo');
    expect(ticket.descripcion).toBe('Nueva descripcion');
    expect(ticket.prioridadId).toBe('prioridad-alta-uuid');
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
  });

  it('NUNCA muta el estado, incluso si el DTO no lo permite en el tipo (invariante de dominio)', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'X',
      actorEsRoot: false,
    });

    expect(result.getValue().estadoId).toBe('estado-nuevo-uuid');
  });

  it('campos omitidos no se tocan (PATCH parcial)', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'Solo titulo',
      actorEsRoot: false,
    });

    expect(result.getValue().descripcion).toBe('Descripcion original');
    expect(result.getValue().prioridadId).toBe('prioridad-media-uuid');
  });

  describe('ubicacion y sector (odd/ubicacion-sector-ticket)', () => {
    it('setea ubicacion y un sector existente aunque este desactivado', async () => {
      const c = makeCollaborators(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        ubicacion: 'Sala de profesores',
        sectorId: 'sector-uuid',
        actorEsRoot: false,
      });

      expect(result.getValue().ubicacion).toBe('Sala de profesores');
      expect(result.getValue().sectorId).toBe('sector-uuid');
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it('null limpia los dos campos sin consultar el catalogo', async () => {
      const ticket = makeTicket();
      ticket.actualizarDatos({ ubicacion: 'Aula 1', sectorId: 'sector-uuid' });
      const c = makeCollaborators(ticket);

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        ubicacion: null,
        sectorId: null,
        actorEsRoot: false,
      });

      expect(result.getValue().ubicacion).toBeNull();
      expect(result.getValue().sectorId).toBeNull();
      expect(c.sectorRepo.findById).not.toHaveBeenCalled();
    });

    it('omitidos no se tocan', async () => {
      const ticket = makeTicket();
      ticket.actualizarDatos({ ubicacion: 'Aula 1', sectorId: 'sector-uuid' });
      const c = makeCollaborators(ticket);

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        titulo: 'Otro titulo',
        actorEsRoot: false,
      });

      expect(result.getValue().ubicacion).toBe('Aula 1');
      expect(result.getValue().sectorId).toBe('sector-uuid');
    });

    it('sector inexistente → SectorTicketInexistenteError (422), sin persistir', async () => {
      const c = makeCollaborators(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        sectorId: 'no-existe',
        actorEsRoot: false,
      });

      expect(result.getError()).toBeInstanceOf(SectorTicketInexistenteError);
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    });
  });

  it('ticket inexistente → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({
      ticketId: 'no-existe',
      titulo: 'X',
      actorEsRoot: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket soft-deleted se trata como inexistente → TicketNoEncontradoError (404)', async () => {
    const ticket = makeTicket();
    ticket.softDelete();
    const c = makeCollaborators(ticket);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'X',
      actorEsRoot: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('prioridadId inexistente en el catálogo del tenant → PrioridadNoEncontradaError (422), sin persistir', async () => {
    const c = makeCollaborators(makeTicket());
    c.prioridadRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'no-existe',
      actorEsRoot: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('SA10 (Fase 4, aditivo, GATE G3): publica TicketReprioritizadoEvent SOLO si prioridadId cambia', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'prioridad-alta-uuid',
      actorEsRoot: false,
    });

    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketReprioritizadoEvent);
    if (!(evento instanceof TicketReprioritizadoEvent)) {
      throw new Error('se esperaba un TicketReprioritizadoEvent');
    }
    expect(evento.ticketId).toBe('ticket-uuid');
    expect(evento.prioridadId).toBe('prioridad-alta-uuid');
  });

  it('SA10: NO publica evento si prioridadId no viene en el DTO (edición de otros campos)', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'Solo titulo',
      actorEsRoot: false,
    });

    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('SA10: NO publica evento si prioridadId enviado es igual al actual (sin cambio real)', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'prioridad-media-uuid',
      actorEsRoot: false,
    });

    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('SA10: un fallo del eventPublisher NUNCA revierte la edición ya persistida (log-and-swallow)', async () => {
    const c = makeCollaborators(makeTicket());
    c.eventPublisher.publish.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'prioridad-alta-uuid',
      actorEsRoot: false,
    });

    expect(result.isOk()).toBe(true);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
  });

  // ─── Regla de bloqueo por estado (EN_PROCESO+ → solo ROOT) ────────────────
  describe('bloqueo de edición una vez EN_PROCESO (o posterior)', () => {
    it('EN_PROCESO + no-ROOT → TicketBloqueadoParaEdicionError (403), sin persistir', async () => {
      const c = makeCollaborators(makeTicket('estado-en-proceso-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        titulo: 'Intento de edición',
        actorEsRoot: false,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketBloqueadoParaEdicionError);
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    });

    it('EN_PROCESO + ROOT → edita OK (ROOT bypassa el bloqueo)', async () => {
      const c = makeCollaborators(makeTicket('estado-en-proceso-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        titulo: 'Editado por ROOT',
        actorEsRoot: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().titulo).toBe('Editado por ROOT');
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ASIGNADO + no-ROOT → edita OK (sin regresión: pre-proceso sigue abierto a TECNICO+)', async () => {
      const c = makeCollaborators(makeTicket('estado-asignado-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        titulo: 'Editado en ASIGNADO',
        actorEsRoot: false,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().titulo).toBe('Editado en ASIGNADO');
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ROOT NO consulta el estado (bypass temprano, sin costo de findById)', async () => {
      const c = makeCollaborators(makeTicket('estado-en-proceso-uuid'));

      await c.useCase.execute({ ticketId: 'ticket-uuid', titulo: 'X', actorEsRoot: true });

      expect(c.estadoRepo.findById).not.toHaveBeenCalled();
    });
  });
});
