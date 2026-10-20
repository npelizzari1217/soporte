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
import { CompraVinculada } from '../../domain/services/bloqueo-reparacion';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ListarReparacionesUseCase } from './listar-reparaciones.use-case';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import { IComentarioReparacionRepository } from '../../domain/ports/i-comentario-reparacion.repository';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';

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

/**
 * Desde odd/tareas-con-tecnico (T3) las subtareas embebidas son las tareas del ticket base
 * (`tareas_ticket`), pedidas por `ticket_id`.
 */
function makeSubtarea(ticketId: string, descripcion: string): TareaTicketEntity {
  return TareaTicketEntity.crear({ ticketId, descripcion, orden: 0 });
}

describe('ListarReparacionesUseCase', () => {
  function buildDeps() {
    const ediliciaRepo = { findAll: vi.fn<ITicketEdiliciaRepository['findAll']>() };
    const ticketRepo = {
      findByIds: vi
        .fn<ITicketRepository['findByIds']>()
        .mockResolvedValue(new Map<string, TicketEntity>()),
    };
    const subtareaRepo = {
      listarPorTickets: vi
        .fn<ITareaTicketRepository['listarPorTickets']>()
        .mockResolvedValue(new Map<string, TareaTicketEntity[]>()),
    };
    const comentarioRepo = {
      contarPorTicketEdilicia: vi
        .fn<IComentarioReparacionRepository['contarPorTicketEdilicia']>()
        .mockResolvedValue(new Map<string, number>()),
    };
    // Quinto doble, WU3: por defecto ninguna reparación tiene compras
    // vinculadas — el Map vacío es el mismo contrato de ausencia que ya usan
    // subtareas/comentarios (ausencia = `[]`, nunca `undefined`).
    const reparacionCompraRepo = {
      findComprasVinculadasByTicketEdiliciaIds: vi
        .fn<IReparacionCompraRepository['findComprasVinculadasByTicketEdiliciaIds']>()
        .mockResolvedValue(new Map<string, CompraVinculada[]>()),
    };
    const sectorRepo = {
      findNombres: vi.fn<ISectorRepository['findNombres']>().mockResolvedValue(new Map()),
    };
    const useCase = new ListarReparacionesUseCase(
      ediliciaRepo,
      ticketRepo,
      subtareaRepo,
      comentarioRepo,
      reparacionCompraRepo,
      sectorRepo,
    );
    return {
      useCase,
      sectorRepo,
      ediliciaRepo,
      ticketRepo,
      subtareaRepo,
      comentarioRepo,
      reparacionCompraRepo,
    };
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
    const subtarea = makeSubtarea('ticket-uuid', 'Cambiar la junta');
    ediliciaRepo.findAll.mockResolvedValue([edilicia]);
    ticketRepo.findByIds.mockResolvedValue(new Map([['ticket-uuid', ticket]]));
    subtareaRepo.listarPorTickets.mockResolvedValue(new Map([['ticket-uuid', [subtarea]]]));

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
        doble: (deps: ReturnType<typeof conNSatelites>) => deps.subtareaRepo.listarPorTickets,
        idsEsperados: ['ticket-uuid-0', 'ticket-uuid-1', 'ticket-uuid-2'],
      },
      {
        nombre: 'el conteo de comentarios',
        doble: (deps: ReturnType<typeof conNSatelites>) =>
          deps.comentarioRepo.contarPorTicketEdilicia,
        idsEsperados: ['edilicia-uuid-0', 'edilicia-uuid-1', 'edilicia-uuid-2'],
      },
      {
        nombre: 'las compras vinculadas',
        doble: (deps: ReturnType<typeof conNSatelites>) =>
          deps.reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds,
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
      const {
        useCase,
        ediliciaRepo,
        ticketRepo,
        subtareaRepo,
        comentarioRepo,
        reparacionCompraRepo,
      } = buildDeps();
      ediliciaRepo.findAll.mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result.getValue()).toEqual([]);
      expect(ticketRepo.findByIds).not.toHaveBeenCalled();
      expect(subtareaRepo.listarPorTickets).not.toHaveBeenCalled();
      expect(comentarioRepo.contarPorTicketEdilicia).not.toHaveBeenCalled();
      expect(reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds).not.toHaveBeenCalled();
    });

    it('usa las compras vinculadas por lote: presente y ACTIVAS bloquea; ausente en el Map (no undefined) no bloquea', async () => {
      const deps = conNSatelites(2);
      const compraActiva: CompraVinculada = {
        compraId: 'compra-uuid-1',
        numero: 'COMP-2026-00001',
        cancelada: false,
        items: [],
      };
      deps.reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(
        new Map([['edilicia-uuid-0', [compraActiva]]]),
      );

      const items = (await deps.useCase.execute()).getValue();

      expect(items[0].bloqueada).toBe(true);
      expect(items[0].comprasQueBloquean).toEqual([compraActiva]);
      // edilicia-uuid-1 no tiene entrada en el Map: ausencia = `[]`, nunca `undefined`.
      expect(items[1].bloqueada).toBe(false);
      expect(items[1].comprasQueBloquean).toEqual([]);
    });
  });

  describe('sector del ticket base (odd/ubicacion-sector-ticket)', () => {
    it('resuelve los nombres en UN lote con los ids distintos; sin sector queda null', async () => {
      const deps = conNSatelites(3);
      const tickets = ['ticket-uuid-0', 'ticket-uuid-1', 'ticket-uuid-2'].map(makeTicket);
      tickets[0].actualizarDatos({ sectorId: 's-1' });
      tickets[1].actualizarDatos({ sectorId: 's-1' });
      deps.ticketRepo.findByIds.mockResolvedValue(new Map(tickets.map((t) => [t.id, t])));
      deps.sectorRepo.findNombres.mockResolvedValue(new Map([['s-1', 'Mantenimiento']]));

      const items = (await deps.useCase.execute()).getValue();

      expect(items.map((i) => i.sectorNombre)).toEqual(['Mantenimiento', 'Mantenimiento', null]);
      expect(deps.sectorRepo.findNombres).toHaveBeenCalledTimes(1);
      expect(deps.sectorRepo.findNombres).toHaveBeenCalledWith(['s-1']);
    });

    it('si ningun ticket tiene sector no consulta el catalogo', async () => {
      const deps = conNSatelites(2);

      const items = (await deps.useCase.execute()).getValue();

      expect(items.map((i) => i.sectorNombre)).toEqual([null, null]);
      expect(deps.sectorRepo.findNombres).not.toHaveBeenCalled();
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
      const subtareaDeLaPrimera = makeSubtarea('ticket-uuid-0', 'Cambiar la junta');
      deps.subtareaRepo.listarPorTickets.mockResolvedValue(
        new Map([['ticket-uuid-0', [subtareaDeLaPrimera]]]),
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

    it('calcula el avance al leer sobre las tareas del ticket', async () => {
      const deps = conNSatelites(2);
      const hecha = makeSubtarea('ticket-uuid-0', 'Cambiar la junta');
      hecha.completar('tecnico-uuid', new Date('2026-10-13T10:00:00Z'));
      const pendiente = makeSubtarea('ticket-uuid-0', 'Pintar');
      deps.subtareaRepo.listarPorTickets.mockResolvedValue(
        new Map([['ticket-uuid-0', [hecha, pendiente]]]),
      );

      const items = (await deps.useCase.execute()).getValue();

      expect(items.map((item) => item.porcentajeAvance)).toEqual([50, 0]);
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

describe('ListarReparacionesUseCase.executePaginado (odd/reparaciones-paginadas)', () => {
  function armar(cantidad: number, bloqueadas: number[] = []) {
    const satelites = Array.from({ length: cantidad }, (_, i) =>
      TicketEdiliciaEntity.create({ ticketId: `t-${i}`, ubicacion: null }, `e-${i}`),
    );
    const ediliciaRepo = {
      findAll: vi.fn<ITicketEdiliciaRepository['findAll']>().mockResolvedValue(satelites),
    };
    const ticketRepo = {
      findByIds: vi
        .fn<ITicketRepository['findByIds']>()
        .mockImplementation(async (ids) => new Map(ids.map((id) => [id, makeTicket(id)]))),
    };
    const tareaRepo = {
      listarPorTickets: vi
        .fn<ITareaTicketRepository['listarPorTickets']>()
        .mockResolvedValue(new Map()),
    };
    const comentarioRepo = {
      contarPorTicketEdilicia: vi
        .fn<IComentarioReparacionRepository['contarPorTicketEdilicia']>()
        .mockResolvedValue(new Map()),
    };
    // Sin ítems cargados y sin cancelar, la compra deriva a PENDIENTE (grupo ACTIVAS) y bloquea.
    const compraActiva: CompraVinculada = {
      compraId: 'compra-1',
      numero: 'COMP-2026-00001',
      cancelada: false,
      items: [],
    };
    const reparacionCompraRepo = {
      findComprasVinculadasByTicketEdiliciaIds: vi
        .fn<IReparacionCompraRepository['findComprasVinculadasByTicketEdiliciaIds']>()
        .mockImplementation(
          async (ids) =>
            new Map(
              ids
                .filter((id) => bloqueadas.includes(Number(id.split('-')[1])))
                .map((id) => [id, [compraActiva]]),
            ),
        ),
    };
    const sectorRepo = {
      findNombres: vi.fn<ISectorRepository['findNombres']>().mockResolvedValue(new Map()),
    };
    const useCase = new ListarReparacionesUseCase(
      ediliciaRepo,
      ticketRepo,
      tareaRepo,
      comentarioRepo,
      reparacionCompraRepo,
      sectorRepo,
    );
    return { useCase, ticketRepo, tareaRepo };
  }

  it('devuelve solo la página pedida, en el orden de findAll, con el total de todas', async () => {
    const { useCase } = armar(25);

    const pagina = (
      await useCase.executePaginado({ pagina: 2, porPagina: 10, bloqueo: 'TODAS' })
    ).getValue();

    expect(pagina.total).toBe(25);
    expect(pagina.pagina).toBe(2);
    expect(pagina.porPagina).toBe(10);
    expect(pagina.items.map((item) => item.ticketEdilicia.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `e-${i + 10}`),
    );
  });

  it('la última página trae el resto, y una página fuera de rango viene vacía con el total real', async () => {
    const { useCase } = armar(25);

    const ultima = (
      await useCase.executePaginado({ pagina: 3, porPagina: 10, bloqueo: 'TODAS' })
    ).getValue();
    const fuera = (
      await useCase.executePaginado({ pagina: 9, porPagina: 10, bloqueo: 'TODAS' })
    ).getValue();

    expect(ultima.items.map((item) => item.ticketEdilicia.id)).toEqual([
      'e-20',
      'e-21',
      'e-22',
      'e-23',
      'e-24',
    ]);
    expect(fuera.items).toEqual([]);
    expect(fuera.total).toBe(25);
  });

  it('hidrata solo las reparaciones de la página, no todas', async () => {
    const { useCase, ticketRepo, tareaRepo } = armar(25);

    await useCase.executePaginado({ pagina: 1, porPagina: 10, bloqueo: 'TODAS' });

    expect(ticketRepo.findByIds).toHaveBeenCalledTimes(1);
    expect(ticketRepo.findByIds.mock.calls[0][0]).toHaveLength(10);
    expect(tareaRepo.listarPorTickets.mock.calls[0][0]).toHaveLength(10);
  });

  it('filtra por bloqueo sobre TODAS antes de paginar: total y páginas cuentan solo las que cumplen', async () => {
    // Bloqueadas repartidas en distintas "páginas" del listado sin filtrar.
    const { useCase } = armar(25, [1, 12, 13, 24]);

    const bloqueadas = (
      await useCase.executePaginado({ pagina: 1, porPagina: 3, bloqueo: 'BLOQUEADAS' })
    ).getValue();
    const segunda = (
      await useCase.executePaginado({ pagina: 2, porPagina: 3, bloqueo: 'BLOQUEADAS' })
    ).getValue();
    const libres = (
      await useCase.executePaginado({ pagina: 1, porPagina: 50, bloqueo: 'NO_BLOQUEADAS' })
    ).getValue();

    expect(bloqueadas.total).toBe(4);
    expect(bloqueadas.items.map((item) => item.ticketEdilicia.id)).toEqual(['e-1', 'e-12', 'e-13']);
    expect(bloqueadas.items.every((item) => item.bloqueada)).toBe(true);
    expect(segunda.items.map((item) => item.ticketEdilicia.id)).toEqual(['e-24']);
    expect(libres.total).toBe(21);
    expect(libres.items.some((item) => item.bloqueada)).toBe(false);
  });

  it('sin reparaciones devuelve página vacía con total 0', async () => {
    const { useCase } = armar(0);

    const pagina = (
      await useCase.executePaginado({ pagina: 1, porPagina: 20, bloqueo: 'BLOQUEADAS' })
    ).getValue();

    expect(pagina).toEqual({ items: [], total: 0, pagina: 1, porPagina: 20 });
  });
});
