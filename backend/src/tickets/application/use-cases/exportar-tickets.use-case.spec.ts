/**
 * [UNIT] RED→GREEN: `ExportarTicketsUseCase` — exportación del listado de
 * tickets a CSV (sdd/exportar-listados-csv, capability exportacion-tickets).
 *
 * Lo que se fija acá:
 * - `ExportarTicketsUseCase` COMPONE `ListarTicketsUseCase` (no un
 *   `ITicketRepository` propio): el test de scope por fila usa la instancia
 *   REAL de `ListarTicketsUseCase` para probar que la restricción de rol
 *   (`soloSolicitante`, T7) se hereda estructuralmente, no por convención.
 * - `fechaCierre` (`@db.Date`) y `createdAt` (`@db.Timestamptz`) usan
 *   formateadores DISTINTOS — `fechaCsv` sin desplazar, `fechaHoraCsv`
 *   desplazando a hora de Argentina — verificados en la MISMA fila.
 * - El tope de filas corta con un error de dominio, sin truncar en silencio.
 * - Inyección de fórmula CSV en una celda de texto libre (`titulo`).
 */
import { ExportarTicketsUseCase } from './exportar-tickets.use-case';
import { ListarTicketsUseCase } from './listar-tickets.use-case';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/tickets.errors';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

const BOM = '﻿';

/** Devuelve las líneas del CSV, sin BOM. */
function lineas(contenido: string): string[] {
  return contenido.slice(BOM.length).split('\r\n');
}

function crearTicket(
  overrides: Partial<TicketProps> & { id?: string; createdAt?: Date } = {},
): TicketEntity {
  const props: TicketProps = {
    numero: overrides.numero ?? 'SOP-2026-00001',
    titulo: overrides.titulo ?? 'Ticket de prueba',
    descripcion: null,
    tipoId: overrides.tipoId ?? 'tipo-1',
    estadoId: overrides.estadoId ?? 'estado-1',
    prioridadId: overrides.prioridadId ?? 'prioridad-1',
    cicloId: overrides.cicloId ?? 'ciclo-1',
    ticketReferenciaId: null,
    solicitanteId: overrides.solicitanteId ?? 'solicitante-1',
    asignadoId: overrides.asignadoId ?? null,
    slaVenceAt: null,
    vencido: false,
    fechaCierre: overrides.fechaCierre ?? null,
  };
  return TicketEntity.reconstitute(
    props,
    overrides.id ?? 'ticket-1',
    overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    new Date('2026-01-01T00:00:00.000Z'),
    null,
  );
}

function crearEstadoRepo(estados: Array<{ id: string; codigo: string; nombre: string }>) {
  return {
    findAllActive: vi
      .fn()
      .mockResolvedValue(
        estados.map((e) =>
          EstadoEntity.create(
            { codigo: e.codigo, nombre: e.nombre, color: null, orden: 1, activo: true },
            e.id,
          ),
        ),
      ),
  };
}

function crearPrioridadRepo(prioridades: Array<{ id: string; codigo: string; nombre: string }>) {
  return {
    findAllActive: vi
      .fn()
      .mockResolvedValue(
        prioridades.map((p) =>
          PrioridadEntity.create(
            { codigo: p.codigo, nombre: p.nombre, color: null, orden: 1, activo: true },
            p.id,
          ),
        ),
      ),
  };
}

function crearUsuarioMasterChecker(
  nombres: Map<string, { nombre: string; apellido: string }> = new Map(),
) {
  return { resolverNombres: vi.fn().mockResolvedValue(nombres) };
}

/** `ListarTicketsUseCase` FAKE — controla `items`/`total` sin pasar por la máquina de scope real. */
function crearListarTicketsFake(items: TicketEntity[], total = items.length) {
  const execute = vi.fn().mockResolvedValue({
    isFail: () => false,
    getValue: () => ({ items, total, pagina: 1, porPagina: TOPE_FILAS_EXPORT }),
  });
  return { execute } as unknown as ListarTicketsUseCase;
}

