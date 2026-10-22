/**
 * T6.4 [UNIT] — RED→GREEN: `ListarTicketsUseCase` (T7 — filtros + scope +
 * ciclo efectivo + paginación; odd/permisos-por-tipo-ticket D5 e — alcance por tipo).
 *
 * Ref spec: sdd/tickets-core/spec T7. Tarea: T6.4.
 */
import { ListarTicketsUseCase } from './listar-tickets.use-case';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import type { Mock } from 'vitest';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { unstubbed } from '../../../testing/mocks';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { TicketsBorradosSoloAdministradorError } from '../../domain/errors/tickets.errors';

/** Filtros de la primera llamada a `findAll`; falla si no hubo llamada o vino sin filtros. */
function filtrosDeLaPrimeraLlamada(findAll: Mock<ITicketRepository['findAll']>): TicketFiltros {
  const filtros = findAll.mock.calls[0]?.[0];
  if (!filtros) {
    throw new Error('findAll no se llamó con filtros');
  }
  return filtros;
}

const ACTOR = 'actor-uuid';
const SOPORTE = 'tipo-soporte-id';
const MANTENIMIENTO = 'tipo-mantenimiento-id';
const ELECTRICIDAD = 'tipo-electricidad-id';
/** Ve todo (ROOT y ADMINISTRADOR): sin restricción por tipo. */
const SIN_RESTRICCION = alcanceSinRestriccion(ACTOR);

