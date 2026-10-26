/**
 * [UNIT] RED→GREEN: `ExportarReparacionesUseCase` — exportación del listado
 * de reparaciones edilicias a CSV (sdd/exportar-listados-csv, capability
 * exportacion-reparaciones).
 *
 * Lo que se fija acá:
 * - `ExportarReparacionesUseCase` COMPONE `ListarReparacionesUseCase` (no
 *   sus repositorios propios) — design D4: con un solo argumento en el
 *   constructor no hay NADA que consultar por fila, el tipo lo impide.
 * - **Constancia de consultas (task 5.1, la prueba más importante de este
 *   archivo)**: se compone la implementación REAL de
 *   `ListarReparacionesUseCase` (no un fake de ella) contra puertos fake
 *   que CUENTAN sus propias llamadas, y se corre el export con 1 fila y con
 *   50 filas. El conteo de consultas tiene que ser IDÉNTICO entre ambas
 *   corridas — afirmar sólo `=== 4` no alcanza: pasaría igual si alguien
 *   reintrodujera una consulta por fila que diera, por casualidad, 4 con un
 *   input y otro número con otro. La igualdad ENTRE dos volúmenes distintos
 *   es lo único que prueba "constante", y sobrevive a un refactor legítimo
 *   del número base de consultas.
 * - Sin filtros: `execute()` recibe el alcance del actor y el tipo de la
 *   grilla (odd/ticket-unificado, S2) y los pasa tal cual a
 *   `ListarReparacionesUseCase` (spec, capability exportacion-reparaciones:
 *   "No filter parameters are accepted"; odd/permisos-por-tipo-ticket D5 e: el
 *   alcance no es un filtro, es scope).
 * - La ubicación es la del ticket (odd/ticket-unificado, S1).
 * - Columnas fijas y en orden: Número, Título, Ubicación, Avance %.
 * - El tope de filas corta con un error de dominio, sin truncar en silencio.
 *   `total` es `items.length` (D4: mismo residual aceptado que equipos — no
 *   hay `count()` en el puerto, cap post-fetch, documentado en el use case).
 * - Inyección de fórmula CSV en una celda de texto libre (`titulo`).
 */
import { leerXlsx } from '../../../testing/leer-xlsx';
import { ExportarReparacionesUseCase } from './exportar-reparaciones.use-case';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

/** ROOT y ADMINISTRADOR: los tests que no versan sobre el alcance. */
const SIN_RESTRICCION = alcanceSinRestriccion('actor-uuid');
import { ListarReparacionesUseCase, ReparacionConTicket } from './listar-reparaciones.use-case';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import { IConteoComentariosTicketRepository } from '../../domain/ports/i-conteo-comentarios-ticket.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/reparaciones.errors';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { Result } from '../../../shared/domain/result';

const BOM = '﻿';

/** Devuelve las líneas del CSV, sin BOM. */
function lineas(contenido: string): string[] {
  return contenido.slice(BOM.length).split('\r\n');
}

function crearTicket(
  overrides: Partial<{ numero: string; titulo: string; ubicacion: string | null }> = {},
  id = 'ticket-1',
): TicketEntity {
  return TicketEntity.create(
    {
      numero: overrides.numero ?? 'EDI-2026-00001',
      titulo: overrides.titulo ?? 'Reparar cañería',
      descripcion: null,
      tipoId: 'tipo-edilicia-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'usuario-uuid',
      ubicacion: overrides.ubicacion ?? null,
    },
    id,
  );
}

function crearReparacion(
  overrides: Partial<{
    numero: string;
    titulo: string;
    ubicacion: string | null;
    porcentajeAvance: number;
  }> = {},
  id = 'edilicia-1',
): ReparacionConTicket {
  const ticket = crearTicket(
    {
      numero: overrides.numero,
      titulo: overrides.titulo,
      // `!== undefined`, no `??`: un `null` explícito (ticket sin ubicación) es un caso de prueba
      // distinto de "no lo especifiqué", y `??` los confundiría al tratar `null` como ausente.
      ubicacion: overrides.ubicacion !== undefined ? overrides.ubicacion : 'Edificio Central',
    },
    `ticket-${id}`,
  );
  return {
    ticket,
    subtareas: [],
    // Desde odd/tareas-con-tecnico (T3) el avance se calcula al leer y viaja en el ítem, no en
    // la columna del satélite.
    porcentajeAvance: overrides.porcentajeAvance ?? 0,
    cantidadComentarios: 0,
    bloqueada: false,
    comprasQueBloquean: [],
    sectorNombre: null,
  };
}

