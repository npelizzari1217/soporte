import { describe, expect, it, vi } from 'vitest';
import { ConsultarStockInsumoUseCase } from './consultar-stock-insumo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { TipoMovimientoInsumo } from '../../domain/entities/tipo-movimiento-insumo';
import { SumasPorCondicionYTipo } from '../../domain/entities/tipo-movimiento-insumo';
import { sumasCon } from '../../testing/sumas-movimiento';
import { EstadoFamiliaFake, familiaRepoFake } from '../../testing/familia-repo-fake';

describe('ConsultarStockInsumoUseCase', () => {
  function propsDeInsumo(opciones: { activo?: boolean; stockMinimo?: number | null } = {}) {
    return {
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: opciones.stockMinimo === undefined ? null : opciones.stockMinimo,
      activo: opciones.activo ?? true,
      codigosAlternativos: [],
      compatibilidad: [],
    };
  }

  function insumo(opciones: { activo?: boolean; stockMinimo?: number | null } = {}): InsumoEntity {
    return InsumoEntity.create(propsDeInsumo(opciones), 'ins-1');
  }

  /**
   * La baja lógica no tiene mutador en `InsumoEntity`, así que la única forma
   * de construir el caso es rehidratando una fila con fecha de baja — que es
   * exactamente lo que devuelve `findById()`, que no filtra por `deletedAt`.
   */
  function insumoDadoDeBaja(): InsumoEntity {
    return InsumoEntity.reconstitute(
      propsDeInsumo(),
      'ins-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z'),
    );
  }

  function sumas(parcial: Partial<Record<TipoMovimientoInsumo, number>>): SumasPorCondicionYTipo {
    return sumasCon({ NUEVO: parcial });
  }

  /**
   * El repositorio falso expone LOS DOS métodos de lectura, aunque el caso de
   * uso solo declare necesitar uno. Es a propósito: `lockAndSumByTipo` está
   * acá para que "no toma el lock" pueda asertarse de verdad — sobre un doble
   * que no lo tuviera, ese assert pasaría en verde por construcción.
   */
  function buildColaboradores(
    opciones: {
      insumo?: InsumoEntity | null;
      sumas?: SumasPorCondicionYTipo;
      familia?: EstadoFamiliaFake;
      unidades?: UnidadInsumoEntity[];
      conteo?: { NUEVO: number; USADO: number };
    } = {},
  ) {
    const encontrado = opciones.insumo === undefined ? insumo() : opciones.insumo;
    const desglose = opciones.sumas ?? sumas({ ENTRADA: 10 });

    const insumoRepo = { findById: vi.fn().mockResolvedValue(encontrado) };
    const movimientoRepo = {
      sumByTipo: vi.fn().mockResolvedValue(desglose),
      lockAndSumByTipo: vi.fn().mockResolvedValue(desglose),
    };

    const familiaRepo = familiaRepoFake(opciones.familia);

    const unidadRepo = {
      contarEnDepositoPorCondicion: vi
        .fn()
        .mockResolvedValue(opciones.conteo ?? { NUEVO: 0, USADO: 0 }),
      listarPorInsumo: vi.fn().mockResolvedValue(opciones.unidades ?? []),
    };

    const useCase = new ConsultarStockInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      familiaRepo,
      unidadRepo,
    );

    return { useCase, insumoRepo, movimientoRepo, familiaRepo, unidadRepo };
  }

  // ─── El saldo ────────────────────────────────────────────────────────────

  /**
   * El insumo sin ningún movimiento tiene stock CERO, no "stock desconocido".
   * El puerto promete los cuatro tipos presentes en cero, y de esos cuatro
   * ceros la única lectura posible es que no hay nada en el depósito.
   */
  it('devuelve stock cero para un insumo sin bitácora', async () => {
    const c = buildColaboradores({ sumas: sumas({}) });

    const result = await c.useCase.execute('ins-1');

    expect(result.isOk()).toBe(true);
    expect(result.getValue().stock).toBe(0);
  });

  /**
   * El saldo sale de `calcularStock()`, la única fórmula del sistema, así que
   * los CUATRO tipos participan con su dirección. El fixture le da a cada tipo
   * un valor distinto: con valores repetidos, dos direcciones intercambiadas
   * darían el mismo número y el caso no probaría nada.
   */
  it('calcula el saldo con los cuatro tipos de movimiento', async () => {
    const c = buildColaboradores({
      sumas: sumas({ ENTRADA: 100, SALIDA: 30, AJUSTE_POSITIVO: 7, AJUSTE_NEGATIVO: 2 }),
    });

    const result = await c.useCase.execute('ins-1');

    // 100 + 7 − 30 − 2
    expect(result.getValue().stock).toBe(75);
  });

  it('consulta la bitácora del insumo que encontró, no el id que le pasaron', async () => {
    const c = buildColaboradores();

    await c.useCase.execute('ins-1');

    expect(c.movimientoRepo.sumByTipo).toHaveBeenCalledTimes(1);
    expect(c.movimientoRepo.sumByTipo).toHaveBeenCalledWith('ins-1');
  });

  /**
   * **La consulta NO toca la sección crítica.** `lockAndSumByTipo()` toma el
   * advisory lock del insumo y haría esperar a sus escritores cada vez que
   * alguien abre una ficha; además exige transacción activa y lanzaría sin
   * ella. El doble responde perfectamente si se lo llama, así que lo único que
   * puede mantener este assert en verde es que genuinamente no se invoque.
   */
  it('no pasa por la lectura que toma el advisory lock', async () => {
    const c = buildColaboradores();

    await c.useCase.execute('ins-1');

    expect(c.movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
  });

  // ─── El indicador de reposición ──────────────────────────────────────────

  /**
   * El límite EXACTO, que es donde esto se rompe: `stockMinimo` es el punto de
   * reposición y el aviso llega AL LLEGAR, no después de perforarlo.
   */
  it('marca BAJO_MINIMO cuando el stock llega justo al punto de reposición', async () => {
    const c = buildColaboradores({
      insumo: insumo({ stockMinimo: 20 }),
      sumas: sumas({ ENTRADA: 50, SALIDA: 30 }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().stock).toBe(20);
    expect(result.getValue().estadoReposicion).toBe('BAJO_MINIMO');
  });

  /** Hermano invertido del límite: una centésima por encima todavía alcanza. */
  it('marca SUFICIENTE una centésima por encima del punto de reposición', async () => {
    const c = buildColaboradores({
      insumo: insumo({ stockMinimo: 20 }),
      sumas: sumas({ ENTRADA: 50, SALIDA: 29.99 }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().stock).toBe(20.01);
    expect(result.getValue().estadoReposicion).toBe('SUFICIENTE');
  });

  /**
   * `null` es "este insumo no tiene punto de reposición definido", que NO es
   * lo mismo que cero y tampoco es "está bien abastecido". El estado tiene
   * nombre propio para que la ficha —y el borde HTTP— puedan distinguir un
   * insumo sin configurar de uno que está por encima de su punto.
   */
  it('marca SIN_PUNTO_DEFINIDO cuando el insumo no tiene punto de reposición', async () => {
    const c = buildColaboradores({
      insumo: insumo({ stockMinimo: null }),
      sumas: sumas({ ENTRADA: 50 }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().stockMinimo).toBeNull();
    expect(result.getValue().estadoReposicion).toBe('SIN_PUNTO_DEFINIDO');
  });

  /**
   * Hermano invertido del anterior, y el que hace visible la trampa: con el
   * depósito VACÍO y sin punto definido, el estado sigue siendo
   * `SIN_PUNTO_DEFINIDO`. Si el indicador fuera un booleano resuelto como
   * `false`, este caso y el de un insumo bien abastecido serían el mismo.
   */
  it('sigue en SIN_PUNTO_DEFINIDO con el depósito vacío y sin punto configurado', async () => {
    const c = buildColaboradores({ insumo: insumo({ stockMinimo: null }), sumas: sumas({}) });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().stock).toBe(0);
    expect(result.getValue().estadoReposicion).toBe('SIN_PUNTO_DEFINIDO');
  });

  it('devuelve el punto de reposición configurado junto con el saldo', async () => {
    const c = buildColaboradores({
      insumo: insumo({ stockMinimo: 20 }),
      sumas: sumas({ ENTRADA: 50 }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue()).toEqual({
      insumoId: 'ins-1',
      stock: 50,
      saldos: { NUEVO: 50, USADO: 0 },
      admiteUsado: true,
      stockMinimo: 20,
      estadoReposicion: 'SUFICIENTE',
      seguimiento: 'NINGUNO',
      pendientesDeSerie: 0,
    });
  });

  // ─── Saldos por condición y reposición sobre NUEVO ───────────────────────

  /** Los usados no ocultan la falta de nuevos: la reposición mira solo NUEVO. */
  it('marca BAJO_MINIMO con NUEVO bajo el punto aunque el total lo supere por los usados', async () => {
    const c = buildColaboradores({
      insumo: insumo({ stockMinimo: 5 }),
      sumas: sumasCon({ NUEVO: { ENTRADA: 2 }, USADO: { ENTRADA: 10 } }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().saldos).toEqual({ NUEVO: 2, USADO: 10 });
    expect(result.getValue().stock).toBe(12);
    expect(result.getValue().estadoReposicion).toBe('BAJO_MINIMO');
  });

  it('marca SUFICIENTE con NUEVO sobre el punto y sin usados', async () => {
    const c = buildColaboradores({
      insumo: insumo({ stockMinimo: 5 }),
      sumas: sumasCon({ NUEVO: { ENTRADA: 8 } }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().saldos).toEqual({ NUEVO: 8, USADO: 0 });
    expect(result.getValue().estadoReposicion).toBe('SUFICIENTE');
  });

  it('sin movimientos USADO devuelve USADO en cero y el total igual a NUEVO', async () => {
    const c = buildColaboradores({ sumas: sumasCon({ NUEVO: { ENTRADA: 7, SALIDA: 2 } }) });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().saldos.USADO).toBe(0);
    expect(result.getValue().stock).toBe(5);
    expect(result.getValue().stock).toBe(result.getValue().saldos.NUEVO);
  });

  it('un saldo USADO negativo no se recorta y entra al total', async () => {
    const c = buildColaboradores({
      sumas: sumasCon({ NUEVO: { ENTRADA: 4 }, USADO: { SALIDA: 1 } }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().saldos).toEqual({ NUEVO: 4, USADO: -1 });
    expect(result.getValue().stock).toBe(3);
  });

  // ─── admiteUsado ─────────────────────────────────────────────────────────

  it('admiteUsado es true para una familia de repuestos vigente', async () => {
    const c = buildColaboradores({ familia: { esRepuesto: true } });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().admiteUsado).toBe(true);
  });

  it('admiteUsado es false para una familia que no es de repuestos', async () => {
    const c = buildColaboradores({ familia: { esRepuesto: false } });

    const result = await c.useCase.execute('ins-1');

    expect(result.getValue().admiteUsado).toBe(false);
  });

  it('admiteUsado es false si la familia no existe o no está vigente', async () => {
    for (const familia of [{ inexistente: true }, { activo: false }, { dadaDeBaja: true }]) {
      const c = buildColaboradores({ familia });

      const result = await c.useCase.execute('ins-1');

      expect(result.getValue().admiteUsado).toBe(false);
    }
  });

  // ─── Elegibilidad del insumo ─────────────────────────────────────────────

  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo no existe', async () => {
    const c = buildColaboradores({ insumo: null });

    const result = await c.useCase.execute('ins-1');

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.sumByTipo).not.toHaveBeenCalled();
  });

  /**
   * La baja lógica cuenta como inexistencia, con el mismo criterio que el
   * resto del módulo: `findById()` no filtra por `deletedAt`, así que la fila
   * vuelve y es la capa de aplicación la que decide.
   */
  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo está dado de baja', async () => {
    const c = buildColaboradores({ insumo: insumoDadoDeBaja() });

    const result = await c.useCase.execute('ins-1');

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.sumByTipo).not.toHaveBeenCalled();
  });

  /**
   * Hermano invertido de los dos rechazos, y una decisión: un insumo
   * DESHABILITADO sí devuelve su stock. Es el mismo criterio que la SALIDA,
   * que tampoco exige el insumo habilitado — rechazar la consulta dejaría al
   * usuario sin ver lo que quedó en el depósito de un insumo retirado de
   * circulación, que es justo lo que necesita mirar para vaciarlo.
   */
  it('devuelve el stock de un insumo deshabilitado', async () => {
    const c = buildColaboradores({
      insumo: insumo({ activo: false, stockMinimo: 5 }),
      sumas: sumas({ ENTRADA: 8 }),
    });

    const result = await c.useCase.execute('ins-1');

    expect(result.isOk()).toBe(true);
    expect(result.getValue().stock).toBe(8);
    expect(result.getValue().estadoReposicion).toBe('SUFICIENTE');
  });

  // ─── Insumo SERIE: el saldo sale de contar unidades (ADR-2) ──────────────

  describe('insumo SERIE', () => {
    function insumoSerie(stockMinimo: number | null = null): InsumoEntity {
      return InsumoEntity.create(
        { ...propsDeInsumo({ stockMinimo }), seguimiento: 'SERIE' },
        'ins-1',
      );
    }

    function pendiente(): UnidadInsumoEntity {
      return UnidadInsumoEntity.crearEnDeposito({
        insumoId: 'ins-1',
        condicion: 'NUEVO',
        numeroSerie: null,
      }).getValue();
    }

    it('el saldo por condición sale del conteo de unidades EN_DEPOSITO, no de la bitácora', async () => {
      // La bitácora diría 50 NUEVO: si el caso de uso la leyera, el número saldría de ahí.
      const c = buildColaboradores({
        insumo: insumoSerie(),
        sumas: sumas({ ENTRADA: 50 }),
        conteo: { NUEVO: 3, USADO: 2 },
      });

      const result = await c.useCase.execute('ins-1');

      expect(result.getValue().saldos).toEqual({ NUEVO: 3, USADO: 2 });
      expect(result.getValue().stock).toBe(5);
      expect(result.getValue().seguimiento).toBe('SERIE');
      expect(c.movimientoRepo.sumByTipo).not.toHaveBeenCalled();
      expect(c.unidadRepo.contarEnDepositoPorCondicion).toHaveBeenCalledWith('ins-1');
    });

    it('informa cuántas series pendientes hay entre las unidades en depósito', async () => {
      const c = buildColaboradores({
        insumo: insumoSerie(),
        conteo: { NUEVO: 2, USADO: 0 },
        unidades: [pendiente(), pendiente()],
      });

      const result = await c.useCase.execute('ins-1');

      expect(result.getValue().pendientesDeSerie).toBe(2);
      expect(c.unidadRepo.listarPorInsumo).toHaveBeenCalledWith('ins-1', ['EN_DEPOSITO']);
    });

    it('la reposición se evalúa sobre el saldo NUEVO: los usados no ocultan la falta', async () => {
      const c = buildColaboradores({
        insumo: insumoSerie(5),
        conteo: { NUEVO: 2, USADO: 10 },
      });

      const result = await c.useCase.execute('ins-1');

      expect(result.getValue().estadoReposicion).toBe('BAJO_MINIMO');
    });

    it('un insumo NINGUNO conserva la bitácora, sin pendientes y sin leer unidades', async () => {
      const c = buildColaboradores({ sumas: sumas({ ENTRADA: 7 }) });

      const result = await c.useCase.execute('ins-1');

      expect(result.getValue().stock).toBe(7);
      expect(result.getValue().seguimiento).toBe('NINGUNO');
      expect(result.getValue().pendientesDeSerie).toBe(0);
      expect(c.unidadRepo.contarEnDepositoPorCondicion).not.toHaveBeenCalled();
      expect(c.unidadRepo.listarPorInsumo).not.toHaveBeenCalled();
    });
  });
});
