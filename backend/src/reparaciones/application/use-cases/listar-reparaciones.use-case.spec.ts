/**
 * T8.5 [UNIT] — `ListarReparacionesUseCase`.
 *
 * Desde odd/ticket-unificado (S1, S2) la grilla de Edilicia se arma sobre los TICKETS, no sobre el
 * satélite: los de un tipo elegido o, sin tipo, los del módulo EDILICIA, con el mismo alcance que el
 * listado de tickets. Cada ticket se hidrata por lote con sus tareas, comentarios, compras y sector.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1. Tarea: T8.5.
 */
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { CompraVinculada } from '../../domain/services/bloqueo-reparacion';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { ListarReparacionesUseCase } from './listar-reparaciones.use-case';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import {
  ConteoComentariosTicket,
  IConteoComentariosTicketRepository,
} from '../../domain/ports/i-conteo-comentarios-ticket.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

/** ROOT y ADMINISTRADOR: los tests que no versan sobre el alcance por tipo. */
const SIN_RESTRICCION = alcanceSinRestriccion('actor-uuid');
/** Tipos del módulo EDILICIA que devuelve el catálogo: el default sin `tipoId`. */
const TIPOS_EDILICIA = ['tipo-edilicia', 'tipo-mantenimiento'];

function makeTicket(id: string, tipoId = 'tipo-edilicia'): TicketEntity {
  return TicketEntity.create(
    {
      numero: `EDI-${id}`,
      titulo: 'Reparar cañería',
      descripcion: null,
      tipoId,
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'usuario-uuid',
    },
    id,
  );
}

/** Desde odd/tareas-con-tecnico (T3) las subtareas embebidas son las tareas del ticket. */
function makeTarea(ticketId: string, descripcion: string): TareaTicketEntity {
  return TareaTicketEntity.crear({ ticketId, descripcion, orden: 0 });
}

/** Sin ítems cargados y sin cancelar, la compra deriva a PENDIENTE (grupo ACTIVAS) y bloquea. */
const compraActiva: CompraVinculada = {
  compraId: 'compra-1',
  numero: 'COMP-2026-00001',
  tipoTicketId: null,
  cancelada: false,
  items: [],
};

/**
 * Deps con N tickets `t-0..t-(N-1)`, en el orden que devuelve `findAll`. `bloqueados` son los
 * índices con una compra activa vinculada.
 */
function armar(cantidad: number, bloqueados: number[] = []) {
  const tickets = Array.from({ length: cantidad }, (_, i) => makeTicket(`t-${i}`));
  const ticketRepo = {
    findAll: vi.fn<ITicketRepository['findAll']>().mockResolvedValue(tickets),
  };
  const tipoTicketRepo = {
    findIdsByModulos: vi
      .fn<ITipoTicketRepository['findIdsByModulos']>()
      .mockResolvedValue(TIPOS_EDILICIA),
  };
  const tareaRepo = {
    listarPorTickets: vi
      .fn<ITareaTicketRepository['listarPorTickets']>()
      .mockResolvedValue(new Map<string, TareaTicketEntity[]>()),
  };
  const comentarioRepo = {
    contarPorTickets: vi
      .fn<IConteoComentariosTicketRepository['contarPorTickets']>()
      .mockResolvedValue(new Map<string, ConteoComentariosTicket>()),
  };
  const reparacionCompraRepo = {
    findComprasVinculadasByTicketIds: vi
      .fn<ITicketCompraRepository['findComprasVinculadasByTicketIds']>()
      .mockImplementation(
        async (ids) =>
          new Map(
            ids
              .filter((id) => bloqueados.includes(Number(id.split('-')[1])))
              .map((id) => [id, [compraActiva]]),
          ),
      ),
  };
  const sectorRepo = {
    findNombres: vi.fn<ISectorRepository['findNombres']>().mockResolvedValue(new Map()),
  };
  const useCase = new ListarReparacionesUseCase(
    ticketRepo,
    tipoTicketRepo,
    tareaRepo,
    comentarioRepo,
    reparacionCompraRepo,
    sectorRepo,
  );
  return {
    useCase,
    tickets,
    ticketRepo,
    tipoTicketRepo,
    tareaRepo,
    comentarioRepo,
    reparacionCompraRepo,
    sectorRepo,
  };
}

