/**
 * T8.5 [UNIT][RED→GREEN] — `ListarReparacionesUseCase`.
 *
 * Resuelve ticket base + subtareas para cada satélite `ticket_edilicia`
 * (join en memoria). `ubicacion` viaja embebida como texto libre en el
 * propio satélite (ex-catálogo Ubicacion removido). Omite huérfanos sin
 * ticket base.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1. Tarea: T8.5.
 */
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
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
    const subtareaRepo = { findActiveByTicketEdiliciaId: vi.fn().mockResolvedValue([]) };
    const comentarioRepo = {
      contarPorTicketEdilicia: vi.fn().mockResolvedValue(new Map<string, number>()),
    };
    const useCase = new ListarReparacionesUseCase(
      ediliciaRepo as any,
      ticketRepo as any,
      subtareaRepo as any,
      comentarioRepo as any,
    );
    return { useCase, ediliciaRepo, ticketRepo, subtareaRepo, comentarioRepo };
  }

  it('resuelve ticket + subtareas para cada ticket_edilicia', async () => {
    const { useCase, ediliciaRepo, ticketRepo, subtareaRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    const ticket = makeTicket('ticket-uuid');
    ediliciaRepo.findAll.mockResolvedValue([edilicia]);
    ticketRepo.findById.mockResolvedValue(ticket);
    subtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue(['subtarea-a']);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    const items = result.getValue();
    expect(items).toHaveLength(1);
    expect(items[0].ticket).toBe(ticket);
    expect(items[0].ticketEdilicia).toBe(edilicia);
    expect(items[0].subtareas).toEqual(['subtarea-a']);
    expect(subtareaRepo.findActiveByTicketEdiliciaId).toHaveBeenCalledWith('edilicia-uuid');
  });

  describe('conteo de comentarios (indicador del listado)', () => {
    /**
     * Arma N satélites con su ticket base ya resuelto. El listado es un N+1
     * conocido (ticket + subtareas por fila): estos tests existen para que el
     * conteo de comentarios NO se sume a esa cuenta.
     */
    function conNSatelites(cantidad: number) {
      const deps = buildDeps();
      const satelites = Array.from({ length: cantidad }, (_, i) =>
        TicketEdiliciaEntity.create(
          { ticketId: `ticket-uuid-${i}`, ubicacion: 'Edificio Central' },
          `edilicia-uuid-${i}`,
        ),
      );
      deps.ediliciaRepo.findAll.mockResolvedValue(satelites);
      deps.ticketRepo.findById.mockImplementation((ticketId: string) =>
        Promise.resolve(makeTicket(ticketId)),
      );
      return { ...deps, satelites };
    }

    it('resuelve el conteo en UNA sola consulta por lote, no una por reparación', async () => {
      const { useCase, comentarioRepo } = conNSatelites(3);

      await useCase.execute();

      expect(comentarioRepo.contarPorTicketEdilicia).toHaveBeenCalledTimes(1);
      expect(comentarioRepo.contarPorTicketEdilicia).toHaveBeenCalledWith([
        'edilicia-uuid-0',
        'edilicia-uuid-1',
        'edilicia-uuid-2',
      ]);
    });

    it('mapea el conteo de cada reparación y usa 0 para las que no tienen comentarios', async () => {
      const { useCase, comentarioRepo } = conNSatelites(3);
      comentarioRepo.contarPorTicketEdilicia.mockResolvedValue(
        new Map([
          ['edilicia-uuid-0', 3],
          ['edilicia-uuid-2', 1],
        ]),
      );

      const items = (await useCase.execute()).getValue();

      expect(items.map((item) => item.cantidadComentarios)).toEqual([3, 0, 1]);
    });

    it('con lista vacía no consulta comentarios y devuelve vacío', async () => {
      const { useCase, ediliciaRepo, comentarioRepo } = buildDeps();
      ediliciaRepo.findAll.mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result.getValue()).toEqual([]);
      expect(comentarioRepo.contarPorTicketEdilicia).not.toHaveBeenCalled();
    });
  });

  it('omite satélites huérfanos (sin ticket base)', async () => {
    const { useCase, ediliciaRepo, ticketRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-huerfano-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ediliciaRepo.findAll.mockResolvedValue([edilicia]);
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });
});
