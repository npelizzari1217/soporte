import { ExportacionStockDemasiadoGrandeError } from '../../domain/errors/insumos.errors';
import { FilaReporteStock, ReporteStock } from './consultar-reporte-stock.use-case';
import { ExportarReporteStockUseCase } from './exportar-reporte-stock.use-case';

const BOM = '﻿';
const AHORA = new Date('2026-10-02T01:30:00Z');

function fila(parcial: Partial<FilaReporteStock> = {}): FilaReporteStock {
  return {
    insumoId: 'ins-1',
    codigo: 'INS-0001',
    nombre: 'Toner negro',
    activo: true,
    seguimiento: 'NINGUNO',
    familia: { id: 'fam-1', nombre: 'Toner', esRepuesto: false },
    unidadMedida: { codigo: 'UN', nombre: 'Unidad', entera: true },
    saldos: { NUEVO: 3, USADO: 2, total: 5 },
    stockMinimo: 5,
    estadoReposicion: 'BAJO_MINIMO',
    ...parcial,
  };
}

function armar(filas: FilaReporteStock[], generadoEn: Date = AHORA) {
  const execute = vi.fn(async (_f?: unknown): Promise<ReporteStock> => ({ generadoEn, filas }));
  return { useCase: new ExportarReporteStockUseCase({ execute }), execute };
}

async function exportar(filas: FilaReporteStock[]) {
  const r = await armar(filas).useCase.execute();
  expect(r.isOk()).toBe(true);
  return r.getValue();
}

/** Lineas del CSV sin BOM. */
const lineas = (contenido: string) => contenido.slice(BOM.length).split('\r\n');

describe('ExportarReporteStockUseCase', () => {
  it('pasa al nucleo los mismos filtros que recibio', async () => {
    const { useCase, execute } = armar([fila()]);
    const filtros = {
      familiaId: 'f',
      esRepuesto: true,
      soloBajoMinimo: true,
      ocultarSinStock: true,
    };
    await useCase.execute(filtros);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(filtros);
  });

  it('las filas y su orden son las del nucleo', async () => {
    const { contenido } = await exportar([
      fila({ codigo: 'A-1' }),
      fila({ codigo: 'B-2' }),
      fila({ codigo: 'C-3' }),
    ]);
    expect(lineas(contenido).map((l) => l.split(';')[0])).toEqual(['Código', 'A-1', 'B-2', 'C-3']);
  });

  it('columnas y etiquetas exactas', async () => {
    const { contenido } = await exportar([fila()]);
    const [encabezado, datos] = lineas(contenido);
    expect(encabezado).toBe(
      'Código;Nombre;Familia;Tipo;Unidad de medida;Stock nuevo;Stock usado;Stock total;' +
        'Punto de reposición;Estado de reposición;Estado;Generado el',
    );
    expect(datos).toBe(
      'INS-0001;Toner negro;Toner;Consumible;Unidad;3;2;5;5;Hay que reponer;Habilitado;01/10/2026 22:30',
    );
  });

  it('etiquetas de tipo, estado y reposicion', async () => {
    const { contenido } = await exportar([
      fila({
        familia: { id: 'f', nombre: 'Repuestos', esRepuesto: true },
        activo: false,
        estadoReposicion: 'SUFICIENTE',
      }),
      fila({ stockMinimo: null, estadoReposicion: 'SIN_PUNTO_DEFINIDO' }),
    ]);
    const [, a, b] = lineas(contenido).map((l) => l.split(';'));
    expect([a[3], a[9], a[10]]).toEqual(['Repuesto', 'Existencia suficiente', 'Deshabilitado']);
    expect([b[8], b[9]]).toEqual(['', 'Sin punto de reposición definido']);
  });

  it('no lleva ninguna columna ni dato de dinero, aun si el nucleo arrastra montos', async () => {
    const conMonto = {
      ...fila(),
      monto: 1234,
      costo: 99,
      precio: 5,
      moneda: 'ARS',
      items: [{ monto: 1500 }],
    } as FilaReporteStock;
    const { contenido } = await exportar([conMonto]);
    expect(contenido).not.toMatch(/monto|costo|precio|moneda|1234|1500/i);
  });

  it('BOM, separador y nombre de archivo', async () => {
    const { contenido, nombreArchivo } = await exportar([fila()]);
    expect(contenido.startsWith(BOM)).toBe(true);
    expect(lineas(contenido)[0]).toContain(';');
    expect(nombreArchivo).toMatch(/^reporte-stock-insumos-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('con reloj 2026-10-02T01:30Z el nombre lleva la fecha argentina y la celda la hora', async () => {
    const { contenido, nombreArchivo } = await exportar([fila()]);
    expect(nombreArchivo).toBe('reporte-stock-insumos-2026-10-01.csv');
    expect(lineas(contenido)[1].split(';')[11]).toBe('01/10/2026 22:30');
  });

  it('5000 filas pasan: encabezado + 5000 lineas', async () => {
    const filas = Array.from({ length: 5000 }, (_, i) => fila({ codigo: `C-${i}` }));
    const { contenido } = await exportar(filas);
    expect(lineas(contenido)).toHaveLength(5001);
  });

  it('5001 filas devuelven el error de tope y ningun contenido', async () => {
    const filas = Array.from({ length: 5001 }, (_, i) => fila({ codigo: `C-${i}` }));
    const r = await armar(filas).useCase.execute();
    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(ExportacionStockDemasiadoGrandeError);
    expect(() => r.getValue()).toThrow();
  });

  it('un negativo sale sin apostrofo', async () => {
    const { contenido } = await exportar([fila({ saldos: { NUEVO: -3, USADO: 0, total: -3 } })]);
    const celdas = lineas(contenido)[1].split(';');
    expect(celdas.slice(5, 8)).toEqual(['-3', '0', '-3']);
  });

  it('entero 3 vs fraccionario 2,50', async () => {
    const { contenido } = await exportar([
      fila({ saldos: { NUEVO: 3, USADO: 0, total: 3 } }),
      fila({
        unidadMedida: { codigo: 'KG', nombre: 'Kilo', entera: false },
        saldos: { NUEVO: 2.5, USADO: 0, total: 2.5 },
        stockMinimo: 1,
      }),
    ]);
    const [, entera, fraccionaria] = lineas(contenido).map((l) => l.split(';'));
    expect([entera[5], entera[7]]).toEqual(['3', '3']);
    expect([fraccionaria[5], fraccionaria[6], fraccionaria[8]]).toEqual(['2,50', '0,00', '1,00']);
  });

  it('un nombre que empieza con = queda neutralizado', async () => {
    const { contenido } = await exportar([fila({ nombre: '=cmd' })]);
    expect(lineas(contenido)[1].split(';')[1]).toBe("'=cmd");
  });
});
