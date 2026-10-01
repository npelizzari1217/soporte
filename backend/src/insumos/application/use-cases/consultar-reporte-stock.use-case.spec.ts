import {
  ConsultarReporteStockUseCase,
  FiltrosReporteStock,
} from './consultar-reporte-stock.use-case';
import {
  ConteoPorCondicion,
  SumasPorCondicionYTipo,
  TipoMovimientoInsumo,
} from '../../domain/entities/tipo-movimiento-insumo';
import { FilaCatalogoStock } from '../../domain/ports/i-insumo.repository';

/** Desglose por tipo con ceros; el saldo de cada condicion es ENTRADA - SALIDA +/- ajustes. */
function libro(
  nuevo: Partial<Record<TipoMovimientoInsumo, number>> = {},
  usado: Partial<Record<TipoMovimientoInsumo, number>> = {},
): SumasPorCondicionYTipo {
  const base = { ENTRADA: 0, SALIDA: 0, AJUSTE_POSITIVO: 0, AJUSTE_NEGATIVO: 0 };
  return { NUEVO: { ...base, ...nuevo }, USADO: { ...base, ...usado } };
}

function fila(parcial: Partial<FilaCatalogoStock> & { insumoId: string }): FilaCatalogoStock {
  return {
    codigo: parcial.insumoId.toUpperCase(),
    nombre: `Insumo ${parcial.insumoId}`,
    activo: true,
    seguimiento: 'NINGUNO',
    stockMinimo: null,
    familia: { id: 'fam-1', nombre: 'Toner', esRepuesto: false },
    unidadMedida: { codigo: 'UN', nombre: 'Unidad', entera: true },
    ...parcial,
  };
}

interface Escenario {
  catalogo: FilaCatalogoStock[];
  libros?: Record<string, SumasPorCondicionYTipo>;
  conteos?: Record<string, ConteoPorCondicion>;
}