const ids = (items: { ticket: TicketEntity }[]): string[] => items.map((i) => i.ticket.id);

describe('ListarReparacionesUseCase — qué tickets entran (odd/ticket-unificado, S2)', () => {
  it('sin tipo: los tickets de los tipos del módulo EDILICIA', async () => {
    const { useCase, ticketRepo, tipoTicketRepo } = armar(2);

    const items = (await useCase.execute(SIN_RESTRICCION)).getValue();

    expect(tipoTicketRepo.findIdsByModulos).toHaveBeenCalledWith(['EDILICIA']);
    expect(ticketRepo.findAll).toHaveBeenCalledWith({ tiposIds: TIPOS_EDILICIA });
    expect(ids(items)).toEqual(['t-0', 't-1']);
  });

  it('con tipo: los tickets de ese tipo, de cualquier módulo, sin consultar el catálogo', async () => {
    const { useCase, ticketRepo, tipoTicketRepo } = armar(1);

    await useCase.executePaginado({
      pagina: 1,
      porPagina: 10,
      bloqueo: 'TODAS',
      tipoId: 'tipo-soporte',
      alcance: SIN_RESTRICCION,
    });

    expect(ticketRepo.findAll).toHaveBeenCalledWith({ tiposIds: ['tipo-soporte'] });
    expect(tipoTicketRepo.findIdsByModulos).not.toHaveBeenCalled();
  });

  it('si el módulo EDILICIA no tiene tipos, lista vacía sin pedir "todos los tipos" a la base', async () => {
    const { useCase, ticketRepo, tipoTicketRepo } = armar(3);
    tipoTicketRepo.findIdsByModulos.mockResolvedValue([]);

    const items = (await useCase.execute(SIN_RESTRICCION)).getValue();

    expect(items).toEqual([]);
    expect(ticketRepo.findAll).not.toHaveBeenCalled();
  });
});

describe('ListarReparacionesUseCase — alcance por tipo (odd/permisos-por-tipo-ticket, D5 e)', () => {
  it('pide a la base los tipos pedidos con LECTURA, separados por VER_TODOS', async () => {
    const { useCase, ticketRepo } = armar(3);

    const pagina = (
      await useCase.executePaginado({
        pagina: 1,
        porPagina: 10,
        bloqueo: 'TODAS',
        tipoId: null,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-edilicia': ['LECTURA', 'VER_TODOS'],
          'tipo-mantenimiento': ['LECTURA'],
          'tipo-soporte': ['LECTURA', 'VER_TODOS'],
        }),
      })
    ).getValue();

    expect(ticketRepo.findAll).toHaveBeenCalledWith({
      tiposIds: TIPOS_EDILICIA,
      alcance: {
        actorId: 'actor-uuid',
        tiposVerTodos: ['tipo-edilicia'],
        tiposPorFila: ['tipo-mantenimiento'],
      },
    });
    expect(pagina.total).toBe(3);
  });

  it('pedir un tipo sin LECTURA no amplía nada: página vacía sin consultar tickets', async () => {
    const { useCase, ticketRepo } = armar(4);

    const pagina = (
      await useCase.executePaginado({
        pagina: 1,
        porPagina: 10,
        bloqueo: 'TODAS',
        tipoId: 'tipo-soporte',
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-edilicia': ['LECTURA', 'VER_TODOS'],
          'tipo-soporte': ['ALTAS'],
        }),
      })
    ).getValue();

    expect(pagina).toEqual({ items: [], total: 0, pagina: 1, porPagina: 10 });
    expect(ticketRepo.findAll).not.toHaveBeenCalled();
  });

  it('sin ningún tipo con LECTURA: página vacía con total 0, sin consultar la base', async () => {
    const { useCase, ticketRepo, tareaRepo } = armar(4);

    const pagina = (
      await useCase.executePaginado({
        pagina: 1,
        porPagina: 10,
        bloqueo: 'TODAS',
        tipoId: null,
        alcance: alcancePorTipo('actor-uuid', { 'tipo-edilicia': ['ALTAS'] }),
      })
    ).getValue();

    expect(pagina).toEqual({ items: [], total: 0, pagina: 1, porPagina: 10 });
    expect(ticketRepo.findAll).not.toHaveBeenCalled();
    expect(tareaRepo.listarPorTickets).not.toHaveBeenCalled();
  });

  it('el listado completo (exportación) aplica el mismo alcance y el tipo pedido', async () => {
    const { useCase, ticketRepo } = armar(1);

    await useCase.execute(
      alcancePorTipo('actor-uuid', { 'tipo-soporte': ['LECTURA'] }),
      'tipo-soporte',
    );

    expect(ticketRepo.findAll).toHaveBeenCalledWith({
      tiposIds: ['tipo-soporte'],
      alcance: { actorId: 'actor-uuid', tiposVerTodos: [], tiposPorFila: ['tipo-soporte'] },
    });
  });
});

