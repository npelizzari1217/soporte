/**
 * [UNIT] `ExportarCompraUseCase` — exportación de UNA compra: cabecera
 * arriba, fila vacía, ítems abajo (odd/tasks/compra-export-secciones-y-pdf.md,
 * S1-S3; ruta y nombre en odd/tasks/export-compra-individual.md, S4-S5).
 */
import { leerXlsx } from '../../../testing/leer-xlsx';
import { ExportarCompraUseCase } from './exportar-compra.use-case';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { ResolverTiposDeCompra } from '../services/tipos-de-compra';

const BOM = '\uFEFF';

const COLUMNAS_COMPRA = ['Número', 'Fecha de solicitud', 'Motivo', 'Descripción', 'Tipo', 'Estado'];

const COLUMNAS_ITEM = [
  'Descripción del ítem',
  'Cantidad',
  'Proveedor',
  'Moneda',
  'Monto',
  'Total',
  'Fecha de cotización',
  'Aprobación',
  'Fecha de orden',
  'Fecha de recepción',
  'Fecha de entrega',
  'Comprado',
  'Entregado',
  'Observaciones',
];

function crearTipos(): Pick<ResolverTiposDeCompra, 'resolver'> {
  return {
    resolver: vi
      .fn<ResolverTiposDeCompra['resolver']>()
      .mockResolvedValue(new Map([['tipo-soporte', { id: 'tipo-soporte', nombre: 'Soporte' }]])),
  };
}