describe('ConsultarReporteStockUseCase', () => {
  const AHORA = new Date('2026-10-02T01:30:00Z');

  /**
   * Los fakes exponen SOLO los tres metodos de lote (R11): sin `sumByTipo`,
   * `contarEnDepositoPorCondicion` ni `findById`, una consulta por insumo no
   * compila ni corre. Los `Map` respetan el contrato de los puertos (una
   * entrada por id pedido).
   */
  function armar(e: Escenario, ahora: () => Date = () => AHORA) {
    const orden: string[] = [];
    const listarParaReporteStock = vi.fn(async (_f: unknown) => {
      orden.push('catalogo');
      return e.catalogo;
    });
    const sumByTipoDeInsumos = vi.fn(async (ids: readonly string[]) => {
      orden.push('libro');
      return new Map(ids.map((id) => [id, e.libros?.[id] ?? libro()]));
    });
    const contarEnDepositoPorCondicionDeInsumos = vi.fn(async (ids: readonly string[]) => {
      orden.push('unidades');
      return new Map(ids.map((id) => [id, e.conteos?.[id] ?? { NUEVO: 0, USADO: 0 }]));
    });
    const useCase = new ConsultarReporteStockUseCase(
      { listarParaReporteStock },
      { sumByTipoDeInsumos },
      { contarEnDepositoPorCondicionDeInsumos },
      ahora,
    );
    return {
      useCase,
      orden,
      listarParaReporteStock,
      sumByTipoDeInsumos,
      contarEnDepositoPorCondicionDeInsumos,
    };
  }

  async function filas(e: Escenario, filtros: FiltrosReporteStock = {}) {
    return (await armar(e).useCase.execute(filtros)).filas;
  }

  it('arma las columnas de una fila: NUEVO 3, USADO 2, minimo 5 => total 5 y BAJO_MINIMO', async () => {
    const [f] = await filas({
      catalogo: [fila({ insumoId: 'r-1', codigo: 'R-1', stockMinimo: 5 })],
      libros: { 'r-1': libro({ ENTRADA: 3 }, { ENTRADA: 2 }) },
    });

    expect(f).toMatchObject({
      codigo: 'R-1',
      saldos: { NUEVO: 3, USADO: 2, total: 5 },
      stockMinimo: 5,
      estadoReposicion: 'BAJO_MINIMO',
      familia: { nombre: 'Toner', esRepuesto: false },
      unidadMedida: { entera: true },
    });
  });

  it('un insumo sin punto de reposicion queda con stockMinimo nulo y SIN_PUNTO_DEFINIDO', async () => {
    const [f] = await filas({
      catalogo: [fila({ insumoId: 'a', stockMinimo: null })],
      libros: { a: libro({ ENTRADA: 1 }) },
    });

    expect(f.stockMinimo).toBeNull();
    expect(f.estadoReposicion).toBe('SIN_PUNTO_DEFINIDO');
  });

  it('pasa los filtros de familia y tipo al catalogo (se resuelven en SQL)', async () => {
    const e = armar({ catalogo: [] });

    await e.useCase.execute({ familiaId: 'fam-9', esRepuesto: true });

    expect(e.listarParaReporteStock).toHaveBeenCalledWith({ familiaId: 'fam-9', esRepuesto: true });
  });

  it('solo bajo minimo deja unicamente BAJO_MINIMO (tres estados presentes)', async () => {
    const r = await filas(
      {
        catalogo: [
          fila({ insumoId: 'a', stockMinimo: 5 }),
          fila({ insumoId: 'b', stockMinimo: 5 }),
          fila({ insumoId: 'c', stockMinimo: null }),
        ],
        libros: { a: libro({ ENTRADA: 2 }), b: libro({ ENTRADA: 9 }), c: libro({ ENTRADA: 1 }) },
      },
      { soloBajoMinimo: true },
    );

    expect(r.map((x) => x.insumoId)).toEqual(['a']);
  });

  it('un insumo deshabilitado con stock 4 aparece con su estado', async () => {
    const [f] = await filas({
      catalogo: [fila({ insumoId: 'a', activo: false, stockMinimo: 10 })],
      libros: { a: libro({ ENTRADA: 4 }) },
    });

    expect(f).toMatchObject({
      activo: false,
      saldos: { total: 4 },
      estadoReposicion: 'BAJO_MINIMO',
    });
  });

  it('un insumo de familia deshabilitada aparece (el catalogo no filtra por estado de familia)', async () => {
    const r = await filas({
      catalogo: [fila({ insumoId: 'a', familia: { id: 'f', nombre: 'Baja', esRepuesto: true } })],
    });

    expect(r).toHaveLength(1);
    expect(r[0].familia.nombre).toBe('Baja');
  });

  describe('ocultar sin stock', () => {
    const catalogo = [
      fila({ insumoId: 'cero' }),
      fila({ insumoId: 'dos' }),
      fila({ insumoId: 'neg' }),
      fila({ insumoId: 'mixto' }),
    ];
    const libros = {
      cero: libro(),
      dos: libro({ ENTRADA: 2 }),
      neg: libro({ SALIDA: 2 }),
      // NUEVO 3 y USADO -3: total 0 pero ninguna condicion en cero.
      mixto: libro({ ENTRADA: 3 }, { SALIDA: 3 }),
    };

    it('oculta solo NUEVO 0 y USADO 0; deja total 2, saldo negativo y 3/-3', async () => {
      const r = await filas({ catalogo, libros }, { ocultarSinStock: true });

      expect(r.map((x) => x.insumoId).sort()).toEqual(['dos', 'mixto', 'neg']);
      expect(r.find((x) => x.insumoId === 'mixto')?.saldos).toEqual({
        NUEVO: 3,
        USADO: -3,
        total: 0,
      });
      expect(r.find((x) => x.insumoId === 'neg')?.saldos.NUEVO).toBe(-2);
    });

    it('sin el filtro muestra las cuatro', async () => {
      expect(await filas({ catalogo, libros })).toHaveLength(4);
    });
  });

  it('los usados no tapan el faltante: minimo 5, NUEVO 2, USADO 10 => total 12 y BAJO_MINIMO', async () => {
    const [f] = await filas({
      catalogo: [fila({ insumoId: 'a', stockMinimo: 5 })],
      libros: { a: libro({ ENTRADA: 2 }, { ENTRADA: 10 }) },
    });

    expect(f.saldos).toEqual({ NUEVO: 2, USADO: 10, total: 12 });
    expect(f.estadoReposicion).toBe('BAJO_MINIMO');
  });

  it('NUEVO igual al minimo es BAJO_MINIMO', async () => {
    const [f] = await filas({
      catalogo: [fila({ insumoId: 'a', stockMinimo: 5 })],
      libros: { a: libro({ ENTRADA: 5 }) },
    });

    expect(f.estadoReposicion).toBe('BAJO_MINIMO');
  });

  it('generadoEn es el de ahora() y se toma antes de la primera lectura', async () => {
    const eventos: string[] = [];
    const e = armar({ catalogo: [fila({ insumoId: 'a' })] }, () => {
      eventos.push('reloj');
      return AHORA;
    });
    e.listarParaReporteStock.mockImplementation(async () => {
      eventos.push('lectura');
      return [fila({ insumoId: 'a' })];
    });

    const r = await e.useCase.execute();

    expect(r.generadoEn).toBe(AHORA);
    expect(eventos).toEqual(['reloj', 'lectura']);
  });

  it('ordena por codigo', async () => {
    const r = await filas({
      catalogo: [
        fila({ insumoId: 'x', codigo: 'C-3' }),
        fila({ insumoId: 'y', codigo: 'A-1' }),
        fila({ insumoId: 'z', codigo: 'B-2' }),
      ],
    });

    expect(r.map((x) => x.codigo)).toEqual(['A-1', 'B-2', 'C-3']);
  });

  it('un SERIE toma el saldo de sus unidades aunque el libro difiera', async () => {
    const [f] = await filas({
      catalogo: [fila({ insumoId: 's', seguimiento: 'SERIE', stockMinimo: 3 })],
      conteos: { s: { NUEVO: 2, USADO: 1 } },
      libros: { s: libro({ ENTRADA: 99 }) },
    });

    expect(f.saldos).toEqual({ NUEVO: 2, USADO: 1, total: 3 });
    expect(f.estadoReposicion).toBe('BAJO_MINIMO');
  });

  describe('sin N+1 (R11)', () => {
    it('con ~50 insumos mezclados hace una consulta por cada fuente', async () => {
      const catalogo = Array.from({ length: 50 }, (_, i) =>
        fila({
          insumoId: `i-${i}`,
          codigo: `C-${String(i).padStart(3, '0')}`,
          seguimiento: i % 2 === 0 ? 'NINGUNO' : 'SERIE',
        }),
      );
      const e = armar({ catalogo });

      const r = await e.useCase.execute();

      expect(r.filas).toHaveLength(50);
      expect(e.listarParaReporteStock).toHaveBeenCalledTimes(1);
      expect(e.sumByTipoDeInsumos).toHaveBeenCalledTimes(1);
      expect(e.contarEnDepositoPorCondicionDeInsumos).toHaveBeenCalledTimes(1);
      expect(e.sumByTipoDeInsumos.mock.calls[0][0]).toHaveLength(25);
      expect(e.contarEnDepositoPorCondicionDeInsumos.mock.calls[0][0]).toHaveLength(25);
    });

    it('sin insumos SERIE no consulta las unidades', async () => {
      const e = armar({ catalogo: [fila({ insumoId: 'a' })] });

      await e.useCase.execute();

      expect(e.sumByTipoDeInsumos).toHaveBeenCalledTimes(1);
      expect(e.contarEnDepositoPorCondicionDeInsumos).not.toHaveBeenCalled();
    });

    it('sin insumos NINGUNO no consulta el libro', async () => {
      const e = armar({ catalogo: [fila({ insumoId: 's', seguimiento: 'SERIE' })] });

      await e.useCase.execute();

      expect(e.contarEnDepositoPorCondicionDeInsumos).toHaveBeenCalledTimes(1);
      expect(e.sumByTipoDeInsumos).not.toHaveBeenCalled();
    });

    it('catalogo vacio: ninguna lectura de saldos', async () => {
      const e = armar({ catalogo: [] });

      const r = await e.useCase.execute();

      expect(r.filas).toEqual([]);
      expect(e.sumByTipoDeInsumos).not.toHaveBeenCalled();
      expect(e.contarEnDepositoPorCondicionDeInsumos).not.toHaveBeenCalled();
    });
  });
});
