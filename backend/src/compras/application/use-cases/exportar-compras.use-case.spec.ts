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
 */
import { ExportarComprasUseCase, TOPE_FILAS_EXPORT } from './exportar-compras.use-case';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/compras.errors';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import { CompraListFiltros } from '../../domain/ports/i-compra.repository';

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
  const findPaginaConItems = vi.fn().mockResolvedValue({ compras, total });
  return { repo: { findPaginaConItems }, findPaginaConItems };
}

/** Devuelve las líneas del CSV, sin BOM. */
function lineas(contenido: string): string[] {
  return contenido.slice(BOM.length).split('\r\n');
}

describe('ExportarComprasUseCase', () => {
  it('emite el encabezado y una línea por compra', async () => {
    const { repo } = crearRepo([crearCompra('c1'), crearCompra('c2')]);

    const result = await new ExportarComprasUseCase(repo).execute({});

    expect(lineas(result.getValue().contenido)).toHaveLength(3);
  });

  it('exporta el universo filtrado completo, no una página', async () => {
    // El repo tiene que recibir el tope como límite y NINGÚN offset: el
    // archivo no puede quedarse con las 20 filas que se ven en pantalla.
    const { repo, findPaginaConItems } = crearRepo([crearCompra('c1')]);

    await new ExportarComprasUseCase(repo).execute({});

    const filtros = findPaginaConItems.mock.calls[0][0] as CompraListFiltros;
    expect(filtros.limit).toBe(TOPE_FILAS_EXPORT);
    expect(filtros.offset).toBeUndefined();
  });

  it('propaga los filtros de negocio sin alterarlos', async () => {
    const { repo, findPaginaConItems } = crearRepo([]);
    const fechaDesde = new Date('2026-01-01T00:00:00.000Z');

    await new ExportarComprasUseCase(repo).execute({
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

    await new ExportarComprasUseCase(repo).execute({});

    expect((findPaginaConItems.mock.calls[0][0] as CompraListFiltros).grupoEstado).toBe('ACTIVAS');
  });

  it('escribe el estado y las banderas en texto legible, no en código interno', async () => {
    const { repo } = crearRepo([crearCompra('c1')]);

    const fila = lineas(
      (await new ExportarComprasUseCase(repo).execute({})).getValue().contenido,
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
      (await new ExportarComprasUseCase(repo).execute({})).getValue().contenido,
    )[1];

    expect(fila).toContain('19/08/2026');
  });

  it('abre una columna de total por cada moneda presente, en orden estable', async () => {
    const enArs = crearCompra('c1', [crearItem('c1', { moneda: 'ARS', monto: 100, cantidad: 1 })]);
    const enUsd = crearCompra('c2', [crearItem('c2', { moneda: 'USD', monto: 50, cantidad: 1 })]);
    const { repo } = crearRepo([enUsd, enArs]);

    const [encabezado, primera] = lineas(
      (await new ExportarComprasUseCase(repo).execute({})).getValue().contenido,
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
      (await new ExportarComprasUseCase(repo).execute({})).getValue().contenido,
    );

    expect(encabezado).not.toContain('Total');
  });

  it('falla con error de dominio cuando el resultado supera el tope', async () => {
    // Truncar en silencio sería peor que fallar: el usuario se llevaría un
    // archivo incompleto creyendo que está completo.
    const { repo } = crearRepo([crearCompra('c1')], TOPE_FILAS_EXPORT + 1);

    const result = await new ExportarComprasUseCase(repo).execute({});

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ExportacionDemasiadoGrandeError);
  });

  it('sin compras entrega el archivo con solo el encabezado', async () => {
    const { repo } = crearRepo([]);

    const result = await new ExportarComprasUseCase(repo).execute({});

    expect(result.isFail()).toBe(false);
    expect(lineas(result.getValue().contenido)).toHaveLength(1);
  });

  it('nombra el archivo con la fecha de exportación', async () => {
    const { repo } = crearRepo([]);

    const { nombreArchivo } = (await new ExportarComprasUseCase(repo).execute({})).getValue();

    expect(nombreArchivo).toMatch(/^compras-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
