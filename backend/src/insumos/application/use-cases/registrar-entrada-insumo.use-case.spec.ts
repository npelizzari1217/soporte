import { describe, expect, it, vi } from 'vitest';
import { RegistrarEntradaInsumoUseCase } from './registrar-entrada-insumo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { SumasPorTipoMovimiento } from '../../domain/ports/i-movimiento-insumo.repository';

describe('RegistrarEntradaInsumoUseCase', () => {
  function propsDeInsumo(activo: boolean) {
    return {
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo,
      codigosAlternativos: [],
      compatibilidad: [],
    };
  }

  function insumoVigente(): InsumoEntity {
    return InsumoEntity.create(propsDeInsumo(true), 'ins-1');
  }

  function insumoDeshabilitado(): InsumoEntity {
    return InsumoEntity.create(propsDeInsumo(false), 'ins-1');
  }

  /**
   * La baja lógica no tiene mutador en `InsumoEntity` —`desactivar()` a
   * propósito no toca `deletedAt`—, así que la única forma de construir el
   * caso es rehidratando una fila con fecha de baja, que es exactamente lo que
   * devolvería `findById()`: no filtra por `deletedAt`.
   */
  function insumoDadoDeBaja(activo = true): InsumoEntity {
    return InsumoEntity.reconstitute(
      propsDeInsumo(activo),
      'ins-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z'),
    );
  }

  function buildInsumoRepo(insumo: InsumoEntity | null = insumoVigente()) {
    return { findById: vi.fn().mockResolvedValue(insumo) };
  }

  /**
   * Bitácora CARGADA a propósito: el insumo del fixture ya tiene movimientos
   * de los cuatro tipos. Es lo que hace que el assert de ausencia de
   * `lockAndSumByTipo` signifique algo — si la entrada lo llamara, el mock le
   * respondería un desglose real y el caso de uso seguiría de largo, así que
   * lo único que puede mantener ese assert en verde es que genuinamente no se
   * invoque.
   */
  const SUMAS_CARGADAS: SumasPorTipoMovimiento = {
    ENTRADA: 40,
    SALIDA: 12,
    AJUSTE_POSITIVO: 1,
    AJUSTE_NEGATIVO: 3,
  };

  function buildMovimientoRepo() {
    return {
      insert: vi.fn().mockResolvedValue(undefined),
      lockAndSumByTipo: vi.fn().mockResolvedValue(SUMAS_CARGADAS),
    };
  }

  const dtoBase = { insumoId: 'ins-1', cantidad: 10, usuarioId: 'usr-7' };

  // ─── Camino feliz: el hermano invertido de todos los rechazos de abajo ────

  it('asienta la entrada cuando el insumo está vigente y habilitado', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(), movimientoRepo);

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    const movimiento = result.getValue();
    expect(movimiento.tipo).toBe('ENTRADA');
    expect(movimiento.insumoId).toBe('ins-1');
    expect(movimiento.cantidad).toBe(10);
    expect(movimientoRepo.insert).toHaveBeenCalledTimes(1);
    expect(movimientoRepo.insert).toHaveBeenCalledWith(movimiento);
  });

  /**
   * El `usuarioId` lo pone el borde desde el usuario autenticado y el caso de
   * uso lo copia tal cual: no lo deriva del insumo ni lo inventa. Si se
   * perdiera, la bitácora quedaría sin responder "quién lo movió", que es la
   * mitad de lo que la Entrega 2 existe para contestar.
   */
  it('asienta el usuarioId que recibe, sin derivarlo de ningún otro dato', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(), buildMovimientoRepo());

    const result = await useCase.execute({ ...dtoBase, usuarioId: 'usr-99' });

    expect(result.getValue().usuarioId).toBe('usr-99');
  });

  it('deja el motivo y la trazabilidad en null cuando la entrada no los trae', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(), buildMovimientoRepo());

    const result = await useCase.execute(dtoBase);

    expect(result.getValue().motivo).toBeNull();
    expect(result.getValue().equipoId).toBeNull();
    expect(result.getValue().sectorId).toBeNull();
  });

  /**
   * El motivo es OPCIONAL en la entrada —solo el ajuste lo exige— pero cuando
   * viene se conserva, ya normalizado por la entidad: un motivo de puros
   * espacios colapsa a `null` en vez de convivir con el `NULL` como dos formas
   * de decir "sin motivo".
   */
  it('conserva el motivo recortado y la trazabilidad de equipo y sector', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(), buildMovimientoRepo());

    const result = await useCase.execute({
      ...dtoBase,
      motivo: '  Recepción de la orden 1234  ',
      equipoId: 'eq-3',
      sectorId: 'sec-2',
    });

    expect(result.getValue().motivo).toBe('Recepción de la orden 1234');
    expect(result.getValue().equipoId).toBe('eq-3');
    expect(result.getValue().sectorId).toBe('sec-2');
  });

  it('colapsa a null un motivo que después de recortar queda vacío', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(), buildMovimientoRepo());

    const result = await useCase.execute({ ...dtoBase, motivo: '   ' });

    expect(result.getValue().motivo).toBeNull();
  });

  // ─── Concurrencia: la entrada NO pasa por la sección crítica ──────────────

  /**
   * La entrada SUMA, así que no puede dejar el stock negativo: la invariante
   * que el advisory lock protege es de los movimientos que RESTAN. Tomarlo
   * igual haría esperar a las salidas del mismo insumo detrás de cada
   * recepción y pagaría el `GROUP BY` de toda la bitácora para no decidir
   * nada.
   *
   * El caso de uso ni siquiera recibe `lockAndSumByTipo` en su `Pick`, así que
   * el compilador ya lo impide; este assert cubre el otro camino, el de
   * alguien que ensancha el `Pick` "por simetría" con la salida. El mock lo
   * ofrece cargado (ver `SUMAS_CARGADAS`): si se llamara, respondería y el
   * flujo seguiría — lo único que mantiene este assert en verde es que no se
   * invoca.
   */
  it('no toma el advisory lock del stock: la entrada solo suma', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(), movimientoRepo);

    await useCase.execute(dtoBase);

    expect(movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
  });

  // ─── Elegibilidad del insumo ─────────────────────────────────────────────

  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo no existe en el catálogo', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(null), movimientoRepo);

    const result = await useCase.execute({ ...dtoBase, insumoId: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * `findById()` NO filtra por `deletedAt`, así que la fila dada de baja
   * vuelve igual: sin este guard, la entrada se asentaría contra un insumo que
   * el catálogo ya no reconoce.
   */
  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo tiene baja lógica', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(insumoDadoDeBaja()),
      movimientoRepo,
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * Deshabilitar un insumo es sacarlo de circulación: no se compra más de él.
   * Una ENTRADA es traer más al depósito, o sea justo el compromiso nuevo que
   * la baja canceló — y sin este guard nada avisa que se acaba de recibir algo
   * que la organización retiró. Es el mismo criterio de "existir no es ser
   * elegible" que ya aplican la familia, la unidad y el modelo.
   *
   * La SALIDA y el AJUSTE son el caso opuesto y NO se responden igual: operan
   * sobre lo que ya está en el depósito.
   */
  it('rechaza con INSUMO_DESHABILITADO si el insumo está deshabilitado', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(insumoDeshabilitado()),
      movimientoRepo,
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_DESHABILITADO');
    expect(movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * Orden de las dos reglas: la baja lógica gana. Un insumo dado de baja Y
   * deshabilitado no existe para el catálogo, y decirle "habilítelo" a quien
   * carga lo mandaría a arreglar un estado que no alcanza — el insumo seguiría
   * sin aparecer.
   */
  it('rechaza como inexistente, y no como deshabilitado, al insumo dado de baja y además deshabilitado', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(insumoDadoDeBaja(false)),
      buildMovimientoRepo(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
  });

  // ─── Precondición de la cantidad ─────────────────────────────────────────

  /**
   * La cantidad fuera de rango o de escala es una violación de contrato del
   * caller, no una desviación de negocio: la entidad la tira como `throw` y el
   * caso de uso NO la convierte en `Result` — el borde ya la rechaza con un
   * 400 que nombra el campo. Lo que sí importa es que no quede nada asentado.
   */
  it('propaga la violación de precondición de la cantidad sin asentar el movimiento', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(buildInsumoRepo(), movimientoRepo);

    await expect(useCase.execute({ ...dtoBase, cantidad: 0 })).rejects.toThrow(/cantidad/);
    expect(movimientoRepo.insert).not.toHaveBeenCalled();
  });
});
