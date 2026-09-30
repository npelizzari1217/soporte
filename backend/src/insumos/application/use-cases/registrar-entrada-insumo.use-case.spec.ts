import { describe, expect, it, vi } from 'vitest';
import { RegistrarEntradaInsumoUseCase } from './registrar-entrada-insumo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { SumasPorCondicionYTipo } from '../../domain/entities/tipo-movimiento-insumo';
import { familiaRepoFake } from '../../testing/familia-repo-fake';
import { sumasCon } from '../../testing/sumas-movimiento';

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
    );

    const result = await useCase.execute({ ...dtoBase, usuarioId: 'usr-99' });

    expect(result.getValue().usuarioId).toBe('usr-99');
  });

  it('deja el motivo y la trazabilidad en null cuando la entrada no los trae', async () => {
    const useCase = new RegistrarEntradaInsumoUseCase(
      buildInsumoRepo(),
      buildMovimientoRepo(),
      familiaRepoFake(),
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
        );

        const result = await useCase.registrarDevolucionDeComponente(dtoDevolucion);

        expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
        expect(movimientoRepo.insert).not.toHaveBeenCalled();
      }
    });
  });
});
