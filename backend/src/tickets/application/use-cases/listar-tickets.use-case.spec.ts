/**
 * T6.4 [UNIT] — RED→GREEN: `ListarTicketsUseCase` (T7 — filtros + scope +
 * ciclo efectivo + paginación).
 *
 * Ref spec: sdd/tickets-core/spec T7. Tarea: T6.4.
 */
import { ListarTicketsUseCase } from './listar-tickets.use-case';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

describe('ListarTicketsUseCase', () => {
  function makeCollaborators(cicloActivo: CicloClienteEntity | null) {
    const ticketRepo = {
      findAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    const cicloClienteRepo = { findActive: vi.fn().mockResolvedValue(cicloActivo) };
    // Por default cada código resuelve a `tipo-<codigo>-id` (el tenant tiene
    // los tipos built-in). Los tests de módulo lo sobreescriben si hace falta.
    const tipoTicketRepo = {
      findIdByCodigo: vi.fn(async (codigo: string) => `tipo-${codigo}-id`),
    };
    const useCase = new ListarTicketsUseCase(
      ticketRepo as never,
      cicloClienteRepo as never,
      tipoTicketRepo as never,
    );
    return { useCase, ticketRepo, cicloClienteRepo, tipoTicketRepo };
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

    await c.useCase.execute({ actorId: 'actor-uuid', tienePermisoVerTodos: true });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-activo-uuid' }),
    );
  });

  it('sin cicloId explícito y SIN ciclo activo → lista vacía, sin consultar el repo', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ actorId: 'actor-uuid', tienePermisoVerTodos: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().items).toEqual([]);
    expect(result.getValue().total).toBe(0);
    expect(c.ticketRepo.findAll).not.toHaveBeenCalled();
  });

  it('cicloId explícito (histórico) tiene prioridad sobre el activo', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
      filtros: { cicloId: 'ciclo-historico-uuid' },
    });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-historico-uuid' }),
    );
    expect(c.cicloClienteRepo.findActive).not.toHaveBeenCalled();
  });

  it('actor SIN ticket:ver_todos → deriva soloSolicitante = actorId', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ actorId: 'actor-uuid', tienePermisoVerTodos: false });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ soloSolicitante: 'actor-uuid' }),
    );
  });

  it('actor CON ticket:ver_todos → soloSolicitante queda undefined (ve todos)', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ actorId: 'actor-uuid', tienePermisoVerTodos: true });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ soloSolicitante: undefined }),
    );
  });

  it('propaga filtros combinables (estado/tipo/prioridad/asignado/fecha)', async () => {
    const c = makeCollaborators(CICLO);
    const fechaDesde = new Date('2026-01-01');
    const fechaHasta = new Date('2026-06-30');

    await c.useCase.execute({
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
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
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
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

    await c.useCase.execute({ actorId: 'actor-uuid', tienePermisoVerTodos: true });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  it('B1/B2: propaga busqueda combinada con los filtros existentes y el scope de solicitante', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({
      actorId: 'actor-uuid',
      tienePermisoVerTodos: false,
      filtros: { busqueda: 'impresora', estadoId: 'estado-uuid' },
    });

    expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        busqueda: 'impresora',
        estadoId: 'estado-uuid',
        soloSolicitante: 'actor-uuid',
      }),
    );
  });

  it('B1/B2: busqueda ausente no filtra por texto (queda undefined)', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ actorId: 'actor-uuid', tienePermisoVerTodos: true });

    const filtrosRecibidos = c.ticketRepo.findAll.mock.calls[0][0];
    expect(filtrosRecibidos.busqueda).toBeUndefined();
  });

  describe('gate de módulo (5.2 CAPA 2)', () => {
    it('modulosPermitidos=null (ROOT/ADMINISTRADOR) → no filtra por tipo', async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({
        actorId: 'actor-uuid',
        tienePermisoVerTodos: true,
        modulosPermitidos: null,
      });

      expect(c.tipoTicketRepo.findIdByCodigo).not.toHaveBeenCalled();
      const filtrosRecibidos = c.ticketRepo.findAll.mock.calls[0][0];
      expect(filtrosRecibidos.tiposIds).toBeUndefined();
    });

    it("modulosPermitidos=['SOPORTE'] → filtra a los tipoIds del código SOPORTE", async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({
        actorId: 'actor-uuid',
        tienePermisoVerTodos: true,
        modulosPermitidos: ['SOPORTE'],
      });

      expect(c.tipoTicketRepo.findIdByCodigo).toHaveBeenCalledWith('SOPORTE');
      expect(c.ticketRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ tiposIds: ['tipo-SOPORTE-id'] }),
      );
    });

    it("modulosPermitidos=['EQUIPOS'] (sin tipo mapeable) → items vacío, sin tocar el repo de tickets", async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        actorId: 'actor-uuid',
        tienePermisoVerTodos: true,
        modulosPermitidos: ['EQUIPOS'],
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().items).toEqual([]);
      expect(result.getValue().total).toBe(0);
      expect(c.tipoTicketRepo.findIdByCodigo).not.toHaveBeenCalled();
      expect(c.ticketRepo.findAll).not.toHaveBeenCalled();
    });

    it('intersecta el tipo pedido por el caller con los tipos del módulo (nunca amplía el scope)', async () => {
      const c = makeCollaborators(CICLO);

      // Usuario con SOPORTE (→ tipo-SOPORTE-id) pide explícitamente un tipo
      // fuera de su módulo → intersección vacía → items vacío.
      const result = await c.useCase.execute({
        actorId: 'actor-uuid',
        tienePermisoVerTodos: true,
        modulosPermitidos: ['SOPORTE'],
        filtros: { tiposIds: ['tipo-COMPRAS-id'] },
      });

      expect(result.getValue().items).toEqual([]);
      expect(c.ticketRepo.findAll).not.toHaveBeenCalled();
    });
  });
});
