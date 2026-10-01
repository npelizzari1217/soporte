import { describe, expect, it, vi } from 'vitest';
import { Result } from '../../../shared/domain/result';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { FalloOperacionDeUnidad } from '../../domain/errors/fallo-operacion-de-unidad';
import { SerialDuplicadoError } from '../../domain/errors/unidades-insumo.errors';
import { RegistrarEntradaInsumoUseCase } from './registrar-entrada-insumo.use-case';
import type { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { SumasPorCondicionYTipo } from '../../domain/entities/tipo-movimiento-insumo';
import { familiaRepoFake } from '../../testing/familia-repo-fake';
import { sumasCon } from '../../testing/sumas-movimiento';
import { txRunnerFake } from '../../testing/tx-runner-fake';

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

  function buildInsumoRepo(
    insumo: InsumoEntity | null = insumoVigente(),
    seguimiento: SeguimientoInsumo = 'NINGUNO',
  ) {
    return {
      findById: vi.fn().mockResolvedValue(insumo),
      leerSeguimientoParaMovimiento: vi.fn().mockResolvedValue(insumo ? seguimiento : null),
    };
  }

  function buildOperaciones() {
    return { ingresar: vi.fn(), devolverAlDeposito: vi.fn() };
  }

  /**
   * Bitácora CARGADA a propósito: el insumo del fixture ya tiene movimientos
   * de los cuatro tipos. Es lo que hace que el assert de ausencia de
   * `lockAndSumByTipo` signifique algo — si la entrada lo llamara, el mock le
   * respondería un desglose real y el caso de uso seguiría de largo, así que
   * lo único que puede mantener ese assert en verde es que genuinamente no se
   * invoque.
   */
  const SUMAS_CARGADAS: SumasPorCondicionYTipo = sumasCon({
    NUEVO: { ENTRADA: 40, SALIDA: 12, AJUSTE_POSITIVO: 1, AJUSTE_NEGATIVO: 3 },
  });

  /**
   * `insert` resuelve con el MISMO asiento que recibió — no `undefined` — a
   * propósito, issue #159: el puerto real devuelve el asiento reconstituido
   * con el `createdAt` de la base, y el caso de uso tiene que reenviar ESE
   * valor de retorno, no el que él mismo construyó. Un mock que resolviera
   * `undefined` dejaría pasar una regresión a "el caso de uso ignora lo que
   * `insert()` devuelve" sin que ningún test lo note.
   */
  function buildMovimientoRepo() {
    return {
      insert: vi.fn().mockImplementation(async (movimiento) => movimiento),
      lockAndSumByTipo: vi.fn().mockResolvedValue(SUMAS_CARGADAS),
    };
  }

  const dtoBase = { insumoId: 'ins-1', cantidad: 10, usuarioId: 'usr-7' };

  // ─── Camino feliz: el hermano invertido de todos los rechazos de abajo ────

  it('asienta la entrada cuando el insumo está vigente y habilitado', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

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
   * Issue #159 — el caso de uso tiene que devolver lo que `insert()`
   * RESUELVE, no el asiento que construyó antes de llamarlo. `insert()` puede
   * devolver un asiento con un `createdAt` distinto —el que le puso la
   * base—, y este test lo hace explícito con un mock que resuelve un objeto
   * DIFERENTE del que recibió: si el caso de uso devolviera su variable local
   * `movimiento` en lugar del resultado de `insert()`, este assert lo
   * detecta. Sin un mock que resuelva algo distinto, el caso pasaría igual
   * con la implementación vieja y no probaría nada.
   */
  it('devuelve el asiento que resuelve insert(), no el que construyó antes de llamarlo', async () => {
    const asentadoPorLaBase = { esElAsientoQueDevuelveLaBase: true };
    const movimientoRepo = {
      insert: vi.fn().mockResolvedValue(asentadoPorLaBase),
      lockAndSumByTipo: vi.fn().mockResolvedValue(SUMAS_CARGADAS),
    };
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(asentadoPorLaBase);
  });

  /**
   * El `usuarioId` lo pone el borde desde el usuario autenticado y el caso de
   * uso lo copia tal cual: no lo deriva del insumo ni lo inventa. Si se
   * perdiera, la bitácora quedaría sin responder "quién lo movió", que es la
   * mitad de lo que la Entrega 2 existe para contestar.
   */
  it('asienta el usuarioId que recibe, sin derivarlo de ningún otro dato', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      buildMovimientoRepo(),
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute({ ...dtoBase, usuarioId: 'usr-99' });

    expect(result.getValue().usuarioId).toBe('usr-99');
  });

  it('deja el motivo y la trazabilidad en null cuando la entrada no los trae', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      buildMovimientoRepo(),
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

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
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      buildMovimientoRepo(),
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

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
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      buildMovimientoRepo(),
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute({ ...dtoBase, motivo: '   ' });

    expect(result.getValue().motivo).toBeNull();
  });

  // ─── El origen: de qué ítem de compra vino la entrada ─────────────────────

  /**
   * El `itemCompraId` es la respuesta a "¿de qué compra vino esto que entró?".
   * Se assertea sobre lo que se le PASA al repositorio y no solo sobre el valor
   * devuelto: lo que la bitácora conserva es lo que se persiste, y un caso de
   * uso que armara bien la entidad y asentara otra cosa pasaría el assert del
   * retorno igual.
   */
  it('asienta el origen del ítem de compra que generó la entrada', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute({ ...dtoBase, itemCompraId: 'item-77' });

    expect(result.getValue().itemCompraId).toBe('item-77');
    expect(movimientoRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ itemCompraId: 'item-77' }),
    );
  });

  /**
   * Hermano invertido: la entrada manual no tiene origen de compra, y ese
   * `null` es lo que la distingue de una recepción — tanto en la bitácora como
   * en la regla del insumo deshabilitado de más abajo.
   */
  it('deja el origen en null cuando la entrada no viene de una compra', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      buildMovimientoRepo(),
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getValue().itemCompraId).toBeNull();
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
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    await useCase.execute(dtoBase);

    expect(movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
  });

  // ─── Elegibilidad del insumo ─────────────────────────────────────────────

  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo no existe en el catálogo', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(null),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

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
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
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
   *
   * **Este es el hermano invertido del salteo por recepción**: mismo insumo
   * deshabilitado, misma cantidad, y la única diferencia es que esta entrada no
   * trae origen de compra. La carga manual sigue rechazando.
   */
  it('rechaza con INSUMO_DESHABILITADO si el insumo está deshabilitado', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(insumoDeshabilitado()),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_DESHABILITADO');
    expect(movimientoRepo.insert).not.toHaveBeenCalled();
  });

  // ─── El insumo deshabilitado: la recepción pasa, la carga manual no ───────

  /**
   * Decisión 1 del diseño de la Entrega 3. El guard de `activo` nació para la
   * entrada MANUAL, y su regla es "deshabilitar significa que no se compra más
   * de esto". Una recepción NO es una decisión nueva de compra: se aprobó antes
   * de la baja, la mercadería ya está en el depósito, y el stock tiene que
   * reflejar lo que hay. Rechazarla dejaría una recepción registrada en compras
   * sin su movimiento de stock, que es la peor de las alternativas.
   *
   * **El permiso sale del ORIGEN, no de un pedido del caller.** No hay un
   * segundo campo del estilo `exigirHabilitado: false` en el DTO: un booleano
   * de "saltear la validación" es una llave sin dueño —cualquiera la pide, y no
   * queda dicho por qué—, mientras que el `itemCompraId` es un hecho que la FK
   * verifica y que además hay que persistir igual.
   *
   * Su hermano invertido es el caso siguiente, que es el que le da sentido: sin
   * origen, el mismo insumo deshabilitado sigue rechazando.
   */
  it('asienta la entrada sobre un insumo deshabilitado cuando viene de una recepción de compra', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(insumoDeshabilitado()),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute({ ...dtoBase, itemCompraId: 'item-77' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().itemCompraId).toBe('item-77');
    expect(movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  /**
   * Un `itemCompraId` EXPLÍCITAMENTE nulo no es un origen: es la entrada
   * manual escrita de la forma larga. Sin este caso, un guard escrito como
   * `'itemCompraId' in dto` pasaría en verde y le abriría el salteo a cualquier
   * caller que mandara el campo en `null`.
   */
  it('rechaza con INSUMO_DESHABILITADO la entrada con origen explícitamente nulo', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(insumoDeshabilitado()),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute({ ...dtoBase, itemCompraId: null });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_DESHABILITADO');
    expect(movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * El origen levanta UN solo guard, el de `activo`, y no la elegibilidad
   * entera. Un insumo dado de baja no está en el catálogo: asentar contra él
   * dejaría stock imputado a una fila que ninguna pantalla muestra, y el ítem
   * de compra no cambia ese hecho. Sin este caso, un guard escrito como "si
   * viene de una compra, no valides nada" pasaría en verde.
   */
  it('rechaza con INSUMO_NO_ENCONTRADO la recepción sobre un insumo dado de baja', async () => {
    const movimientoRepo = buildMovimientoRepo();
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(insumoDadoDeBaja()),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    const result = await useCase.execute({ ...dtoBase, itemCompraId: 'item-77' });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
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
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
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
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      movimientoRepo,
      familiaRepoFake(),
      txRunnerFake(),
      buildOperaciones(),
    );

    await expect(useCase.execute({ ...dtoBase, cantidad: 0 })).rejects.toThrow(/cantidad/);
    expect(movimientoRepo.insert).not.toHaveBeenCalled();
  });

  // ─── Condición del saldo (stock-usado-componentes) ───────────────────────

  describe('condición NUEVO / USADO', () => {
    it('sin condición asienta NUEVO y no consulta la familia', async () => {
      const familiaRepo = familiaRepoFake({ esRepuesto: false });
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(),
        buildMovimientoRepo(),
        familiaRepo,
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.execute(dtoBase);

      expect(result.getValue().condicion).toBe('NUEVO');
      expect(familiaRepo.findById).not.toHaveBeenCalled();
    });

    it('asienta una entrada manual USADO sobre un repuesto', async () => {
      const movimientoRepo = buildMovimientoRepo();
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(),
        movimientoRepo,
        familiaRepoFake(),
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.execute({ ...dtoBase, condicion: 'USADO' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().condicion).toBe('USADO');
      expect(movimientoRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('rechaza USADO sobre un insumo que no es repuesto', async () => {
      const movimientoRepo = buildMovimientoRepo();
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(),
        movimientoRepo,
        familiaRepoFake({ esRepuesto: false }),
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.execute({ ...dtoBase, condicion: 'USADO' });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
      expect(movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('la entrada manual USADO sobre un insumo deshabilitado sigue rechazada', async () => {
      const movimientoRepo = buildMovimientoRepo();
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(insumoDeshabilitado()),
        movimientoRepo,
        familiaRepoFake(),
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.execute({ ...dtoBase, condicion: 'USADO' });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('INSUMO_DESHABILITADO');
      expect(movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('rechaza USADO manual cuando la familia tiene baja lógica o está deshabilitada', async () => {
      for (const familia of [{ dadaDeBaja: true }, { activo: false }, { inexistente: true }]) {
        const movimientoRepo = buildMovimientoRepo();
        const useCase = new RegistrarEntradaInsumoUseCase(
          buildInsumoRepo(),
          movimientoRepo,
          familiaRepoFake(familia),
          txRunnerFake(),
          buildOperaciones(),
        );

        const result = await useCase.execute({ ...dtoBase, condicion: 'USADO' });

        expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
        expect(movimientoRepo.insert).not.toHaveBeenCalled();
      }
    });
  });

  // ─── Devolución de un componente al stock ────────────────────────────────

  describe('registrarDevolucionDeComponente()', () => {
    const dtoDevolucion = {
      insumoId: 'ins-1',
      equipoId: 'eq-1',
      usuarioId: 'usr-7',
      motivo: 'Pieza sana',
    };

    it('asienta una ENTRADA USADO de una unidad vinculada al equipo, con el motivo', async () => {
      const movimientoRepo = buildMovimientoRepo();
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(),
        movimientoRepo,
        familiaRepoFake(),
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.registrarDevolucionDeComponente(dtoDevolucion);

      expect(result.isOk()).toBe(true);
      const movimiento = result.getValue();
      expect(movimiento.tipo).toBe('ENTRADA');
      expect(movimiento.condicion).toBe('USADO');
      expect(movimiento.cantidad).toBe(1);
      expect(movimiento.equipoId).toBe('eq-1');
      expect(movimiento.usuarioId).toBe('usr-7');
      expect(movimiento.motivo).toBe('Pieza sana');
      expect(movimiento.itemCompraId).toBeNull();
    });

    it('admite un insumo deshabilitado, a diferencia de la entrada manual', async () => {
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(insumoDeshabilitado()),
        buildMovimientoRepo(),
        familiaRepoFake(),
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.registrarDevolucionDeComponente(dtoDevolucion);

      expect(result.isOk()).toBe(true);
    });

    it('admite una familia dada de baja o deshabilitada: la pieza existe físicamente', async () => {
      for (const familia of [{ dadaDeBaja: true }, { activo: false }]) {
        const useCase = new RegistrarEntradaInsumoUseCase(
          buildInsumoRepo(insumoDeshabilitado()),
          buildMovimientoRepo(),
          familiaRepoFake(familia),
          txRunnerFake(),
          buildOperaciones(),
        );

        const result = await useCase.registrarDevolucionDeComponente(dtoDevolucion);

        expect(result.isOk()).toBe(true);
      }
    });

    it('rechaza una familia que no es de repuestos', async () => {
      const movimientoRepo = buildMovimientoRepo();
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(),
        movimientoRepo,
        familiaRepoFake({ esRepuesto: false, dadaDeBaja: true }),
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.registrarDevolucionDeComponente(dtoDevolucion);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
      expect(movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('rechaza una familia inexistente', async () => {
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(),
        buildMovimientoRepo(),
        familiaRepoFake({ inexistente: true }),
        txRunnerFake(),
        buildOperaciones(),
      );

      const result = await useCase.registrarDevolucionDeComponente(dtoDevolucion);

      expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
    });

    it('rechaza un insumo inexistente o con baja lógica', async () => {
      for (const insumo of [null, insumoDadoDeBaja()]) {
        const movimientoRepo = buildMovimientoRepo();
        const useCase = new RegistrarEntradaInsumoUseCase(
          buildInsumoRepo(insumo),
          movimientoRepo,
          familiaRepoFake(),
          txRunnerFake(),
          buildOperaciones(),
        );

        const result = await useCase.registrarDevolucionDeComponente(dtoDevolucion);

        expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
        expect(movimientoRepo.insert).not.toHaveBeenCalled();
      }
    });
  });

  // ─── Seguimiento por serie (ADR-5, ADR-6, ADR-7) ─────────────────────────

  describe('seguimiento por serie', () => {
    function movimientoDeUnidad(): MovimientoInsumoEntity {
      return MovimientoInsumoEntity.create({
        insumoId: 'ins-1',
        tipo: 'ENTRADA',
        condicion: 'NUEVO',
        cantidad: 1,
        usuarioId: 'usr-7',
      }).getValue();
    }

    function armar(seguimiento: SeguimientoInsumo) {
      const insumoRepo = buildInsumoRepo(insumoVigente(), seguimiento);
      const movimientoRepo = buildMovimientoRepo();
      const operaciones = buildOperaciones();
      const txRunner = txRunnerFake();
      const useCase = new RegistrarEntradaInsumoUseCase(
        insumoRepo,
        movimientoRepo,
        familiaRepoFake(),
        txRunner,
        operaciones,
      );
      return { useCase, insumoRepo, movimientoRepo, operaciones, txRunner };
    }

    it('NINGUNO abre la transaccion, lee L1 y asienta como siempre, sin ingresar unidades ni tomar L2', async () => {
      const c = armar('NINGUNO');

      const result = await c.useCase.execute(dtoBase);

      expect(result.isOk()).toBe(true);
      expect(c.txRunner.abiertas).toBe(1);
      expect(c.insumoRepo.leerSeguimientoParaMovimiento).toHaveBeenCalledWith('ins-1');
      expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
      expect(c.movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
      expect(c.operaciones.ingresar).not.toHaveBeenCalled();
    });

    it('NINGUNO con seriales: UnidadNoAdmitidaError, sin asentar', async () => {
      const c = armar('NINGUNO');

      const result = await c.useCase.execute({ ...dtoBase, seriales: ['SN-1'] });

      expect(result.getError().code).toBe('UNIDAD_NO_ADMITIDA');
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('insumo inexistente: lo dice la lectura de L1 y no se asienta nada', async () => {
      const c = armar('NINGUNO');
      c.insumoRepo.leerSeguimientoParaMovimiento.mockResolvedValue(null);

      const result = await c.useCase.execute(dtoBase);

      expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('SERIE con tantos seriales como la cantidad: ingresa una pieza por serial', async () => {
      const c = armar('SERIE');
      c.operaciones.ingresar.mockResolvedValue(
        Result.ok([
          { unidad: {}, movimiento: movimientoDeUnidad() },
          { unidad: {}, movimiento: movimientoDeUnidad() },
        ]),
      );

      const result = await c.useCase.execute({
        ...dtoBase,
        cantidad: 2,
        seriales: ['SN-1', 'SN-2'],
      });

      expect(result.isOk()).toBe(true);
      expect(c.operaciones.ingresar).toHaveBeenCalledWith(
        'ins-1',
        [{ numeroSerie: 'SN-1' }, { numeroSerie: 'SN-2' }],
        expect.objectContaining({ tipo: 'ENTRADA', condicion: 'NUEVO' }),
      );
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('executeTodos devuelve TODOS los movimientos de la entrada SERIE y execute solo el primero', async () => {
      const c = armar('SERIE');
      const primero = movimientoDeUnidad();
      const segundo = movimientoDeUnidad();
      c.operaciones.ingresar.mockResolvedValue(
        Result.ok([
          { unidad: {}, movimiento: primero },
          { unidad: {}, movimiento: segundo },
        ]),
      );
      const dto = { ...dtoBase, cantidad: 2, seriales: ['SN-1', 'SN-2'] };

      const todos = await c.useCase.executeTodos(dto);
      const uno = await c.useCase.execute(dto);

      expect(todos.getValue()).toEqual([primero, segundo]);
      expect(uno.getValue()).toBe(primero);
    });

    it.each([
      ['sin seriales', undefined],
      ['con menos seriales que la cantidad', ['SN-1']],
      ['con mas seriales que la cantidad', ['SN-1', 'SN-2', 'SN-3']],
    ])('SERIE %s: SerialesNoCoincidenError sin ingresar', async (_caso, seriales) => {
      const c = armar('SERIE');

      const result = await c.useCase.execute({ ...dtoBase, cantidad: 2, seriales });

      expect(result.getError().code).toBe('SERIALES_NO_COINCIDEN');
      expect(c.operaciones.ingresar).not.toHaveBeenCalled();
    });

    it('SERIE con cantidad fraccional: CantidadNoEnteraError', async () => {
      const c = armar('SERIE');

      const result = await c.useCase.execute({ ...dtoBase, cantidad: 1.5, seriales: ['SN-1'] });

      expect(result.getError().code).toBe('CANTIDAD_NO_ENTERA');
      expect(c.operaciones.ingresar).not.toHaveBeenCalled();
    });

    it('SERIE con un serial repetido: el servicio lo rechaza y se devuelve su error', async () => {
      const c = armar('SERIE');
      c.operaciones.ingresar.mockResolvedValue(Result.fail(new SerialDuplicadoError('SN-1')));

      const result = await c.useCase.execute({
        ...dtoBase,
        cantidad: 2,
        seriales: ['SN-1', 'SN-1'],
      });

      expect(result.getError().code).toBe('SERIAL_DUPLICADO');
    });

    it('SERIE con serial repetido en la base (P2002): se desenvuelve como Result.fail', async () => {
      const c = armar('SERIE');
      c.operaciones.ingresar.mockRejectedValue(
        new FalloOperacionDeUnidad(new SerialDuplicadoError('SN-1')),
      );

      const result = await c.useCase.execute({ ...dtoBase, cantidad: 1, seriales: ['SN-1'] });

      expect(result.getError().code).toBe('SERIAL_DUPLICADO');
    });

    it('completarConPendientes rellena con unidades pendientes hasta la cantidad', async () => {
      const c = armar('SERIE');
      c.operaciones.ingresar.mockResolvedValue(
        Result.ok([{ unidad: {}, movimiento: movimientoDeUnidad() }]),
      );

      const result = await c.useCase.execute({
        ...dtoBase,
        cantidad: 3,
        seriales: ['SN-1'],
        completarConPendientes: true,
        itemCompraId: 'item-1',
      });

      expect(result.isOk()).toBe(true);
      expect(c.operaciones.ingresar).toHaveBeenCalledWith(
        'ins-1',
        [{ numeroSerie: 'SN-1' }, { numeroSerie: null }, { numeroSerie: null }],
        expect.objectContaining({ itemCompraId: 'item-1' }),
      );
    });

    it('completarConPendientes con mas seriales que la cantidad sigue rechazando', async () => {
      const c = armar('SERIE');

      const result = await c.useCase.execute({
        ...dtoBase,
        cantidad: 1,
        seriales: ['SN-1', 'SN-2'],
        completarConPendientes: true,
      });

      expect(result.getError().code).toBe('SERIALES_NO_COINCIDEN');
    });

    it('la entrada MANUAL de un insumo SERIE deshabilitado sigue rechazada (G2 no la alcanza)', async () => {
      const insumoRepo = buildInsumoRepo(insumoDeshabilitado(), 'SERIE');
      const operaciones = buildOperaciones();
      const useCase = new RegistrarEntradaInsumoUseCase(
        insumoRepo,
        buildMovimientoRepo(),
        familiaRepoFake(),
        txRunnerFake(),
        operaciones,
      );

      const result = await useCase.execute({ ...dtoBase, cantidad: 1, seriales: ['SN-1'] });

      expect(result.getError().code).toBe('INSUMO_DESHABILITADO');
      expect(operaciones.ingresar).not.toHaveBeenCalled();
    });
  });

  describe('registrarDevolucionDeComponente con seguimiento', () => {
    const devolucion = {
      insumoId: 'ins-1',
      equipoId: 'eq-1',
      usuarioId: 'usr-7',
      motivo: 'retiro',
    };

    function armar(seguimiento: SeguimientoInsumo, insumo = insumoVigente()) {
      const movimientoRepo = buildMovimientoRepo();
      const operaciones = buildOperaciones();
      const useCase = new RegistrarEntradaInsumoUseCase(
        buildInsumoRepo(insumo, seguimiento),
        movimientoRepo,
        familiaRepoFake({ esRepuesto: true }),
        txRunnerFake(),
        operaciones,
      );
      return { useCase, movimientoRepo, operaciones };
    }

    function movimientoUsado(): MovimientoInsumoEntity {
      return MovimientoInsumoEntity.create({
        insumoId: 'ins-1',
        tipo: 'ENTRADA',
        condicion: 'USADO',
        cantidad: 1,
        usuarioId: 'usr-7',
        equipoId: 'eq-1',
      }).getValue();
    }

    it('componente con unidad: devolverAlDeposito con su componente, sin asentar otra entrada', async () => {
      const c = armar('SERIE');
      const movimiento = movimientoUsado();
      c.operaciones.devolverAlDeposito.mockResolvedValue(Result.ok([{ unidad: {}, movimiento }]));

      const result = await c.useCase.registrarDevolucionDeComponente({
        ...devolucion,
        unidadId: 'uni-1',
        componenteId: 'comp-1',
      });

      expect(result.getValue()).toBe(movimiento);
      expect(c.operaciones.devolverAlDeposito).toHaveBeenCalledWith(
        [{ unidadId: 'uni-1', equipoId: 'eq-1', componenteId: 'comp-1', insumoId: 'ins-1' }],
        { usuarioId: 'usr-7', motivo: 'retiro' },
      );
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('componente legado de un insumo SERIE con serial: ingresa una unidad USADO con el equipo', async () => {
      const c = armar('SERIE');
      const movimiento = movimientoUsado();
      c.operaciones.ingresar.mockResolvedValue(Result.ok([{ unidad: {}, movimiento }]));

      const result = await c.useCase.registrarDevolucionDeComponente({
        ...devolucion,
        numeroSerie: 'SN-9',
      });

      expect(result.getValue()).toBe(movimiento);
      expect(c.operaciones.ingresar).toHaveBeenCalledWith(
        'ins-1',
        [{ numeroSerie: 'SN-9' }],
        expect.objectContaining({ condicion: 'USADO', tipo: 'ENTRADA', equipoId: 'eq-1' }),
      );
    });

    it.each([
      ['ausente', undefined],
      ['vacio', '   '],
    ])(
      'componente legado de un insumo SERIE con serial %s: SerialRequeridoError y no cambia nada',
      async (_caso, numeroSerie) => {
        const c = armar('SERIE');

        const result = await c.useCase.registrarDevolucionDeComponente({
          ...devolucion,
          numeroSerie,
        });

        expect(result.getError().code).toBe('SERIAL_REQUERIDO');
        expect(c.operaciones.ingresar).not.toHaveBeenCalled();
        expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
      },
    );

    it('insumo NINGUNO: como siempre, una ENTRADA USADO del equipo', async () => {
      const c = armar('NINGUNO');

      const result = await c.useCase.registrarDevolucionDeComponente(devolucion);

      expect(result.getValue().condicion).toBe('USADO');
      expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
      expect(c.operaciones.ingresar).not.toHaveBeenCalled();
    });

    it('G2: un insumo DESHABILITADO se admite en la devolucion con unidad', async () => {
      const c = armar('SERIE', insumoDeshabilitado());
      c.operaciones.devolverAlDeposito.mockResolvedValue(
        Result.ok([{ unidad: {}, movimiento: movimientoUsado() }]),
      );

      const result = await c.useCase.registrarDevolucionDeComponente({
        ...devolucion,
        unidadId: 'uni-1',
        componenteId: 'comp-1',
      });

      expect(result.isOk()).toBe(true);
    });

    it('un serial repetido en la base (P2002) se devuelve como Result.fail', async () => {
      const c = armar('SERIE');
      c.operaciones.ingresar.mockRejectedValue(
        new FalloOperacionDeUnidad(new SerialDuplicadoError('SN-9')),
      );

      const result = await c.useCase.registrarDevolucionDeComponente({
        ...devolucion,
        numeroSerie: 'SN-9',
      });

      expect(result.getError().code).toBe('SERIAL_DUPLICADO');
    });
  });
});