describe('ListarReparacionesUseCase — hidratación por lote (el listado NO puede volver a ser un N+1)', () => {
  /**
   * El test guardián del costo: con 3 tickets cada repositorio se consulta UNA sola vez, con los
   * ids juntos. Si alguien mueve una de estas resoluciones adentro del loop, la cuenta pasa a 3.
   */
  it.each([
    ['las tareas', (d: ReturnType<typeof armar>) => d.tareaRepo.listarPorTickets],
    [
      'el conteo de comentarios',
      (d: ReturnType<typeof armar>) => d.comentarioRepo.contarPorTickets,
    ],
    [
      'las compras vinculadas',
      (d: ReturnType<typeof armar>) => d.reparacionCompraRepo.findComprasVinculadasByTicketIds,
    ],
  ])('resuelve %s en UNA sola consulta por lote de ids de ticket', async (_nombre, doble) => {
    const deps = armar(3);

    await deps.useCase.execute(SIN_RESTRICCION);

    expect(doble(deps)).toHaveBeenCalledTimes(1);
    expect(doble(deps)).toHaveBeenCalledWith(['t-0', 't-1', 't-2']);
  });

  it('con lista vacía no dispara NINGUNA consulta de hidratación', async () => {
    const { useCase, tareaRepo, comentarioRepo, reparacionCompraRepo } = armar(0);

    const result = await useCase.execute(SIN_RESTRICCION);

    expect(result.getValue()).toEqual([]);
    expect(tareaRepo.listarPorTickets).not.toHaveBeenCalled();
    expect(comentarioRepo.contarPorTickets).not.toHaveBeenCalled();
    expect(reparacionCompraRepo.findComprasVinculadasByTicketIds).not.toHaveBeenCalled();
  });

  it('presente y ACTIVAS bloquea; ausente en el Map (no undefined) no bloquea', async () => {
    const { useCase } = armar(2, [0]);

    const items = (await useCase.execute(SIN_RESTRICCION)).getValue();

    expect(items[0].bloqueada).toBe(true);
    expect(items[0].comprasQueBloquean).toEqual([compraActiva]);
    expect(items[1].bloqueada).toBe(false);
    expect(items[1].comprasQueBloquean).toEqual([]);
  });

  it('arma cada item con sus tareas y avance, en el orden de findAll; sin tareas, []', async () => {
    const { useCase, tareaRepo } = armar(2);
    const hecha = makeTarea('t-0', 'Cambiar la junta');
    hecha.completar('tecnico-uuid', new Date('2026-10-13T10:00:00Z'));
    const pendiente = makeTarea('t-0', 'Pintar');
    tareaRepo.listarPorTickets.mockResolvedValue(new Map([['t-0', [hecha, pendiente]]]));

    const items = (await useCase.execute(SIN_RESTRICCION)).getValue();

    expect(ids(items)).toEqual(['t-0', 't-1']);
    expect(items[0].subtareas).toEqual([hecha, pendiente]);
    expect(items.map((item) => item.porcentajeAvance)).toEqual([50, 0]);
    expect(items[1].subtareas).toEqual([]);
  });
});

