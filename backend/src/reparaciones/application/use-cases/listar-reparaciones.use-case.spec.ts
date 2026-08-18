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
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
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

function makeSubtarea(ticketEdiliciaId: string, descripcion: string): SubtareaEdiliciaEntity {
  return SubtareaEdiliciaEntity.create({ ticketEdiliciaId, descripcion });
}

describe('ListarReparacionesUseCase', () => {
  function buildDeps() {
    const ediliciaRepo = { findAll: vi.fn() };
    const ticketRepo = { findByIds: vi.fn().mockResolvedValue(new Map<string, TicketEntity>()) };
    const subtareaRepo = {
      findActiveByTicketEdiliciaIds: vi
        .fn()
        .mockResolvedValue(new Map<string, SubtareaEdiliciaEntity[]>()),
    };
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

  /**
   * Arma N satélites con su ticket base ya resuelto, en el orden que devuelve
   * `findAll`.
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
    deps.ticketRepo.findByIds.mockResolvedValue(
      new Map(satelites.map((satelite) => [satelite.ticketId, makeTicket(satelite.ticketId)])),
    );
    return { ...deps, satelites };
  }

  it('resuelve ticket + subtareas para cada ticket_edilicia', async () => {
    const { useCase, ediliciaRepo, ticketRepo, subtareaRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    const ticket = makeTicket('ticket-uuid');
    const subtarea = makeSubtarea('edilicia-uuid', 'Cambiar la junta');
    ediliciaRepo.findAll.mockResolvedValue([edilicia]);
    ticketRepo.findByIds.mockResolvedValue(new Map([['ticket-uuid', ticket]]));
    subtareaRepo.findActiveByTicketEdiliciaIds.mockResolvedValue(
      new Map([['edilicia-uuid', [subtarea]]]),
    );

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    const items = result.getValue();
    expect(items).toHaveLength(1);
    expect(items[0].ticket).toBe(ticket);
    expect(items[0].ticketEdilicia).toBe(edilicia);
    expect(items[0].subtareas).toEqual([subtarea]);
  });

  describe('resolución por lote (el listado NO puede volver a ser un N+1)', () => {
    /**
     * Cada entrada describe UNA de las tres consultas del listado: cuál es el
     * doble que la atiende y con qué ids tiene que recibirla, con N=3
     * reparaciones.
     */
    const consultasPorLote = [
      {
        nombre: 'los tickets base',
        doble: (deps: ReturnType<typeof conNSatelites>) => deps.ticketRepo.findByIds,
        idsEsperados: ['ticket-uuid-0', 'ticket-uuid-1', 'ticket-uuid-2'],
      },
      {
        nombre: 'las subtareas',
        doble: (deps: ReturnType<typeof conNSatelites>) =>
          deps.subtareaRepo.findActiveByTicketEdiliciaIds,
        idsEsperados: ['edilicia-uuid-0', 'edilicia-uuid-1', 'edilicia-uuid-2'],
      },
      {
        nombre: 'el conteo de comentarios',
        doble: (deps: ReturnType<typeof conNSatelites>) =>
          deps.comentarioRepo.contarPorTicketEdilicia,
        idsEsperados: ['edilicia-uuid-0', 'edilicia-uuid-1', 'edilicia-uuid-2'],
      },
    ];

    /**
     * El test guardián del costo: con 3 reparaciones cada repositorio se
     * consulta UNA sola vez, con los ids juntos. Si alguien devuelve una de
     * estas resoluciones adentro del loop, la cuenta de llamadas pasa a 3 y
     * este test lo frena.
     */
    it.each(consultasPorLote)(
      'resuelve $nombre en UNA sola consulta por lote, no una por reparación',
      async ({ doble, idsEsperados }) => {
        const deps = conNSatelites(3);

        await deps.useCase.execute();

        expect(doble(deps)).toHaveBeenCalledTimes(1);
        expect(doble(deps)).toHaveBeenCalledWith(idsEsperados);
      },
    );

    it('con lista vacía no dispara NINGUNA consulta y devuelve vacío', async () => {
      const { useCase, ediliciaRepo, ticketRepo, subtareaRepo, comentarioRepo } = buildDeps();
      ediliciaRepo.findAll.mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result.getValue()).toEqual([]);
      expect(ticketRepo.findByIds).not.toHaveBeenCalled();
      expect(subtareaRepo.findActiveByTicketEdiliciaIds).not.toHaveBeenCalled();
      expect(comentarioRepo.contarPorTicketEdilicia).not.toHaveBeenCalled();
    });
  });

  describe('preservación del comportamiento del join', () => {
    it('arma cada item con su ticket, subtareas y conteo, en el orden de findAll y salteando huérfanos', async () => {
      const deps = conNSatelites(3);
      // El del medio queda huérfano: su ticket base no vuelve del lote, igual
      // que antes no volvía de `findById`.
      deps.ticketRepo.findByIds.mockResolvedValue(
        new Map([
          ['ticket-uuid-0', makeTicket('ticket-uuid-0')],
          ['ticket-uuid-2', makeTicket('ticket-uuid-2')],
        ]),
      );
      const subtareaDeLaPrimera = makeSubtarea('edilicia-uuid-0', 'Cambiar la junta');
      deps.subtareaRepo.findActiveByTicketEdiliciaIds.mockResolvedValue(
        new Map([['edilicia-uuid-0', [subtareaDeLaPrimera]]]),
      );
      deps.comentarioRepo.contarPorTicketEdilicia.mockResolvedValue(
        new Map([['edilicia-uuid-2', 4]]),
      );

      const items = (await deps.useCase.execute()).getValue();

      expect(
        items.map((item) => ({
          ediliciaId: item.ticketEdilicia.id,
          ticketId: item.ticket.id,
          subtareas: item.subtareas,
          cantidadComentarios: item.cantidadComentarios,
        })),
      ).toEqual([
        {
          ediliciaId: 'edilicia-uuid-0',
          ticketId: 'ticket-uuid-0',
          subtareas: [subtareaDeLaPrimera],
          cantidadComentarios: 0,
        },
        {
          ediliciaId: 'edilicia-uuid-2',
          ticketId: 'ticket-uuid-2',
          // Sin subtareas el Map no trae entrada: el item lleva `[]`, nunca
          // `undefined` (el frontend itera esta lista sin chequear).
          subtareas: [],
          cantidadComentarios: 4,
        },
      ]);
    });

    it('omite satélites huérfanos (sin ticket base)', async () => {
      const { useCase, ediliciaRepo } = buildDeps();
      const edilicia = TicketEdiliciaEntity.create(
        { ticketId: 'ticket-huerfano-uuid', ubicacion: 'Edificio Central' },
        'edilicia-uuid',
      );
      ediliciaRepo.findAll.mockResolvedValue([edilicia]);

      const result = await useCase.execute();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([]);
    });
  });
});
