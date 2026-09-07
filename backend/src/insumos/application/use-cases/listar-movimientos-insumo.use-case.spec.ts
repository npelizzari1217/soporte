import { describe, expect, it, vi } from 'vitest';
import { ListarMovimientosInsumoUseCase } from './listar-movimientos-insumo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { TipoMovimientoInsumo } from '../../domain/entities/tipo-movimiento-insumo';
import {
  PaginaDeMovimientosInsumo,
  SumasPorTipoMovimiento,
} from '../../domain/ports/i-movimiento-insumo.repository';

describe('ListarMovimientosInsumoUseCase', () => {
  /**
   * Los dos ids DIFIEREN a propósito, y esa diferencia es lo único que hace
   * que "usa el id de la entidad y no el argumento" pueda probarse: con los
   * dos iguales, ese assert pasaría igual aunque el caso de uso reenviara el
   * valor crudo.
   */
  const ID_CANONICO = 'ins-1';
  const ID_CRUDO = 'INS-1';

  function propsDeInsumo(opciones: { activo?: boolean } = {}) {
    return {
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: opciones.activo ?? true,
      codigosAlternativos: [],
      compatibilidad: [],
    };
  }

  function insumo(opciones: { activo?: boolean } = {}): InsumoEntity {
    return InsumoEntity.create(propsDeInsumo(opciones), ID_CANONICO);
  }

  /**
   * La baja lógica no tiene mutador en `InsumoEntity`, así que la única forma
   * de construir el caso es rehidratando una fila con fecha de baja — que es
   * exactamente lo que devuelve `findById()`, que no filtra por `deletedAt`.
   */
  function insumoDadoDeBaja(): InsumoEntity {
    return InsumoEntity.reconstitute(
      propsDeInsumo(),
      ID_CANONICO,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z'),
    );
  }

  /**
   * Se rehidrata en vez de crearse: son filas que la base ya devolvió, y
   * `reconstitute()` es el camino por el que el repositorio real las arma.
   */
  function movimiento(
    id: string,
    tipo: TipoMovimientoInsumo,
    cantidad: number,
  ): MovimientoInsumoEntity {
    return MovimientoInsumoEntity.reconstitute(
      {
        insumoId: ID_CANONICO,
        tipo,
        cantidad,
        usuarioId: 'usr-1',
        motivo: null,
        equipoId: null,
        sectorId: null,
        itemCompraId: null,
      },
      id,
      new Date('2026-03-01T10:00:00Z'),
    );
  }

  const SUMAS_CUALQUIERA: SumasPorTipoMovimiento = {
    ENTRADA: 10,
    SALIDA: 0,
    AJUSTE_POSITIVO: 0,
    AJUSTE_NEGATIVO: 0,
  };

  /**
   * El repositorio falso expone LOS CUATRO métodos del puerto, aunque el caso
   * de uso solo declare necesitar uno. Es a propósito: los otros tres están
   * acá para que "no toma el lock, no suma y no escribe" pueda asertarse de
   * verdad — sobre un doble que no los tuviera, esos asserts pasarían en verde
   * por construcción.
   */
  function buildColaboradores(
    opciones: { insumo?: InsumoEntity | null; pagina?: PaginaDeMovimientosInsumo } = {},
  ) {
    const encontrado = opciones.insumo === undefined ? insumo() : opciones.insumo;
    const pagina = opciones.pagina ?? {
      movimientos: [movimiento('mov-2', 'SALIDA', 3), movimiento('mov-1', 'ENTRADA', 10)],
      total: 2,
    };

    const insumoRepo = { findById: vi.fn().mockResolvedValue(encontrado) };
    const movimientoRepo = {
      listarPorInsumo: vi.fn().mockResolvedValue(pagina),
      sumByTipo: vi.fn().mockResolvedValue(SUMAS_CUALQUIERA),
      lockAndSumByTipo: vi.fn().mockResolvedValue(SUMAS_CUALQUIERA),
      insert: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new ListarMovimientosInsumoUseCase(insumoRepo, movimientoRepo);

    return { useCase, insumoRepo, movimientoRepo, pagina };
  }

  // ─── La página ───────────────────────────────────────────────────────────

  it('devuelve los movimientos del insumo con el total del universo completo', async () => {
    const c = buildColaboradores({
      pagina: { movimientos: [movimiento('mov-1', 'ENTRADA', 10)], total: 47 },
    });

    const result = await c.useCase.execute(ID_CRUDO, { pagina: 1, porPagina: 1 });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().items.map((m) => m.id)).toEqual(['mov-1']);
    // El total es el del universo, no el tamaño de la página: con una sola
    // fila devuelta el listado igual sabe que hay 47 movimientos.
    expect(result.getValue().total).toBe(47);
  });

  /**
   * La ficha se abre sin pedir nada, así que el default no es una comodidad:
   * es la ventana con la que la pantalla arranca siempre. Se asierta sobre el
   * ARGUMENTO con el que se llamó a la persistencia y no solo sobre el
   * retorno, porque devolver `pagina: 1` sin haber acotado la consulta es
   * exactamente el bug que este caso existe para atrapar.
   */
  it('pide la primera página de veinte cuando el DTO no dice nada', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute(ID_CRUDO);

    expect(c.movimientoRepo.listarPorInsumo).toHaveBeenCalledWith(ID_CANONICO, {
      limit: 20,
      offset: 0,
    });
    expect(result.getValue().pagina).toBe(1);
    expect(result.getValue().porPagina).toBe(20);
  });

  /**
   * La página es 1-indexed y el offset se calcula acá. Se prueba con una
   * página ALTA a propósito: con la página 2 un error de `+1`/`-1` daría 10 o
   * 30 y podría confundirse con otro tamaño de página, mientras que acá la
   * cuenta correcta (20) y las dos equivocadas (10 y 30) son inconfundibles.
   */
  it('traduce la página pedida a un offset', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute(ID_CRUDO, { pagina: 3, porPagina: 10 });

    expect(c.movimientoRepo.listarPorInsumo).toHaveBeenCalledWith(ID_CANONICO, {
      limit: 10,
      offset: 20,
    });
    expect(result.getValue().pagina).toBe(3);
    expect(result.getValue().porPagina).toBe(10);
  });

  it('lista la bitácora del insumo que encontró, no el id que le pasaron', async () => {
    const c = buildColaboradores();

    await c.useCase.execute(ID_CRUDO);

    expect(c.movimientoRepo.listarPorInsumo).toHaveBeenCalledTimes(1);
    expect(c.movimientoRepo.listarPorInsumo.mock.calls[0]?.[0]).toBe(ID_CANONICO);
  });

  /**
   * **La consulta NO toca la sección crítica ni la escritura.**
   * `lockAndSumByTipo()` haría esperar a los escritores del insumo cada vez
   * que alguien abre la bitácora, `sumByTipo()` sería una consulta agregada
   * que este caso de uso no necesita, e `insert()` no tiene nada que hacer en
   * una lectura. Los tres dobles responden perfectamente si se los llama, así
   * que lo único que puede mantener este assert en verde es que genuinamente
   * no se invoquen.
   */
  it('no pasa por ninguna otra operación del puerto de la bitácora', async () => {
    const c = buildColaboradores();

    await c.useCase.execute(ID_CRUDO);

    expect(c.movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
    expect(c.movimientoRepo.sumByTipo).not.toHaveBeenCalled();
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  // ─── Elegibilidad del insumo ─────────────────────────────────────────────

  /**
   * La bitácora de un insumo que no existe no es una lista vacía: son cosas
   * distintas, y devolver `200 []` le diría al usuario que el insumo existe y
   * nunca se movió. Mismo criterio que la consulta de stock.
   */
  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo no existe', async () => {
    const c = buildColaboradores({ insumo: null });

    const result = await c.useCase.execute(ID_CRUDO);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.listarPorInsumo).not.toHaveBeenCalled();
  });

  /**
   * La baja lógica cuenta como inexistencia, con el mismo criterio que el
   * resto del módulo: `findById()` no filtra por `deletedAt`, así que la fila
   * vuelve y es la capa de aplicación la que decide.
   */
  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo está dado de baja', async () => {
    const c = buildColaboradores({ insumo: insumoDadoDeBaja() });

    const result = await c.useCase.execute(ID_CRUDO);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.listarPorInsumo).not.toHaveBeenCalled();
  });

  /**
   * Hermano invertido de los dos rechazos, y una decisión: un insumo
   * DESHABILITADO sí devuelve su historial. Es el mismo criterio que el stock
   * y que la salida — un insumo retirado de circulación puede tener existencia
   * en el depósito, y su bitácora es justo lo que hay que poder mirar para
   * vaciarlo. Sin este caso, "no exige habilitado" pasaría por construcción.
   */
  it('devuelve la bitácora de un insumo deshabilitado', async () => {
    const c = buildColaboradores({ insumo: insumo({ activo: false }) });

    const result = await c.useCase.execute(ID_CRUDO);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().items).toHaveLength(2);
    expect(result.getValue().total).toBe(2);
  });
});