describe('ListarReparacionesUseCase — compras que bloquean y su tipo (odd/compras-por-tipo, S2)', () => {
  const oculta: CompraVinculada = {
    ...compraActiva,
    compraId: 'compra-oculta',
    tipoTicketId: 'tipo-soporte',
  };
  const visible: CompraVinculada = {
    ...compraActiva,
    compraId: 'compra-visible',
    tipoTicketId: 'tipo-edilicia',
  };
  const sinTipo: CompraVinculada = {
    ...compraActiva,
    compraId: 'compra-sin-tipo',
    tipoTicketId: null,
  };
  const lectorEdilicia = alcancePorTipo('actor-uuid', {
    'tipo-edilicia': ['LECTURA', 'VER_TODOS'],
  });

  it('no publica una compra cuyo tipo el actor no ve, pero el ticket sigue figurando bloqueado', async () => {
    const deps = armar(1);
    deps.reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(
      new Map([['t-0', [oculta]]]),
    );

    const [item] = (await deps.useCase.execute(lectorEdilicia)).getValue();

    expect(item.bloqueada).toBe(true);
    expect(item.comprasQueBloquean).toEqual([]);
  });

  it('publica las compras visibles y las sin tipo, y omite solo la oculta', async () => {
    const deps = armar(1);
    deps.reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(
      new Map([['t-0', [oculta, visible, sinTipo]]]),
    );

    const [item] = (await deps.useCase.execute(lectorEdilicia)).getValue();

    expect(item.comprasQueBloquean.map((c) => c.compraId)).toEqual([
      'compra-visible',
      'compra-sin-tipo',
    ]);
  });

  it('sin restricción publica todas', async () => {
    const deps = armar(1);
    deps.reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(
      new Map([['t-0', [oculta, visible]]]),
    );

    const [item] = (await deps.useCase.execute(SIN_RESTRICCION)).getValue();

    expect(item.comprasQueBloquean.map((c) => c.compraId)).toEqual([
      'compra-oculta',
      'compra-visible',
    ]);
  });
});

describe('ListarReparacionesUseCase — conteo de comentarios (odd/ticket-unificado, S3)', () => {
  /** t-0 con 2 públicos y 3 internos; t-1, de otro tipo, con 1 público y 4 internos. */
  function conComentarios() {
    const deps = armar(0);
    deps.ticketRepo.findAll.mockResolvedValue([
      makeTicket('t-0', 'tipo-edilicia'),
      makeTicket('t-1', 'tipo-mantenimiento'),
    ]);
    deps.comentarioRepo.contarPorTickets.mockResolvedValue(
      new Map([
        ['t-0', { publicos: 2, internos: 3 }],
        ['t-1', { publicos: 1, internos: 4 }],
      ]),
    );
    return deps;
  }

  it('con OBSERVAR sobre el tipo suma los internos; sin OBSERVAR, solo los públicos', async () => {
    const { useCase } = conComentarios();

    const items = (
      await useCase.execute(
        alcancePorTipo('actor-uuid', {
          'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'OBSERVAR'],
          'tipo-mantenimiento': ['LECTURA', 'VER_TODOS'],
        }),
      )
    ).getValue();

    expect(items.map((i) => i.cantidadComentarios)).toEqual([5, 1]);
  });

  it('sin restricción (ROOT y ADMINISTRADOR) cuenta todos', async () => {
    const { useCase } = conComentarios();

    const items = (await useCase.execute(SIN_RESTRICCION)).getValue();

    expect(items.map((i) => i.cantidadComentarios)).toEqual([5, 5]);
  });

  it('un ticket sin comentarios cuenta 0, no undefined', async () => {
    const { useCase } = armar(1);

    const items = (await useCase.execute(SIN_RESTRICCION)).getValue();

    expect(items[0].cantidadComentarios).toBe(0);
  });
});

describe('ListarReparacionesUseCase — sector del ticket (odd/ubicacion-sector-ticket)', () => {
  it('resuelve los nombres en UN lote con los ids distintos; sin sector queda null', async () => {
    const deps = armar(3);
    deps.tickets[0].actualizarDatos({ sectorId: 's-1' });
    deps.tickets[1].actualizarDatos({ sectorId: 's-1' });
    deps.sectorRepo.findNombres.mockResolvedValue(new Map([['s-1', 'Mantenimiento']]));

    const items = (await deps.useCase.execute(SIN_RESTRICCION)).getValue();

    expect(items.map((i) => i.sectorNombre)).toEqual(['Mantenimiento', 'Mantenimiento', null]);
    expect(deps.sectorRepo.findNombres).toHaveBeenCalledTimes(1);
    expect(deps.sectorRepo.findNombres).toHaveBeenCalledWith(['s-1']);
  });

  it('si ningún ticket tiene sector no consulta el catálogo', async () => {
    const deps = armar(2);

    const items = (await deps.useCase.execute(SIN_RESTRICCION)).getValue();

    expect(items.map((i) => i.sectorNombre)).toEqual([null, null]);
    expect(deps.sectorRepo.findNombres).not.toHaveBeenCalled();
  });
});

