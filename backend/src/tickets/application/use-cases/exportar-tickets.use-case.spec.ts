/**
 * [UNIT] RED→GREEN: `ExportarTicketsUseCase` — exportación del listado de
 * tickets a CSV (sdd/exportar-listados-csv, capability exportacion-tickets).
 *
 * Lo que se fija acá:
 * - `ExportarTicketsUseCase` COMPONE `ListarTicketsUseCase` (no un
 *   `ITicketRepository` propio): el test de scope por fila usa la instancia
 *   REAL de `ListarTicketsUseCase` para probar que el alcance por tipo del
 *   actor (odd/permisos-por-tipo-ticket, D5 e) se hereda estructuralmente, no
 *   por convención.
 * - `fechaCierre` y `createdAt` son ambas `@db.Timestamptz` (instantes
 *   reales, sdd/corregir-fecha-cierre-tickets) — `diaArgentinoCsv` desplaza
 *   a hora de Argentina y trunca al día, `fechaHoraCsv` desplaza y muestra
 *   además la hora — verificados en la MISMA fila.
 * - El tope de filas corta con un error de dominio, sin truncar en silencio.
 * - Inyección de fórmula CSV en una celda de texto libre (`titulo`).
 */
import { leerXlsx } from '../../../testing/leer-xlsx';
import { ExportarTicketsUseCase } from './exportar-tickets.use-case';
import { ListarTicketsUseCase } from './listar-tickets.use-case';
import { Result } from '../../../shared/domain/result';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/tickets.errors';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { unstubbed } from '../../../testing/mocks';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';

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
  const execute = vi
    .fn<ListarTicketsUseCase['execute']>()
    .mockResolvedValue(Result.ok({ items, total, pagina: 1, porPagina: TOPE_FILAS_EXPORT }));
  const caso: ListarTicketsUseCase = Object.create(ListarTicketsUseCase.prototype, {
    execute: { value: execute },
  });
  return caso;
}