describe('ExportarTicketsUseCase', () => {
  const ESTADOS = [{ id: 'estado-1', codigo: 'NUEVO', nombre: 'Nuevo' }];
  const PRIORIDADES = [{ id: 'prioridad-1', codigo: 'ALTA', nombre: 'Alta' }];

  it('emite el encabezado y una fila por ticket, con estado/prioridad/técnico resueltos, y pide el listado ACOTADO al tope (pagina 1, sin más de TOPE_FILAS_EXPORT)', async () => {
    const asignado = crearTicket({
      id: 't1',
      numero: 'SOP-2026-00001',
      titulo: 'Con técnico',
      asignadoId: 'usuario-1',
    });
    const sinAsignar = crearTicket({
      id: 't2',
      numero: 'SOP-2026-00002',
      titulo: 'Sin técnico',
      asignadoId: null,
    });
    const listarTickets = crearListarTicketsFake([asignado, sinAsignar]);
    const nombres = new Map([['usuario-1', { nombre: 'Ana', apellido: 'Pérez' }]]);

    const useCase = new ExportarTicketsUseCase(
      listarTickets,
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(nombres),
    );

    const result = await useCase.execute({ actorId: 'actor-1', tienePermisoVerTodos: true });

    expect(result.isFail()).toBe(false);
    const filas = lineas(result.getValue().contenido);
    expect(filas).toHaveLength(3); // encabezado + 2 tickets
    expect(filas[0]).toBe(
      'Número;Título;Estado;Prioridad;Técnico asignado;Fecha de creación;Fecha de cierre',
    );
    expect(filas[1]).toContain('Nuevo');
    expect(filas[1]).toContain('Alta');
    expect(filas[1]).toContain('Ana Pérez');
    expect(filas[2]).toContain('Sin técnico');
    // "Sin técnico" no debe tener nombre — la celda de técnico queda vacía (`;;` entre Prioridad y Fecha).
    expect(filas[2].endsWith(';;')).toBe(false); // hay fecha de creación después, pero la celda técnico está vacía
    expect(filas[2].split(';')[4]).toBe('');

    // Fetch acotado (D3/D4): pide como mucho TOPE_FILAS_EXPORT filas, página 1 — nunca la paginación de pantalla.
    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        tienePermisoVerTodos: true,
        pagina: 1,
        porPagina: TOPE_FILAS_EXPORT,
      }),
    );
  });

  it('fecha de cierre (@db.Date) sin desplazar y fecha de creación (@db.Timestamptz) desplazada a Argentina, en la MISMA fila', async () => {
    // 2026-03-01T00:00:00Z es medianoche UTC del día calendario que Prisma
    // guarda para una columna @db.Date — desplazarla a Argentina la tiraría
    // al 28/02. 2026-03-01T01:30:00Z en Argentina (UTC-3) son las 22:30 del
    // 28/02 — el caso que prueba que SÍ se desplaza cuando corresponde.
    const ticket = crearTicket({
      id: 't1',
      fechaCierre: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T01:30:00.000Z'),
    });
    const useCase = new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket]),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({ actorId: 'actor-1', tienePermisoVerTodos: true });

    const [, fila] = lineas(result.getValue().contenido);
    const columnas = fila.split(';');
    // Fecha de creación (índice 5) y Fecha de cierre (índice 6) según el encabezado fijo.
    expect(columnas[5]).toBe('28/02/2026 22:30');
    expect(columnas[6]).toBe('01/03/2026');
  });

  it('ticket abierto (sin fechaCierre): la columna queda VACÍA, nunca una fecha default', async () => {
    const ticket = crearTicket({ id: 't1', fechaCierre: null });
    const useCase = new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket]),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({ actorId: 'actor-1', tienePermisoVerTodos: true });

    const [, fila] = lineas(result.getValue().contenido);
    expect(fila.split(';')[6]).toBe('');
  });

  it('scope por fila: SIN TICKETS:VER_TODOS, el export contiene ÚNICAMENTE los tickets del actor (composición real de ListarTicketsUseCase)', async () => {
    const propio1 = crearTicket({ id: 't1', numero: 'SOP-2026-00001', solicitanteId: 'actor-1' });
    const propio2 = crearTicket({ id: 't2', numero: 'SOP-2026-00002', solicitanteId: 'actor-1' });
    const ajeno = crearTicket({
      id: 't3',
      numero: 'SOP-2026-00003',
      solicitanteId: 'otro-usuario',
    });
    const todos = [propio1, propio2, ajeno];

    const ticketRepo = {
      findAll: vi.fn(async (filtros?: TicketFiltros) =>
        todos.filter(
          (t) => !filtros?.soloSolicitante || t.solicitanteId === filtros.soloSolicitante,
        ),
      ),
      count: vi.fn(
        async (filtros?: TicketFiltros) =>
          todos.filter(
            (t) => !filtros?.soloSolicitante || t.solicitanteId === filtros.soloSolicitante,
          ).length,
      ),
      findById: vi.fn(),
      findByIds: vi.fn(),
      findByNumero: vi.fn(),
      findLastSecuencia: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    const cicloClienteRepo = {
      findActive: vi.fn().mockResolvedValue(
        CicloClienteEntity.reconstitute(
          {
            cicloVigenteId: 'ciclo-vigente-1',
            nombre: 'Ciclo 2026',
            fechaInicio: new Date('2026-01-01'),
            fechaFin: new Date('2026-12-31'),
            activo: true,
          },
          'ciclo-1',
          new Date(),
          new Date(),
          null,
        ),
      ),
      findById: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
    };
    const tipoTicketRepo = { findIdsByModulos: vi.fn() };

    const listarTicketsUseCaseReal = new ListarTicketsUseCase(
      ticketRepo as never,
      cicloClienteRepo as never,
      tipoTicketRepo as never,
    );

    const useCase = new ExportarTicketsUseCase(
      listarTicketsUseCaseReal,
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({ actorId: 'actor-1', tienePermisoVerTodos: false });

    const filas = lineas(result.getValue().contenido);
    expect(filas).toHaveLength(3); // encabezado + 2 tickets propios — NUNCA el ajeno
    expect(filas.some((f) => f.includes('SOP-2026-00003'))).toBe(false);
    expect(filas[1]).toContain('SOP-2026-00001');
    expect(filas[2]).toContain('SOP-2026-00002');
  });

  it('tope de filas: total === TOPE arma el archivo; total === TOPE + 1 falla y NO arma contenido', async () => {
    const ticket = crearTicket({ id: 't1' });

    const okResult = await new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket], TOPE_FILAS_EXPORT),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    ).execute({ actorId: 'actor-1', tienePermisoVerTodos: true });
    expect(okResult.isFail()).toBe(false);

    const failResult = await new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket], TOPE_FILAS_EXPORT + 1),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    ).execute({ actorId: 'actor-1', tienePermisoVerTodos: true });
    expect(failResult.isFail()).toBe(true);
    expect(failResult.getError()).toBeInstanceOf(ExportacionDemasiadoGrandeError);
    expect(failResult.getError().message).toContain('filtros activos');
  });

  it('neutraliza inyección de fórmula CSV en el título (celda de texto libre)', async () => {
    const ticket = crearTicket({ id: 't1', titulo: '=HYPERLINK("http://evil","clic")' });
    const useCase = new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket]),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({ actorId: 'actor-1', tienePermisoVerTodos: true });

    const [, fila] = lineas(result.getValue().contenido);
    expect(fila).toContain("'=HYPERLINK");
  });

  it('nombra el archivo con la fecha de exportación', async () => {
    const useCase = new ExportarTicketsUseCase(
      crearListarTicketsFake([]),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const { nombreArchivo } = (
      await useCase.execute({ actorId: 'actor-1', tienePermisoVerTodos: true })
    ).getValue();

    expect(nombreArchivo).toMatch(/^tickets-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
