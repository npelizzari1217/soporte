/**
 * T8.5 [UNIT][RED→GREEN] — `ListarReparacionesUseCase`.
 *
 * Resuelve ticket base + ubicación para cada satélite `ticket_edilicia`
 * (join en memoria). Omite huérfanos sin ticket base.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1. Tarea: T8.5.
 */
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { ListarReparacionesUseCase } from './listar-reparaciones.use-case';

function makeTicket(id: string): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'EDI-2026-00001',
      titulo: 'Reparar cañería',
      descripcion: null,
      tipoId: 'tipo-edilicia-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'usuario-uuid',
    },
    id,
  );
}

describe('ListarReparacionesUseCase', () => {
  function buildDeps() {
    const ediliciaRepo = { findAll: vi.fn() };
    const ticketRepo = { findById: vi.fn() };
    const ubicacionRepo = { findById: vi.fn() };
    const subtareaRepo = { findActiveByTicketEdiliciaId: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarReparacionesUseCase(
      ediliciaRepo as any,
      ticketRepo as any,
      ubicacionRepo as any,
      subtareaRepo as any,
    );
    return { useCase, ediliciaRepo, ticketRepo, ubicacionRepo, subtareaRepo };
  }

  it('resuelve ticket + ubicación + subtareas para cada ticket_edilicia', async () => {
    const { useCase, ediliciaRepo, ticketRepo, ubicacionRepo, subtareaRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacionId: 'ubicacion-uuid' },
      'edilicia-uuid',
    );
    const ticket = makeTicket('ticket-uuid');
    const ubicacion = UbicacionEntity.create({ nombre: 'Edificio Central' }, 'ubicacion-uuid');
    ediliciaRepo.findAll.mockResolvedValue([edilicia]);
    ticketRepo.findById.mockResolvedValue(ticket);
    ubicacionRepo.findById.mockResolvedValue(ubicacion);
    subtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue(['subtarea-a']);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    const items = result.getValue();
    expect(items).toHaveLength(1);
    expect(items[0].ticket).toBe(ticket);
    expect(items[0].ticketEdilicia).toBe(edilicia);
    expect(items[0].ubicacion).toBe(ubicacion);
    expect(items[0].subtareas).toEqual(['subtarea-a']);
    expect(subtareaRepo.findActiveByTicketEdiliciaId).toHaveBeenCalledWith('edilicia-uuid');
  });

  it('omite satélites huérfanos (sin ticket base)', async () => {
    const { useCase, ediliciaRepo, ticketRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-huerfano-uuid', ubicacionId: 'ubicacion-uuid' },
      'edilicia-uuid',
    );
    ediliciaRepo.findAll.mockResolvedValue([edilicia]);
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('ubicacion=null si la ubicación referenciada no se encuentra', async () => {
    const { useCase, ediliciaRepo, ticketRepo, ubicacionRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacionId: 'ubicacion-borrada-uuid' },
      'edilicia-uuid',
    );
    ediliciaRepo.findAll.mockResolvedValue([edilicia]);
    ticketRepo.findById.mockResolvedValue(makeTicket('ticket-uuid'));
    ubicacionRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()[0].ubicacion).toBeNull();
  });
});