function crearItem(overrides: Partial<ItemCompraCreateProps> = {}): ItemCompraEntity {
  return ItemCompraEntity.create({
    compraId: 'c1',
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
  items: ItemCompraEntity[],
  overrides: Partial<CompraProps> = {},
  deletedAt: Date | null = null,
): CompraEntity {
  const props: CompraProps = {
    numero: 'COM-2026-00007',
    fechaSolicitud: new Date('2026-08-19T00:00:00.000Z'),
    motivo: 'Reposición de equipos',
    descripcion: 'Renovación del laboratorio',
    solicitanteId: 'solicitante-1',
    cicloId: 'ciclo-1',
    sectorId: null,
    canceladaEn: null,
    canceladoPorId: null,
    motivoCancelacion: null,
    tipoTicketId: 'tipo-soporte',
    ...overrides,
  };
  const ahora = new Date('2026-08-19T10:00:00.000Z');
  return CompraEntity.reconstitute(props, items, 'c1', ahora, ahora, deletedAt);
}

function crearRepo(compra: CompraEntity | null) {
  const findByIdConItems = vi.fn<ICompraRepository['findByIdConItems']>().mockResolvedValue(compra);
  return { findByIdConItems };
}

function lineas(contenido: string): string[] {
  return contenido.slice(BOM.length).split('\r\n');
}

async function exportarCsv(compra: CompraEntity): Promise<string[]> {
  const result = await new ExportarCompraUseCase(crearRepo(compra), crearTipos()).execute({
    compraId: 'c1',
  });
  return lineas(result.getValue().contenido);
}

describe('ExportarCompraUseCase', () => {
  it('arriba la cabecera (títulos y valores), una línea vacía y después los ítems con su encabezado', async () => {
    const lineasCsv = await exportarCsv(
      crearCompra([crearItem(), crearItem({ descripcion: 'Monitor' })]),
    );

    expect(lineasCsv[0].split(';')).toEqual(COLUMNAS_COMPRA);
    expect(lineasCsv[1].split(';')).toEqual([
      'COM-2026-00007',
      '19/08/2026',
      'Reposición de equipos',
      'Renovación del laboratorio',
      'Soporte',
      'Pendiente',
    ]);
    expect(lineasCsv[2]).toBe('');
    expect(lineasCsv[3].split(';')).toEqual(COLUMNAS_ITEM);
    expect(lineasCsv.slice(4)).toHaveLength(2);
  });

  it('las filas de ítem ya no repiten los datos de la compra', async () => {
    const lineasCsv = await exportarCsv(
      crearCompra([crearItem({ observaciones: 'Entregar en depósito' })]),
    );

    expect(lineasCsv[4].split(';')).toEqual([
      'Notebook',
      '2',
      'Proveedor SA',
      'ARS',
      '1000,00',
      '2000,00',
      '15/01/2026',
      'Pendiente',
      '',
      '',
      '',
      'No',
      'No',
      'Entregar en depósito',
    ]);
    expect(lineasCsv[4]).not.toContain('COM-2026-00007');
  });

  it('la descripción del ítem sale completa, con saltos de línea y separadores escapados', async () => {
    const descripcion = 'Equipo; con "comillas"\nSegunda línea ' + 'z'.repeat(2000);
    const contenido = (
      await new ExportarCompraUseCase(
        crearRepo(crearCompra([crearItem({ descripcion })])),
        crearTipos(),
      ).execute({ compraId: 'c1' })
    ).getValue().contenido;

    expect(contenido).toContain(`"${descripcion.replace(/"/g, '""')}"`);
  });

  it('no exporta los ítems eliminados', async () => {
    const eliminado = crearItem({ descripcion: 'Ítem borrado' });
    eliminado.softDelete();

    const lineasCsv = await exportarCsv(crearCompra([crearItem(), eliminado]));

    expect(lineasCsv.slice(4)).toHaveLength(1);
    expect(lineasCsv.join('\n')).not.toContain('Ítem borrado');
  });

  it('una compra sin ítems vivos trae la cabecera, la línea vacía y el encabezado de ítems sin filas', async () => {
    const borrado = crearItem();
    borrado.softDelete();

    const lineasCsv = await exportarCsv(crearCompra([borrado]));

    expect(lineasCsv).toHaveLength(4);
    expect(lineasCsv[1]).toContain('COM-2026-00007');
    expect(lineasCsv[3].split(';')).toEqual(COLUMNAS_ITEM);
  });

  it('una compra sin tipo deja vacía la celda Tipo de la cabecera', async () => {
    const lineasCsv = await exportarCsv(crearCompra([crearItem()], { tipoTicketId: null }));

    expect(lineasCsv[1].split(';')[COLUMNAS_COMPRA.indexOf('Tipo')]).toBe('');
  });

  it('neutraliza fórmulas en el texto libre de la compra y del ítem (CSV)', async () => {
    const lineasCsv = await exportarCsv(
      crearCompra(
        [crearItem({ descripcion: '+cmd', proveedor: '@SUM(1)', observaciones: '-2+3' })],
        { motivo: '=HYPERLINK("x")' },
      ),
    );

    expect(lineasCsv[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lineasCsv[4].split(';')).toEqual(expect.arrayContaining(["'+cmd", "'@SUM(1)", "'-2+3"]));
  });

  it('el nombre del archivo lleva el número de la compra', async () => {
    const result = await new ExportarCompraUseCase(
      crearRepo(crearCompra([crearItem()])),
      crearTipos(),
    ).execute({ compraId: 'c1' }, 'xlsx');

    expect(result.getValue().nombreArchivo).toMatch(
      /^compra-COM-2026-00007-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });

  it('en xlsx: cabecera en filas 1 y 2, fila 3 vacía, ítems desde la 4, con la descripción completa', async () => {
    const descripcion = 'Detalle\nlargo ' + 'w'.repeat(1500);
    const result = await new ExportarCompraUseCase(
      crearRepo(crearCompra([crearItem({ descripcion, observaciones: '=1+1' })])),
      crearTipos(),
    ).execute({ compraId: 'c1' }, 'xlsx');

    const hoja = (await leerXlsx(result.getValue().contenido)).worksheets[0];
    const valores = (fila: number): unknown[] => (hoja.getRow(fila).values as unknown[]).slice(1);
    expect(valores(1)).toEqual(COLUMNAS_COMPRA);
    expect(valores(2)[0]).toBe('COM-2026-00007');
    expect(valores(3)).toEqual([]);
    expect(valores(4)).toEqual(COLUMNAS_ITEM);
    expect(hoja.getRow(5).getCell(1).value).toBe(descripcion);
    const observacion = hoja.getRow(5).getCell(COLUMNAS_ITEM.length);
    expect(observacion.value).toBe('=1+1');
    expect(observacion.formula).toBeUndefined();
  });

  it('compra inexistente → CompraNoEncontradaError', async () => {
    const result = await new ExportarCompraUseCase(crearRepo(null), crearTipos()).execute({
      compraId: 'c1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('compra eliminada → CompraNoEncontradaError', async () => {
    const result = await new ExportarCompraUseCase(
      crearRepo(crearCompra([crearItem()], {}, new Date('2026-09-01T00:00:00.000Z'))),
      crearTipos(),
    ).execute({ compraId: 'c1' });

    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });
});
