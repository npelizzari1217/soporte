/**
 * [UNIT] RED→GREEN: `ExportarReparacionesUseCase` — exportación del listado
 * de reparaciones edilicias a CSV (sdd/exportar-listados-csv, capability
 * exportacion-reparaciones).
 *
 * Lo que se fija acá:
 * - `ExportarReparacionesUseCase` COMPONE `ListarReparacionesUseCase` (no
 *   sus 4 repositorios propios) — design D4: con un solo argumento en el
 *   constructor no hay NADA que consultar por fila, el tipo lo impide.
 * - **Constancia de consultas (task 5.1, la prueba más importante de este
 *   archivo)**: se compone la implementación REAL de
 *   `ListarReparacionesUseCase` (no un fake de ella) contra 4 puertos fake
 *   que CUENTAN sus propias llamadas, y se corre el export con 1 fila y con
 *   50 filas. El conteo de consultas tiene que ser IDÉNTICO entre ambas
 *   corridas — afirmar sólo `=== 4` no alcanza: pasaría igual si alguien
 *   reintrodujera una consulta por fila que diera, por casualidad, 4 con un
 *   input y otro número con otro. La igualdad ENTRE dos volúmenes distintos
 *   es lo único que prueba "constante", y sobrevive a un refactor legítimo
 *   del número base de consultas.
 * - Sin filtros: `execute()` no recibe parámetros — `ListarReparacionesUseCase`
 *   tampoco (spec, capability exportacion-reparaciones: "No filter
 *   parameters are accepted").
 * - Columnas fijas y en orden: Número, Título, Ubicación, Avance %.
 * - El tope de filas corta con un error de dominio, sin truncar en silencio.
 *   `total` es `items.length` (D4: mismo residual aceptado que equipos — no
 *   hay `count()` en el puerto, cap post-fetch, documentado en el use case).
 * - Inyección de fórmula CSV en una celda de texto libre (`titulo`).
 */
import { ExportarReparacionesUseCase } from './exportar-reparaciones.use-case';
import { ListarReparacionesUseCase, ReparacionConTicket } from './listar-reparaciones.use-case';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/reparaciones.errors';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';

const BOM = '﻿';

/** Devuelve las líneas del CSV, sin BOM. */
function lineas(contenido: string): string[] {
  return contenido.slice(BOM.length).split('\r\n');
}

function crearTicket(
  overrides: Partial<{ numero: string; titulo: string }> = {},
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
    { numero: overrides.numero, titulo: overrides.titulo },
    `ticket-${id}`,
  );
  const ticketEdilicia = TicketEdiliciaEntity.create(
    {
      ticketId: ticket.id,
      // `!== undefined`, no `??`: un `null` explícito (reparación sin
      // ubicación) es un caso de prueba distinto de "no lo especifiqué", y
      // `??` los confundiría al tratar `null` como ausente también.
      ubicacion: overrides.ubicacion !== undefined ? overrides.ubicacion : 'Edificio Central',
    },
    id,
  );
  if (overrides.porcentajeAvance !== undefined) {
    ticketEdilicia.actualizarAvance(overrides.porcentajeAvance);
  }
  return { ticket, ticketEdilicia, subtareas: [], cantidadComentarios: 0 };
}

