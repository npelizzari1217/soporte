/**
 * [UNIT] `ExportarCompraUseCase` — exportación de UNA compra, una fila por
 * ítem (odd/tasks/export-compra-individual.md, S1-S5).
 */
import { leerXlsx } from '../../../testing/leer-xlsx';
import { ExportarCompraUseCase } from './exportar-compra.use-case';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { ResolverTiposDeCompra } from '../services/tipos-de-compra';

const BOM = '\uFEFF';

const COLUMNAS_ESPERADAS = [
  'Número',
  'Motivo',
  'Descripción de la compra',
  'Tipo',
  'Estado de la compra',
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
  it('emite las columnas de la compra y del ítem, en orden, y una fila por ítem', async () => {
    const [encabezado, ...filas] = await exportarCsv(
      crearCompra([crearItem(), crearItem({ descripcion: 'Monitor' })]),
    );

    expect(encabezado.split(';')).toEqual(COLUMNAS_ESPERADAS);
    expect(filas.filter((fila) => fila !== '')).toHaveLength(2);
  });

  it('cada fila repite los datos de la compra y trae los del ítem', async () => {
    const [, fila] = await exportarCsv(
      crearCompra([crearItem({ observaciones: 'Entregar en dep\u00f3sito' })]),
    );

    expect(fila.split(';')).toEqual([
      'COM-2026-00007',
      'Reposición de equipos',
      'Renovación del laboratorio',
      'Soporte',
      'Pendiente',
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
      'Entregar en dep\u00f3sito',
    ]);
  });

  it('la descripción del ítem sale completa, con saltos de línea y separadores escapados', async () => {
    const descripcion = 'Equipo; con \"comillas\"\nSegunda línea ' + 'z'.repeat(2000);
    const contenido = (
      await new ExportarCompraUseCase(
        crearRepo(crearCompra([crearItem({ descripcion })])),
        crearTipos(),
      ).execute({ compraId: 'c1' })
    ).getValue().contenido;

    expect(contenido).toContain(`\"${descripcion.replace(/\"/g, '\"\"')}\"`);
  });

  it('no exporta los ítems eliminados', async () => {
    const eliminado = crearItem({ descripcion: 'Ítem borrado' });
    eliminado.softDelete();

    const [, ...filas] = await exportarCsv(crearCompra([crearItem(), eliminado]));

    expect(filas.filter((fila) => fila !== '')).toHaveLength(1);
    expect(filas.join('\n')).not.toContain('Ítem borrado');
  });

  it('una compra sin tipo deja la columna Tipo vacía', async () => {
    const [encabezado, fila] = await exportarCsv(
      crearCompra([crearItem()], { tipoTicketId: null }),
    );

    expect(fila.split(';')[encabezado.split(';').indexOf('Tipo')]).toBe('');
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

  it('en xlsx trae los mismos encabezados que el CSV y la descripción completa', async () => {
    const descripcion = 'Detalle\nlargo ' + 'w'.repeat(1500);
    const result = await new ExportarCompraUseCase(
      crearRepo(crearCompra([crearItem({ descripcion })])),
      crearTipos(),
    ).execute({ compraId: 'c1' }, 'xlsx');

    const hoja = (await leerXlsx(result.getValue().contenido)).worksheets[0];
    const encabezados = (hoja.getRow(1).values as unknown[]).slice(1);
    expect(encabezados).toEqual(COLUMNAS_ESPERADAS);
    const columna = encabezados.indexOf('Descripción del ítem') + 1;
    expect(hoja.getRow(2).getCell(columna).value).toBe(descripcion);
  });

  it('neutraliza fórmulas en el texto libre de la compra y del ítem (CSV)', async () => {
    const [, fila] = await exportarCsv(
      crearCompra(
        [crearItem({ descripcion: '+cmd', proveedor: '@SUM(1)', observaciones: '-2+3' })],
        { motivo: '=HYPERLINK("x")' },
      ),
    );

    expect(fila).toContain(`"'=HYPERLINK(""x"")"`);
    expect(fila.split(';')).toEqual(expect.arrayContaining(["'+cmd", "'@SUM(1)", "'-2+3"]));
  });

  it('en xlsx una observación con forma de fórmula queda como texto', async () => {
    const result = await new ExportarCompraUseCase(
      crearRepo(crearCompra([crearItem({ observaciones: '=1+1' })])),
      crearTipos(),
    ).execute({ compraId: 'c1' }, 'xlsx');

    const celda = (await leerXlsx(result.getValue().contenido)).worksheets[0]
      .getRow(2)
      .getCell(COLUMNAS_ESPERADAS.length);
    expect(celda.value).toBe('=1+1');
    expect(celda.formula).toBeUndefined();
  });

  it('una compra sin ítems vivos exporta una fila con la cabecera y las columnas de ítem vacías', async () => {
    const borrado = crearItem();
    borrado.softDelete();

    const [encabezado, fila, ...resto] = await exportarCsv(crearCompra([borrado]));

    expect(encabezado.split(';')).toEqual(COLUMNAS_ESPERADAS);
    expect(fila.split(';')).toEqual([
      'COM-2026-00007',
      'Reposición de equipos',
      'Renovación del laboratorio',
      'Soporte',
      'Pendiente',
      ...Array<string>(COLUMNAS_ESPERADAS.length - 5).fill(''),
    ]);
    expect(resto.filter((linea) => linea !== '')).toHaveLength(0);
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
