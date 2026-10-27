/**
 * [UNIT] RED→GREEN: `ExportarComprasUseCase` — exportación del listado de
 * compras a CSV (docs/roadmap-comercial.md punto 1).
 *
 * Puertos mockeados, sin DB. Lo que se fija acá:
 * - Exporta el UNIVERSO filtrado completo, no la página visible: el caso de
 *   uso no acepta `pagina`/`porPagina` y le pasa al repo el tope de
 *   exportación como `limit`.
 * - Los filtros de negocio viajan sin tocarse: el CSV tiene que contener
 *   exactamente lo que el usuario está viendo en pantalla.
 * - Una columna de total POR MONEDA, derivada de las compras exportadas —
 *   sin eso el importe no se puede sumar en la planilla, que es la razón de
 *   ser del archivo.
 * - El tope de filas corta con un error de dominio, no con un archivo
 *   truncado en silencio.
 * - odd/compras-por-tipo (S5): el archivo trae solo las compras que el actor
 *   ve (mismo alcance que el listado) y una columna "Tipo", vacía en una
 *   compra sin tipo.
 */
import { leerXlsx } from '../../../testing/leer-xlsx';
import { ExportarComprasUseCase, TOPE_FILAS_EXPORT } from './exportar-compras.use-case';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/compras.errors';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import { CompraListFiltros, ICompraRepository } from '../../domain/ports/i-compra.repository';
import { armarExportCsv } from '../../../shared/application/armar-export-csv';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';
import { ResolverTiposDeCompra } from '../services/tipos-de-compra';

/** ADMINISTRADOR: sin restricción por tipo. Los tests anteriores al tipo corren con este alcance. */
const SIN_RESTRICCION: AlcanceActorTicket = { actorId: 'admin-1', permisosPorTipo: null };

/** Catálogo de tipos de los tests: solo "Soporte". */
function crearTipos(): Pick<ResolverTiposDeCompra, 'resolver'> {
  return {
    resolver: vi
      .fn<ResolverTiposDeCompra['resolver']>()
      .mockResolvedValue(new Map([['tipo-soporte', { id: 'tipo-soporte', nombre: 'Soporte' }]])),
  };
}

const BOM = '﻿';

function crearItem(
  compraId: string,
  overrides: Partial<ItemCompraCreateProps> = {},
): ItemCompraEntity {
  return ItemCompraEntity.create({
    compraId,
    descripcion: 'Notebook',
    cantidad: 2,
    proveedor: 'Proveedor SA',
    monto: 1000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15T00:00:00.000Z'),
    observaciones: null,
    ...overrides,
  });
}

function crearCompra(
  id: string,
  items: ItemCompraEntity[] = [],
  overrides: Partial<CompraProps> = {},
): CompraEntity {
  const props: CompraProps = {
    numero: 'COM-2026-00001',
    fechaSolicitud: new Date('2026-08-19T00:00:00.000Z'),
    motivo: 'Reposición de stock',
    descripcion: null,
    solicitanteId: 'solicitante-1',
    cicloId: 'ciclo-1',
    sectorId: null,
    canceladaEn: null,
    canceladoPorId: null,
    motivoCancelacion: null,
    tipoTicketId: null,
    ...overrides,
  };
  return CompraEntity.reconstitute(
    props,
    items,
    id,
    new Date('2026-08-19T10:00:00.000Z'),
    new Date('2026-08-19T10:00:00.000Z'),
    null,
  );
}

function crearRepo(compras: CompraEntity[], total = compras.length) {
  const findPaginaConItems = vi
    .fn<ICompraRepository['findPaginaConItems']>()
    .mockResolvedValue({ compras, total });
  return { repo: { findPaginaConItems }, findPaginaConItems };
}

/** Devuelve las líneas del CSV, sin BOM. */
function lineas(contenido: string): string[] {
  return contenido.slice(BOM.length).split('\r\n');
}