/** `ListarReparacionesUseCase` FAKE — controla la lista sin pasar por el repositorio real. */
function crearListarReparacionesFake(
  reparaciones: ReparacionConTicket[],
): Pick<ListarReparacionesUseCase, 'execute'> {
  return {
    execute: vi
      .fn<ListarReparacionesUseCase['execute']>()
      .mockResolvedValue(Result.ok(reparaciones)),
  };
}

describe('ExportarReparacionesUseCase', () => {
  it('emite el encabezado y una fila por reparación, con las 4 columnas fijas en orden', async () => {
    const r1 = crearReparacion(
      {
        numero: 'EDI-2026-00001',
        titulo: 'Reparar cañería',
        ubicacion: 'Edificio Central',
        porcentajeAvance: 50,
      },
      'e1',
    );
    const r2 = crearReparacion(
      {
        numero: 'EDI-2026-00002',
        titulo: 'Pintar fachada',
        ubicacion: null,
        porcentajeAvance: 100,
      },
      'e2',
    );
    const useCase = new ExportarReparacionesUseCase(crearListarReparacionesFake([r1, r2]));

    const result = await useCase.execute(SIN_RESTRICCION);

    expect(result.isFail()).toBe(false);
    const filas = lineas(result.getValue().contenido);
    expect(filas).toHaveLength(3); // encabezado + 2 reparaciones
    expect(filas[0]).toBe('Número;Título;Ubicación;Avance %');
    expect(filas[1]).toBe('EDI-2026-00001;Reparar cañería;Edificio Central;50,00');
    expect(filas[2]).toBe('EDI-2026-00002;Pintar fachada;;100,00');
  });

  it('sin filtros: pasa a ListarReparacionesUseCase el alcance del actor y, sin tipo, null', async () => {
    const listarReparaciones = crearListarReparacionesFake([]);
    const useCase = new ExportarReparacionesUseCase(listarReparaciones);
    const alcance = alcancePorTipo('actor-uuid', { 'tipo-edilicia': ['LECTURA'] });

    await useCase.execute(alcance);

    expect(listarReparaciones.execute).toHaveBeenCalledWith(alcance, null);
  });

  it('el tipo de la grilla (odd/ticket-unificado, S2) llega tal cual al listado', async () => {
    const listarReparaciones = crearListarReparacionesFake([]);
    const useCase = new ExportarReparacionesUseCase(listarReparaciones);

    await useCase.execute(SIN_RESTRICCION, 'csv', 'tipo-soporte');

    expect(listarReparaciones.execute).toHaveBeenCalledWith(SIN_RESTRICCION, 'tipo-soporte');
  });

  it('tope de filas: total === TOPE arma el archivo; total === TOPE + 1 falla y NO arma contenido', async () => {
    const base = crearReparacion();
    const listaEnElTope = Array.from({ length: TOPE_FILAS_EXPORT }, () => base);
    const listaSobreElTope = Array.from({ length: TOPE_FILAS_EXPORT + 1 }, () => base);

    const okResult = await new ExportarReparacionesUseCase(
      crearListarReparacionesFake(listaEnElTope),
    ).execute(SIN_RESTRICCION);
    expect(okResult.isFail()).toBe(false);

    const failResult = await new ExportarReparacionesUseCase(
      crearListarReparacionesFake(listaSobreElTope),
    ).execute(SIN_RESTRICCION);
    expect(failResult.isFail()).toBe(true);
    expect(failResult.getError()).toBeInstanceOf(ExportacionDemasiadoGrandeError);
    expect(failResult.getError().message).not.toContain('filtros');
    expect(failResult.getError().message).toContain('partes');
  });

  it('neutraliza inyección de fórmula CSV en el título (celda de texto libre)', async () => {
    const reparacion = crearReparacion({ titulo: '=HYPERLINK("http://evil","clic")' });
    const useCase = new ExportarReparacionesUseCase(crearListarReparacionesFake([reparacion]));

    const result = await useCase.execute(SIN_RESTRICCION);

    const [, fila] = lineas(result.getValue().contenido);
    expect(fila).toContain("'=HYPERLINK");
  });

  it('nombra el archivo con la fecha de exportación', async () => {
    const useCase = new ExportarReparacionesUseCase(crearListarReparacionesFake([]));

    const { nombreArchivo } = (await useCase.execute(SIN_RESTRICCION)).getValue();

    expect(nombreArchivo).toMatch(/^reparaciones-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('ExportarReparacionesUseCase — constancia de consultas (task 5.1, design D4)', () => {
  /**
   * Arma la implementación REAL de `ListarReparacionesUseCase` sobre puertos fake que cuentan sus
   * propias invocaciones en un contador COMPARTIDO. `cantidadReparaciones` controla el volumen de
   * tickets devueltos por `findAll` — el resto de los puertos (`findIdsByModulos`,
   * `listarPorTickets`, `contarPorTickets`, `findComprasVinculadasByTicketIds`) siempre se llaman
   * UNA vez cada uno, en lote, sin importar cuántos ids reciban.
   */
  function crearListarReparacionesRealConContador(cantidadReparaciones: number) {
    let llamadas = 0;

    const tickets = Array.from({ length: cantidadReparaciones }, (_, i) =>
      crearTicket({ numero: `EDI-${i}`, titulo: `Título ${i}`, ubicacion: 'Depósito' }, `t-${i}`),
    );

    const ticketRepo = {
      findAll: vi.fn<ITicketRepository['findAll']>(async () => {
        llamadas++;
        return tickets;
      }),
    };
    const tipoTicketRepo = {
      findIdsByModulos: vi.fn<ITipoTicketRepository['findIdsByModulos']>(async () => {
        llamadas++;
        return ['tipo-edilicia-uuid'];
      }),
    };
    const subtareaRepo = {
      listarPorTickets: vi.fn<ITareaTicketRepository['listarPorTickets']>(async () => {
        llamadas++;
        return new Map();
      }),
    };
    const comentarioRepo = {
      contarPorTickets: vi.fn<IConteoComentariosTicketRepository['contarPorTickets']>(async () => {
        llamadas++;
        return new Map();
      }),
    };
    const reparacionCompraRepo = {
      findComprasVinculadasByTicketIds: vi.fn<
        ITicketCompraRepository['findComprasVinculadasByTicketIds']
      >(async () => {
        llamadas++;
        return new Map();
      }),
    };

    const listarReparaciones = new ListarReparacionesUseCase(
      ticketRepo,
      tipoTicketRepo,
      subtareaRepo,
      comentarioRepo,
      reparacionCompraRepo,
      // Ningun ticket de este armado tiene sector: el listado no consulta nombres de sector.
      {
        findNombres: vi.fn<ISectorRepository['findNombres']>(async () => {
          llamadas++;
          return new Map<string, string>();
        }),
      },
    );

    return { listarReparaciones, contadorDeLlamadas: () => llamadas };
  }

  it('el conteo de consultas es IDÉNTICO con 1 fila y con 50 filas, y es 5 en ambos casos', async () => {
    const con1Fila = crearListarReparacionesRealConContador(1);
    const resultadoCon1Fila = await new ExportarReparacionesUseCase(
      con1Fila.listarReparaciones,
    ).execute(SIN_RESTRICCION);
    const consultasCon1Fila = con1Fila.contadorDeLlamadas();

    const con50Filas = crearListarReparacionesRealConContador(50);
    const resultadoCon50Filas = await new ExportarReparacionesUseCase(
      con50Filas.listarReparaciones,
    ).execute(SIN_RESTRICCION);
    const consultasCon50Filas = con50Filas.contadorDeLlamadas();

    expect(resultadoCon1Fila.isFail()).toBe(false);
    expect(resultadoCon50Filas.isFail()).toBe(false);
    // La comparación ENTRE dos volúmenes distintos es lo que prueba
    // "constante" — no sólo que cada uno dé un número fijo por separado.
    expect(consultasCon1Fila).toBe(consultasCon50Filas);
    expect(consultasCon1Fila).toBe(5);
    expect(consultasCon50Filas).toBe(5);
  });

  it('con formato xlsx el avance es numérico y el resto de las columnas se conserva', async () => {
    const r1 = crearReparacion(
      {
        numero: 'EDI-2026-00001',
        titulo: 'Reparar cañería',
        ubicacion: 'Central',
        porcentajeAvance: 50,
      },
      'e1',
    );
    const useCase = new ExportarReparacionesUseCase(crearListarReparacionesFake([r1]));

    const result = await useCase.execute(SIN_RESTRICCION, 'xlsx');

    const hoja = (await leerXlsx(result.getValue().contenido)).worksheets[0];
    expect(hoja.getRow(2).getCell(1).value).toBe('EDI-2026-00001');
    expect(hoja.getRow(2).getCell(4).value).toBe(50);
    expect(result.getValue().nombreArchivo).toMatch(/^reparaciones-.*\.xlsx$/);
  });
});