describe('ListarTicketsUseCase', () => {
  function makeCollaborators(cicloActivo: CicloClienteEntity | null) {
    const ticketRepo = {
      findAll: vi.fn<ITicketRepository['findAll']>().mockResolvedValue([]),
      count: vi.fn<ITicketRepository['count']>().mockResolvedValue(0),
      findById: unstubbed('findById'),
      findByIds: unstubbed('findByIds'),
      findByNumero: unstubbed('findByNumero'),
      findLastSecuencia: unstubbed('findLastSecuencia'),
      esVisiblePara: unstubbed('esVisiblePara'),
      bloquear: unstubbed('bloquear'),
      save: unstubbed('save'),
      delete: unstubbed('delete'),
      borrarSiActivo: unstubbed('borrarSiActivo'),
      recuperarSiBorrado: unstubbed('recuperarSiBorrado'),
    };
    const cicloClienteRepo = {
      findActive: vi.fn<ICicloClienteRepository['findActive']>().mockResolvedValue(cicloActivo),
      findById: unstubbed('findById'),
      findAll: unstubbed('findAll'),
      save: unstubbed('save'),
    };
    const useCase = new ListarTicketsUseCase(ticketRepo, cicloClienteRepo);
    return { useCase, ticketRepo, cicloClienteRepo };
  }

  const CICLO = CicloClienteEntity.create(
    {
      cicloVigenteId: 'ciclo-vigente-uuid',
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    'ciclo-activo-uuid',
  );

  it('sin cicloId explícito y CON ciclo activo → usa el ciclo activo como default', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ alcance: SIN_RESTRICCION });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-activo-uuid' }),
    );
  });

  it('sin cicloId explícito y SIN ciclo activo → lista vacía, sin consultar el repo', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ alcance: SIN_RESTRICCION });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().items).toEqual([]);
    expect(result.getValue().total).toBe(0);
    expect(c.ticketRepo.findAll).not.toHaveBeenCalled();
  });

  it('cicloId explícito (histórico) tiene prioridad sobre el activo', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({
      alcance: SIN_RESTRICCION,
      filtros: { cicloId: 'ciclo-historico-uuid' },
    });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-historico-uuid' }),
    );
    expect(c.cicloClienteRepo.findActive).not.toHaveBeenCalled();
  });

  describe('filtro "Borrados" (odd/permisos-por-tipo-ticket, S8)', () => {
    it('ADMINISTRADOR o ROOT: llega al repositorio con el mismo ciclo y paginación', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        alcance: SIN_RESTRICCION,
        filtros: { borrados: true },
      });

      expect(result.isOk()).toBe(true);
      expect(filtrosDeLaPrimeraLlamada(c.ticketRepo.findAll)).toMatchObject({
        borrados: true,
        cicloId: 'ciclo-activo-uuid',
      });
      expect(c.ticketRepo.count).toHaveBeenCalledWith(expect.objectContaining({ borrados: true }));
    });

    it('cualquier otro actor: 403 sin consultar, aunque tenga Ver todos y Borrar', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        alcance: alcancePorTipo(ACTOR, { [SOPORTE]: ['LECTURA', 'VER_TODOS', 'BORRADO'] }),
        filtros: { borrados: true },
      });

      expect(result.getError()).toBeInstanceOf(TicketsBorradosSoloAdministradorError);
      expect(c.ticketRepo.findAll).not.toHaveBeenCalled();
      expect(c.ticketRepo.count).not.toHaveBeenCalled();
    });

    it('borrados: false no es el filtro: cualquier actor lista los activos', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        alcance: alcancePorTipo(ACTOR, { [SOPORTE]: ['LECTURA'] }),
        filtros: { borrados: false },
      });

      expect(result.isOk()).toBe(true);
      expect(c.ticketRepo.findAll).toHaveBeenCalled();
    });
  });

  it('propaga filtros combinables (estado/tipo/prioridad/asignado/fecha)', async () => {
    const c = makeCollaborators(CICLO);
    const fechaDesde = new Date('2026-01-01');
    const fechaHasta = new Date('2026-06-30');

    await c.useCase.execute({
      alcance: SIN_RESTRICCION,
      filtros: {
        estadoId: 'estado-uuid',
        tiposIds: ['tipo-uuid'],
        prioridadId: 'prioridad-uuid',
        asignadoId: 'asignado-uuid',
        fechaDesde,
        fechaHasta,
      },
    });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        estadoId: 'estado-uuid',
        tiposIds: ['tipo-uuid'],
        prioridadId: 'prioridad-uuid',
        asignadoId: 'asignado-uuid',
        fechaDesde,
        fechaHasta,
      }),
    );
  });

  it('paginación: pagina/porPagina se traducen a limit/offset y count() ignora la paginación', async () => {
    const c = makeCollaborators(CICLO);
    c.ticketRepo.count.mockResolvedValue(45);

    const result = await c.useCase.execute({
      alcance: SIN_RESTRICCION,
      pagina: 3,
      porPagina: 10,
    });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 }),
    );
    expect(c.ticketRepo.count).toHaveBeenCalledWith(
      expect.not.objectContaining({ limit: expect.anything(), offset: expect.anything() }),
    );
    expect(result.getValue().total).toBe(45);
    expect(result.getValue().pagina).toBe(3);
    expect(result.getValue().porPagina).toBe(10);
  });

  it('paginación por default: pagina=1, porPagina=20', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ alcance: SIN_RESTRICCION });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  it('B1/B2: propaga busqueda combinada con los filtros existentes y el alcance del actor', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({
      alcance: alcancePorTipo(ACTOR, { [SOPORTE]: ['LECTURA'] }),
      filtros: { busqueda: 'impresora', estadoId: 'estado-uuid' },
    });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        busqueda: 'impresora',
        estadoId: 'estado-uuid',
        alcance: { actorId: ACTOR, tiposVerTodos: [], tiposPorFila: [SOPORTE] },
      }),
    );
  });

  it('B1/B2: busqueda ausente no filtra por texto (queda undefined)', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ alcance: SIN_RESTRICCION });

    const filtrosRecibidos = filtrosDeLaPrimeraLlamada(c.ticketRepo.findAll);
    expect(filtrosRecibidos.busqueda).toBeUndefined();
  });

  describe('alcance por tipo (odd/permisos-por-tipo-ticket, D5 e)', () => {
    it('ROOT y ADMINISTRADOR (sin restricción): ni alcance ni tipos forzados', async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({ alcance: SIN_RESTRICCION });

      const filtros = filtrosDeLaPrimeraLlamada(c.ticketRepo.findAll);
      expect(filtros.alcance).toBeUndefined();
      expect(filtros.tiposIds).toBeUndefined();
    });

    it('solo los tipos con LECTURA; VER_TODOS en un tipo, regla de fila en el otro; findAll y count con el mismo alcance', async () => {
      const c = makeCollaborators(CICLO);
      c.ticketRepo.count.mockResolvedValue(7);

      const result = await c.useCase.execute({
        alcance: alcancePorTipo(ACTOR, {
          [SOPORTE]: ['LECTURA', 'VER_TODOS'],
          [MANTENIMIENTO]: ['LECTURA', 'MODIFICACION'],
          // Sin LECTURA el tipo no entra, aunque tenga otras acciones.
          [ELECTRICIDAD]: ['VER_TODOS', 'MODIFICACION'],
        }),
      });

      const esperado = { actorId: ACTOR, tiposVerTodos: [SOPORTE], tiposPorFila: [MANTENIMIENTO] };
      expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ alcance: esperado }),
      );
      expect(c.ticketRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ alcance: esperado }),
      );
      expect(result.getValue().total).toBe(7);
    });

    it('el tipo pedido por el caller se intersecta con los tipos con LECTURA (nunca amplía el alcance)', async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({
        alcance: alcancePorTipo(ACTOR, {
          [SOPORTE]: ['LECTURA', 'VER_TODOS'],
          [MANTENIMIENTO]: ['LECTURA'],
        }),
        filtros: { tiposIds: [MANTENIMIENTO] },
      });

      expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          tiposIds: [MANTENIMIENTO],
          alcance: { actorId: ACTOR, tiposVerTodos: [], tiposPorFila: [MANTENIMIENTO] },
        }),
      );
    });

    it('pedir un tipo sin LECTURA → lista vacía con total 0, sin consultar la base', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        alcance: alcancePorTipo(ACTOR, {
          [SOPORTE]: ['LECTURA', 'VER_TODOS'],
          [ELECTRICIDAD]: ['VER_TODOS'],
        }),
        filtros: { tiposIds: [ELECTRICIDAD] },
      });

      expect(result.getValue()).toEqual({ items: [], total: 0, pagina: 1, porPagina: 20 });
      expect(c.ticketRepo.findAll).not.toHaveBeenCalled();
      expect(c.ticketRepo.count).not.toHaveBeenCalled();
    });

    it('un usuario sin filas por tipo no ve nada, aunque tenga ciclo activo', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({ alcance: alcancePorTipo(ACTOR, {}) });

      expect(result.getValue().items).toEqual([]);
      expect(result.getValue().total).toBe(0);
      expect(c.ticketRepo.findAll).not.toHaveBeenCalled();
    });
  });
});
