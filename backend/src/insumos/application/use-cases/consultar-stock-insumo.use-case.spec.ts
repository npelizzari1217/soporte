import { describe, expect, it, vi } from 'vitest';
import { ConsultarStockInsumoUseCase } from './consultar-stock-insumo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { TipoMovimientoInsumo } from '../../domain/entities/tipo-movimiento-insumo';
import { SumasPorTipoMovimiento } from '../../domain/ports/i-movimiento-insumo.repository';

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

  function sumas(parcial: Partial<Record<TipoMovimientoInsumo, number>>): SumasPorTipoMovimiento {
    return {
      ENTRADA: 0,
      SALIDA: 0,
      AJUSTE_POSITIVO: 0,
      AJUSTE_NEGATIVO: 0,
      ...parcial,
    };
  }

  /**
   * El repositorio falso expone LOS DOS métodos de lectura, aunque el caso de
   * uso solo declare necesitar uno. Es a propósito: `lockAndSumByTipo` está
   * acá para que "no toma el lock" pueda asertarse de verdad — sobre un doble
   * que no lo tuviera, ese assert pasaría en verde por construcción.
   */
  function buildColaboradores(
    opciones: { insumo?: InsumoEntity | null; sumas?: SumasPorTipoMovimiento } = {},
  ) {
    const encontrado = opciones.insumo === undefined ? insumo() : opciones.insumo;
    const desglose = opciones.sumas ?? sumas({ ENTRADA: 10 });

    const insumoRepo = { findById: vi.fn().mockResolvedValue(encontrado) };
    const movimientoRepo = {
      sumByTipo: vi.fn().mockResolvedValue(desglose),
      lockAndSumByTipo: vi.fn().mockResolvedValue(desglose),
    };

    const useCase = new ConsultarStockInsumoUseCase(insumoRepo, movimientoRepo);

    return { useCase, insumoRepo, movimientoRepo };
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
      stockMinimo: 20,
      estadoReposicion: 'SUFICIENTE',
    });
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
});