/** Alcance de ROOT o ADMINISTRADOR: sin restricción por tipo. */
const SIN_RESTRICCION = alcanceSinRestriccion('actor-1');

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

    const result = await useCase.execute({ alcance: SIN_RESTRICCION });

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
        alcance: SIN_RESTRICCION,
        pagina: 1,
        porPagina: TOPE_FILAS_EXPORT,
      }),
    );
  });

  it('fecha de cierre cercana a medianoche argentina: se desplaza a hora de Argentina ANTES de truncar (regresión sdd/corregir-fecha-cierre-tickets)', async () => {
    // 2026-08-14T02:30:00Z son las 23:30 ART del 13/08 — leer los
    // componentes UTC crudos (el bug histórico) mostraría 14/08. La fecha
    // de creación se prueba en la MISMA fila para confirmar que el
    // desplazamiento de `fechaHoraCsv` sigue intacto.
    const ticket = crearTicket({
      id: 't1',
      fechaCierre: new Date('2026-08-14T02:30:00.000Z'),
      createdAt: new Date('2026-03-01T01:30:00.000Z'),
    });
    const useCase = new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket]),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({ alcance: SIN_RESTRICCION });

    const [, fila] = lineas(result.getValue().contenido);
    const columnas = fila.split(';');
    // Fecha de creación (índice 5) y Fecha de cierre (índice 6) según el encabezado fijo.
    expect(columnas[5]).toBe('28/02/2026 22:30');
    expect(columnas[6]).toBe('13/08/2026');
  });

  it('fecha de cierre al mediodía argentino: el desplazamiento no introduce una regresión inversa', async () => {
    // 14:00 ART del 13/08 no cruza medianoche en ninguna dirección — sirve
    // para probar que desplazar no corre el día donde antes no se corría.
    const ticket = crearTicket({
      id: 't1',
      fechaCierre: new Date('2026-08-13T17:00:00.000Z'), // 14:00 ART del 13/08
    });
    const useCase = new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket]),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({ alcance: SIN_RESTRICCION });

    const [, fila] = lineas(result.getValue().contenido);
    expect(fila.split(';')[6]).toBe('13/08/2026');
  });

  it('ticket abierto (sin fechaCierre): la columna queda VACÍA, nunca una fecha default', async () => {
    const ticket = crearTicket({ id: 't1', fechaCierre: null });
    const useCase = new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket]),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({ alcance: SIN_RESTRICCION });

    const [, fila] = lineas(result.getValue().contenido);
    expect(fila.split(';')[6]).toBe('');
  });

  it('alcance por tipo: solo tipos con LECTURA; VER_TODOS trae todo el tipo, sin él solo los propios (composición real de ListarTicketsUseCase)', async () => {
    const propio1 = crearTicket({
      id: 't1',
      numero: 'MAN-2026-00001',
      tipoId: 'tipo-fila',
      solicitanteId: 'actor-1',
    });
    const propio2 = crearTicket({
      id: 't2',
      numero: 'MAN-2026-00002',
      tipoId: 'tipo-fila',
      solicitanteId: 'actor-1',
    });
    const ajenoFila = crearTicket({
      id: 't3',
      numero: 'MAN-2026-00003',
      tipoId: 'tipo-fila',
      solicitanteId: 'otro-usuario',
    });
    const ajenoVerTodos = crearTicket({
      id: 't4',
      numero: 'SOP-2026-00004',
      tipoId: 'tipo-ver-todos',
      solicitanteId: 'otro-usuario',
    });
    const propioSinLectura = crearTicket({
      id: 't5',
      numero: 'ELE-2026-00005',
      tipoId: 'tipo-sin-lectura',
      solicitanteId: 'actor-1',
    });
    const todos = [propio1, propio2, ajenoFila, ajenoVerTodos, propioSinLectura];
    // Emula el alcance que aplica la base (`whereAlcanceListado`), sin repetir la del caso de uso.
    const entra = (t: TicketEntity, filtros?: TicketFiltros): boolean => {
      const alcance = filtros?.alcance;
      if (!alcance) return true;
      if (alcance.tiposVerTodos.includes(t.tipoId)) return true;
      return alcance.tiposPorFila.includes(t.tipoId) && t.solicitanteId === alcance.actorId;
    };

    const ticketRepo = {
      findAll: vi.fn(async (filtros?: TicketFiltros) => todos.filter((t) => entra(t, filtros))),
      count: vi.fn(
        async (filtros?: TicketFiltros) => todos.filter((t) => entra(t, filtros)).length,
      ),
      findById: vi.fn<ITicketRepository['findById']>(),
      findByIds: vi.fn<ITicketRepository['findByIds']>(),
      findByNumero: vi.fn<ITicketRepository['findByNumero']>(),
      findLastSecuencia: vi.fn<ITicketRepository['findLastSecuencia']>(),
      save: vi.fn<ITicketRepository['save']>(),
      delete: vi.fn<ITicketRepository['delete']>(),
      esVisiblePara: unstubbed('esVisiblePara'),
      bloquear: unstubbed('bloquear'),
    };
    const cicloClienteRepo = {
      findActive: vi.fn<ICicloClienteRepository['findActive']>().mockResolvedValue(
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
      findById: vi.fn<ICicloClienteRepository['findById']>(),
      findAll: vi.fn<ICicloClienteRepository['findAll']>(),
      save: vi.fn<ICicloClienteRepository['save']>(),
    };
    const listarTicketsUseCaseReal = new ListarTicketsUseCase(ticketRepo, cicloClienteRepo);

    const useCase = new ExportarTicketsUseCase(
      listarTicketsUseCaseReal,
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    );

    const result = await useCase.execute({
      alcance: alcancePorTipo('actor-1', {
        'tipo-fila': ['LECTURA'],
        'tipo-ver-todos': ['LECTURA', 'VER_TODOS'],
        'tipo-sin-lectura': ['VER_TODOS', 'MODIFICACION'],
      }),
    });

    const filas = lineas(result.getValue().contenido);
    // Encabezado + 2 propios del tipo por fila + el ajeno del tipo con VER_TODOS.
    expect(filas).toHaveLength(4);
    expect(filas.slice(1).map((f) => f.split(';')[0])).toEqual([
      'MAN-2026-00001',
      'MAN-2026-00002',
      'SOP-2026-00004',
    ]);
  });

  it('tope de filas: total === TOPE arma el archivo; total === TOPE + 1 falla y NO arma contenido', async () => {
    const ticket = crearTicket({ id: 't1' });

    const okResult = await new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket], TOPE_FILAS_EXPORT),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    ).execute({ alcance: SIN_RESTRICCION });
    expect(okResult.isFail()).toBe(false);

    const failResult = await new ExportarTicketsUseCase(
      crearListarTicketsFake([ticket], TOPE_FILAS_EXPORT + 1),
      crearEstadoRepo(ESTADOS),
      crearPrioridadRepo(PRIORIDADES),
      crearUsuarioMasterChecker(),
    ).execute({ alcance: SIN_RESTRICCION });
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

    const result = await useCase.execute({ alcance: SIN_RESTRICCION });

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

    const { nombreArchivo } = (await useCase.execute({ alcance: SIN_RESTRICCION })).getValue();

    expect(nombreArchivo).toMatch(/^tickets-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  describe('formato xlsx', () => {
    function armar(items: TicketEntity[], total = items.length) {
      return new ExportarTicketsUseCase(
        crearListarTicketsFake(items, total),
        crearEstadoRepo(ESTADOS),
        crearPrioridadRepo(PRIORIDADES),
        crearUsuarioMasterChecker(),
      );
    }

    it('entrega un .xlsx con las MISMAS columnas que el CSV, números y fechas tipados, y la hora argentina', async () => {
      // 01:30 UTC del 20/08 = 22:30 del 19/08 en Argentina.
      const ticket = crearTicket({
        id: 't1',
        titulo: '=SUM(A1)',
        createdAt: new Date('2026-08-20T01:30:00.000Z'),
        fechaCierre: new Date('2026-08-20T01:30:00.000Z'),
      });

      const result = await armar([ticket]).execute({ alcance: SIN_RESTRICCION }, 'xlsx');

      const { contenido, nombreArchivo } = result.getValue();
      expect(nombreArchivo).toMatch(/^tickets-\d{4}-\d{2}-\d{2}\.xlsx$/);
      const hoja = (await leerXlsx(contenido)).worksheets[0];
      const encabezados = (hoja.getRow(1).values as unknown[]).slice(1);
      expect(encabezados).toEqual([
        'Número',
        'Título',
        'Estado',
        'Prioridad',
        'Técnico asignado',
        'Fecha de creación',
        'Fecha de cierre',
      ]);
      const fila = hoja.getRow(2);
      expect(fila.getCell(2).value).toBe('=SUM(A1)');
      expect(fila.getCell(2).formula).toBeUndefined();
      expect((fila.getCell(6).value as Date).toISOString()).toBe('2026-08-19T22:30:00.000Z');
      expect((fila.getCell(7).value as Date).toISOString()).toBe('2026-08-19T00:00:00.000Z');
    });

    it('aplica el mismo tope: total === TOPE + 1 falla con el mismo error que el CSV', async () => {
      const ticket = crearTicket({ id: 't1' });

      const ok = await armar([ticket], TOPE_FILAS_EXPORT).execute(
        { alcance: SIN_RESTRICCION },
        'xlsx',
      );
      const excedido = await armar([ticket], TOPE_FILAS_EXPORT + 1).execute(
        { alcance: SIN_RESTRICCION },
        'xlsx',
      );

      expect(ok.isFail()).toBe(false);
      expect(excedido.getError()).toBeInstanceOf(ExportacionDemasiadoGrandeError);
    });
  });
});