describe('ExportarComprasUseCase', () => {
  it('emite el encabezado y una línea por compra', async () => {
    const { repo } = crearRepo([crearCompra('c1'), crearCompra('c2')]);

    const result = await new ExportarComprasUseCase(repo, crearTipos()).execute({
      alcance: SIN_RESTRICCION,
    });

    expect(lineas(result.getValue().contenido)).toHaveLength(3);
  });

  it('exporta el universo filtrado completo, no una página', async () => {
    // El repo tiene que recibir el tope como límite y NINGÚN offset: el
    // archivo no puede quedarse con las 20 filas que se ven en pantalla.
    const { repo, findPaginaConItems } = crearRepo([crearCompra('c1')]);

    await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION });

    const filtros = findPaginaConItems.mock.calls[0][0] as CompraListFiltros;
    expect(filtros.limit).toBe(TOPE_FILAS_EXPORT);
    expect(filtros.offset).toBeUndefined();
  });

  it('propaga los filtros de negocio sin alterarlos', async () => {
    const { repo, findPaginaConItems } = crearRepo([]);
    const fechaDesde = new Date('2026-01-01T00:00:00.000Z');

    await new ExportarComprasUseCase(repo, crearTipos()).execute({
      alcance: SIN_RESTRICCION,
      estado: 'COMPLETADAS',
      sectorId: 'sector-1',
      cicloId: 'ciclo-9',
      fechaDesde,
    });

    const filtros = findPaginaConItems.mock.calls[0][0] as CompraListFiltros;
    expect(filtros).toMatchObject({
      grupoEstado: 'COMPLETADAS',
      sectorId: 'sector-1',
      cicloId: 'ciclo-9',
      fechaDesde,
    });
  });

  it('aplica el mismo default de estado que el listado (ACTIVAS)', async () => {
    // Si el default divergiera, el CSV traería compras que la pantalla no
    // muestra — el usuario no tendría forma de saber por qué no coinciden.
    const { repo, findPaginaConItems } = crearRepo([]);

    await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION });

    expect((findPaginaConItems.mock.calls[0][0] as CompraListFiltros).grupoEstado).toBe('ACTIVAS');
  });

  it('escribe el estado y las banderas en texto legible, no en código interno', async () => {
    const { repo } = crearRepo([crearCompra('c1')]);

    const fila = lineas(
      (
        await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION })
      ).getValue().contenido,
    )[1];

    expect(fila).toContain('Pendiente');
    expect(fila).not.toContain('PENDIENTE');
    expect(fila).toContain('No');
  });

  it('formatea la fecha de solicitud sin correrle el día', async () => {
    // `fechaSolicitud` es @db.Date: medianoche UTC del 19/08. Desplazarla a
    // UTC-3 mostraría el 18/08.
    const { repo } = crearRepo([crearCompra('c1')]);

    const fila = lineas(
      (
        await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION })
      ).getValue().contenido,
    )[1];

    expect(fila).toContain('19/08/2026');
  });

  it('abre una columna de total por cada moneda presente, en orden estable', async () => {
    const enArs = crearCompra('c1', [crearItem('c1', { moneda: 'ARS', monto: 100, cantidad: 1 })]);
    const enUsd = crearCompra('c2', [crearItem('c2', { moneda: 'USD', monto: 50, cantidad: 1 })]);
    const { repo } = crearRepo([enUsd, enArs]);

    const [encabezado, primera] = lineas(
      (
        await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION })
      ).getValue().contenido,
    );

    expect(encabezado).toContain('Total ARS');
    expect(encabezado).toContain('Total USD');
    expect(encabezado.indexOf('Total ARS')).toBeLessThan(encabezado.indexOf('Total USD'));
    // La compra en USD deja vacía la celda de ARS: vacío significa "esta
    // compra no tiene importe en esa moneda", 0,00 significaría que tiene
    // uno y vale cero.
    expect(primera.endsWith(';;50,00')).toBe(true);
  });

  it('no abre columnas de moneda cuando no hay ningún importe', async () => {
    const { repo } = crearRepo([crearCompra('c1')]);

    const [encabezado] = lineas(
      (
        await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION })
      ).getValue().contenido,
    );

    expect(encabezado).not.toContain('Total');
  });

  it('falla con error de dominio cuando el resultado supera el tope', async () => {
    // Truncar en silencio sería peor que fallar: el usuario se llevaría un
    // archivo incompleto creyendo que está completo.
    const { repo } = crearRepo([crearCompra('c1')], TOPE_FILAS_EXPORT + 1);

    const result = await new ExportarComprasUseCase(repo, crearTipos()).execute({
      alcance: SIN_RESTRICCION,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ExportacionDemasiadoGrandeError);
  });

  it('sin compras entrega el archivo con solo el encabezado', async () => {
    const { repo } = crearRepo([]);

    const result = await new ExportarComprasUseCase(repo, crearTipos()).execute({
      alcance: SIN_RESTRICCION,
    });

    expect(result.isFail()).toBe(false);
    expect(lineas(result.getValue().contenido)).toHaveLength(1);
  });

  it('nombra el archivo con la fecha de exportación', async () => {
    const { repo } = crearRepo([]);

    const { nombreArchivo } = (
      await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION })
    ).getValue();

    expect(nombreArchivo).toMatch(/^compras-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  describe('regresión: paridad del sufijo de fecha con armarExportCsv (shared/application)', () => {
    // El use case histórico deriva el sufijo de `hoyArgentina()`
    // (compras/domain/services/fecha-argentina.ts); el helper compartido lo
    // deriva de `desplazarAArgentina()` (shared/domain). Son dos caminos de
    // código a la misma respuesta — si alguna vez divergen, el nombre de
    // archivo exportado corre un día en silencio y ningún test existente lo
    // nota. Esta prueba fija que, HOY, ambos caminos concuerdan.
    afterEach(() => {
      vi.useRealTimers();
    });

    it('en el borde del día de Argentina, el nombreArchivo del use case coincide con el que produce armarExportCsv', async () => {
      // 2026-03-02T01:30 UTC son las 22:30 del 2026-03-01 en Argentina
      // (UTC-3): un instante de "mismo día" en ambos husos pasaría con
      // cualquier implementación (correcta o con el bug de usar UTC crudo)
      // y no probaría nada — mismo criterio que
      // `armar-export-csv.spec.ts`.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-02T01:30:00.000Z'));

      const { repo } = crearRepo([]);
      const { nombreArchivo } = (
        await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION })
      ).getValue();

      const nombreEsperadoPorHelper = armarExportCsv({
        filas: [],
        total: 0,
        tope: TOPE_FILAS_EXPORT,
        columnas: [],
        prefijo: 'compras',
        alExceder: (total, tope) => new ExportacionDemasiadoGrandeError(total, tope),
      }).getValue().nombreArchivo;

      expect(nombreArchivo).toBe(nombreEsperadoPorHelper);
      // Ancla también el valor concreto: si algún día las dos
      // implementaciones derivaran MAL el mismo día de la misma forma, la
      // comparación anterior seguiría en verde sin detectarlo.
      expect(nombreArchivo).toBe('compras-2026-03-01.csv');
    });
  });

  it('con formato xlsx entrega un libro con las mismas columnas y la fecha de solicitud como fecha real', async () => {
    const { repo } = crearRepo([crearCompra('c1')]);

    const result = await new ExportarComprasUseCase(repo, crearTipos()).execute(
      { alcance: SIN_RESTRICCION },
      'xlsx',
    );

    const { contenido, nombreArchivo } = result.getValue();
    expect(nombreArchivo).toMatch(/\.xlsx$/);
    const hoja = (await leerXlsx(contenido)).worksheets[0];
    const csv = await new ExportarComprasUseCase(repo, crearTipos()).execute({
      alcance: SIN_RESTRICCION,
    });
    const encabezadosCsv = lineas(csv.getValue().contenido)[0].split(';');
    expect((hoja.getRow(1).values as unknown[]).slice(1)).toEqual(encabezadosCsv);
    expect(hoja.getRow(2).getCell(2).value).toBeInstanceOf(Date);
  });

  it('con formato xlsx aplica el mismo tope de filas', async () => {
    const { repo } = crearRepo([crearCompra('c1')], TOPE_FILAS_EXPORT + 1);

    const result = await new ExportarComprasUseCase(repo, crearTipos()).execute(
      { alcance: SIN_RESTRICCION },
      'xlsx',
    );

    expect(result.isFail()).toBe(true);
  });

  describe('odd/compras-por-tipo — alcance y columna Tipo (S4, S5)', () => {
    it('actor restringido: el alcance viaja como tiposVisibles (solo tipos con LECTURA), junto con el filtro de tipo', async () => {
      const { repo, findPaginaConItems } = crearRepo([]);

      await new ExportarComprasUseCase(repo, crearTipos()).execute({
        tipoTicketId: 'tipo-edilicia',
        alcance: {
          actorId: 'usuario-1',
          permisosPorTipo: new Map([
            ['tipo-soporte', new Set<AccionTipoTicket>(['LECTURA'])],
            ['tipo-edilicia', new Set<AccionTipoTicket>(['COMENTAR'])],
          ]),
        },
      });

      const filtros = findPaginaConItems.mock.calls[0][0] as CompraListFiltros;
      expect(filtros.tiposVisibles).toEqual(['tipo-soporte']);
      expect(filtros.tipoTicketId).toBe('tipo-edilicia');
    });

    it('ADMINISTRADOR (sin restricción): el filtro de alcance no viaja', async () => {
      const { repo, findPaginaConItems } = crearRepo([]);

      await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION });

      expect(findPaginaConItems.mock.calls[0][0]).not.toHaveProperty('tiposVisibles');
    });

    it('la columna Tipo trae el nombre del tipo, y queda vacía en una compra sin tipo', async () => {
      const { repo } = crearRepo([
        crearCompra('c1', [], { numero: 'COM-2026-00001', tipoTicketId: 'tipo-soporte' }),
        crearCompra('c2', [], { numero: 'COM-2026-00002', tipoTicketId: null }),
      ]);

      const [encabezado, conTipo, sinTipo] = lineas(
        (
          await new ExportarComprasUseCase(repo, crearTipos()).execute({ alcance: SIN_RESTRICCION })
        ).getValue().contenido,
      );

      const columnas = encabezado.split(';');
      const posicionTipo = columnas.indexOf('Tipo');
      expect(columnas.slice(0, 5)).toEqual([
        'Número',
        'Fecha de solicitud',
        'Motivo',
        'Tipo',
        'Estado',
      ]);
      expect(conTipo.split(';')[posicionTipo]).toBe('Soporte');
      expect(sinTipo.split(';')[posicionTipo]).toBe('');
    });
  });
});