describe('ListarReparacionesUseCase.executePaginado (odd/reparaciones-paginadas)', () => {
  const pedido = (
    pagina: number,
    porPagina: number,
    bloqueo: 'TODAS' | 'BLOQUEADAS' | 'NO_BLOQUEADAS' = 'TODAS',
  ) => ({ pagina, porPagina, bloqueo, tipoId: null, alcance: SIN_RESTRICCION });

  it('devuelve solo la página pedida, en el orden de findAll, con el total de todas', async () => {
    const { useCase } = armar(25);

    const pagina = (await useCase.executePaginado(pedido(2, 10))).getValue();

    expect(pagina.total).toBe(25);
    expect(pagina.pagina).toBe(2);
    expect(pagina.porPagina).toBe(10);
    expect(ids(pagina.items)).toEqual(Array.from({ length: 10 }, (_, i) => `t-${i + 10}`));
  });

  it('la última página trae el resto, y una página fuera de rango viene vacía con el total real', async () => {
    const { useCase } = armar(25);

    const ultima = (await useCase.executePaginado(pedido(3, 10))).getValue();
    const fuera = (await useCase.executePaginado(pedido(9, 10))).getValue();

    expect(ids(ultima.items)).toEqual(['t-20', 't-21', 't-22', 't-23', 't-24']);
    expect(fuera.items).toEqual([]);
    expect(fuera.total).toBe(25);
  });

  it('hidrata solo los tickets de la página, no todos', async () => {
    const { useCase, tareaRepo, comentarioRepo } = armar(25);

    await useCase.executePaginado(pedido(1, 10));

    expect(tareaRepo.listarPorTickets.mock.calls[0][0]).toHaveLength(10);
    expect(comentarioRepo.contarPorTickets.mock.calls[0][0]).toHaveLength(10);
  });

  it('filtra por bloqueo sobre TODOS antes de paginar: total y páginas cuentan solo los que cumplen', async () => {
    const { useCase } = armar(25, [1, 12, 13, 24]);

    const bloqueados = (await useCase.executePaginado(pedido(1, 3, 'BLOQUEADAS'))).getValue();
    const segunda = (await useCase.executePaginado(pedido(2, 3, 'BLOQUEADAS'))).getValue();
    const libres = (await useCase.executePaginado(pedido(1, 50, 'NO_BLOQUEADAS'))).getValue();

    expect(bloqueados.total).toBe(4);
    expect(ids(bloqueados.items)).toEqual(['t-1', 't-12', 't-13']);
    expect(bloqueados.items.every((item) => item.bloqueada)).toBe(true);
    expect(ids(segunda.items)).toEqual(['t-24']);
    expect(libres.total).toBe(21);
    expect(libres.items.some((item) => item.bloqueada)).toBe(false);
  });

  it('sin tickets devuelve página vacía con total 0', async () => {
    const { useCase } = armar(0);

    const pagina = (await useCase.executePaginado(pedido(1, 20, 'BLOQUEADAS'))).getValue();

    expect(pagina).toEqual({ items: [], total: 0, pagina: 1, porPagina: 20 });
  });

  it('con filtro, una página fuera de rango viene vacía con el total filtrado', async () => {
    const { useCase } = armar(5, [0]);

    const pagina = (await useCase.executePaginado(pedido(2, 10, 'BLOQUEADAS'))).getValue();

    expect(pagina.items).toEqual([]);
    expect(pagina.total).toBe(1);
  });

  it('sin filtro de bloqueo, las compras vinculadas se consultan una sola vez y solo para la página', async () => {
    const { useCase, reparacionCompraRepo } = armar(25);

    await useCase.executePaginado(pedido(1, 10));

    expect(reparacionCompraRepo.findComprasVinculadasByTicketIds).toHaveBeenCalledTimes(1);
    expect(reparacionCompraRepo.findComprasVinculadasByTicketIds.mock.calls[0][0]).toHaveLength(10);
  });
});