/** `ListarReparacionesUseCase` FAKE — controla la lista sin pasar por el repositorio real. */
function crearListarReparacionesFake(reparaciones: ReparacionConTicket[]) {
  const execute = vi.fn().mockResolvedValue({
    isFail: () => false,
    getValue: () => reparaciones,
  });
  return { execute } as unknown as ListarReparacionesUseCase;
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

    const result = await useCase.execute();

    expect(result.isFail()).toBe(false);
    const filas = lineas(result.getValue().contenido);
    expect(filas).toHaveLength(3); // encabezado + 2 reparaciones
    expect(filas[0]).toBe('Número;Título;Ubicación;Avance %');
    expect(filas[1]).toBe('EDI-2026-00001;Reparar cañería;Edificio Central;50,00');
    expect(filas[2]).toBe('EDI-2026-00002;Pintar fachada;;100,00');
  });

  it('sin filtros: execute() no recibe parámetros ni se los pasa a ListarReparacionesUseCase', async () => {
    const listarReparaciones = crearListarReparacionesFake([]);
    const useCase = new ExportarReparacionesUseCase(listarReparaciones);

    await useCase.execute();

    expect(listarReparaciones.execute).toHaveBeenCalledWith();
  });

  it('tope de filas: total === TOPE arma el archivo; total === TOPE + 1 falla y NO arma contenido', async () => {
    const base = crearReparacion();
    const listaEnElTope = Array.from({ length: TOPE_FILAS_EXPORT }, () => base);
    const listaSobreElTope = Array.from({ length: TOPE_FILAS_EXPORT + 1 }, () => base);

    const okResult = await new ExportarReparacionesUseCase(
      crearListarReparacionesFake(listaEnElTope),
    ).execute();
    expect(okResult.isFail()).toBe(false);

    const failResult = await new ExportarReparacionesUseCase(
      crearListarReparacionesFake(listaSobreElTope),
    ).execute();
    expect(failResult.isFail()).toBe(true);
    expect(failResult.getError()).toBeInstanceOf(ExportacionDemasiadoGrandeError);
    expect(failResult.getError().message).not.toContain('filtros');
    expect(failResult.getError().message).toContain('partes');
  });

  it('neutraliza inyección de fórmula CSV en el título (celda de texto libre)', async () => {
    const reparacion = crearReparacion({ titulo: '=HYPERLINK("http://evil","clic")' });
    const useCase = new ExportarReparacionesUseCase(crearListarReparacionesFake([reparacion]));

    const result = await useCase.execute();

    const [, fila] = lineas(result.getValue().contenido);
    expect(fila).toContain("'=HYPERLINK");
  });

  it('nombra el archivo con la fecha de exportación', async () => {
    const useCase = new ExportarReparacionesUseCase(crearListarReparacionesFake([]));

    const { nombreArchivo } = (await useCase.execute()).getValue();

    expect(nombreArchivo).toMatch(/^reparaciones-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('ExportarReparacionesUseCase — constancia de consultas (task 5.1, design D4)', () => {
  /**
   * Arma la implementación REAL de `ListarReparacionesUseCase` sobre 4
   * puertos fake que cuentan sus propias invocaciones en un contador
   * COMPARTIDO. `cantidadReparaciones` controla el volumen de filas
   * devueltas por `findAll` — el resto de los puertos (`findByIds`,
   * `findActiveByTicketEdiliciaIds`, `contarPorTicketEdilicia`) siempre se
   * llaman UNA vez cada uno, en lote, sin importar cuántos ids reciban.
   */
  function crearListarReparacionesRealConContador(cantidadReparaciones: number) {
    let llamadas = 0;

    const satelites = Array.from({ length: cantidadReparaciones }, (_, i) =>
      TicketEdiliciaEntity.create(
        { ticketId: `ticket-${i}`, ubicacion: 'Depósito' },
        `edilicia-${i}`,
      ),
    );

    const ediliciaRepo = {
      findAll: vi.fn(async () => {
        llamadas++;
        return satelites;
      }),
    };
    const ticketRepo = {
      findByIds: vi.fn(async (ids: string[]) => {
        llamadas++;
        const mapa = new Map<string, TicketEntity>();
        for (const id of ids) {
          mapa.set(id, crearTicket({ numero: `EDI-${id}`, titulo: `Título ${id}` }, id));
        }
        return mapa;
      }),
    };
    const subtareaRepo = {
      findActiveByTicketEdiliciaIds: vi.fn(async () => {
        llamadas++;
        return new Map();
      }),
    };
    const comentarioRepo = {
      contarPorTicketEdilicia: vi.fn(async () => {
        llamadas++;
        return new Map();
      }),
    };

    const listarReparaciones = new ListarReparacionesUseCase(
      ediliciaRepo as any,
      ticketRepo as any,
      subtareaRepo as any,
      comentarioRepo as any,
    );

    return { listarReparaciones, contadorDeLlamadas: () => llamadas };
  }

  it('el conteo de consultas es IDÉNTICO con 1 fila y con 50 filas, y es 4 en ambos casos', async () => {
    const con1Fila = crearListarReparacionesRealConContador(1);
    const resultadoCon1Fila = await new ExportarReparacionesUseCase(
      con1Fila.listarReparaciones,
    ).execute();
    const consultasCon1Fila = con1Fila.contadorDeLlamadas();

    const con50Filas = crearListarReparacionesRealConContador(50);
    const resultadoCon50Filas = await new ExportarReparacionesUseCase(
      con50Filas.listarReparaciones,
    ).execute();
    const consultasCon50Filas = con50Filas.contadorDeLlamadas();

    expect(resultadoCon1Fila.isFail()).toBe(false);
    expect(resultadoCon50Filas.isFail()).toBe(false);
    // La comparación ENTRE dos volúmenes distintos es lo que prueba
    // "constante" — no sólo que cada uno dé 4 por separado.
    expect(consultasCon1Fila).toBe(consultasCon50Filas);
    expect(consultasCon1Fila).toBe(4);
    expect(consultasCon50Filas).toBe(4);
  });
});
