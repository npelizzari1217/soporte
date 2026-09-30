import { describe, expect, it, vi } from 'vitest';
import { RegistrarAjusteInsumoUseCase } from './registrar-ajuste-insumo.use-case';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import {
  TipoAjusteInsumo,
  TipoMovimientoInsumo,
  TIPOS_AJUSTE_INSUMO,
} from '../../domain/entities/tipo-movimiento-insumo';
import { SumasPorCondicionYTipo } from '../../domain/entities/tipo-movimiento-insumo';
import { EstadoFamiliaFake, familiaRepoFake } from '../../testing/familia-repo-fake';
import { sumasCon } from '../../testing/sumas-movimiento';

describe('RegistrarAjusteInsumoUseCase', () => {
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
   * La baja lógica no tiene mutador en `InsumoEntity`, así que la única forma
   * de construir el caso es rehidratando una fila con fecha de baja — que es
   * exactamente lo que devuelve `findById()`, que no filtra por `deletedAt`.
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

  function sumas(parcial: Partial<Record<TipoMovimientoInsumo, number>>): SumasPorCondicionYTipo {
    return sumasCon({ NUEVO: parcial });
  }

  /**
   * Colaboradores completamente funcionales, no inertes: el runner EJECUTA su
   * callback y los dos métodos del repositorio responden de verdad. Es lo que
   * hace que los asserts de ausencia signifiquen algo — si el caso de uso
   * llamara a `insert` en un camino de rechazo, el mock respondería y el flujo
   * seguiría, así que lo único que puede mantener esos asserts en verde es que
   * genuinamente no se invoquen.
   *
   * `llamadasFueraDeTransaccion` es el guard del contrato del lock: el
   * repositorio real LANZA si `lockAndSumByTipo` corre sin transacción activa,
   * y acá se reproduce esa condición sin base — cada llamada al repositorio
   * anota si ocurrió con la transacción abierta o no. Mismo aparato que el
   * spec de la SALIDA, porque el contrato que verifica es el mismo.
   */
  function buildColaboradores(
    opciones: {
      insumo?: InsumoEntity | null;
      sumas?: SumasPorCondicionYTipo;
      familia?: EstadoFamiliaFake;
    } = {},
  ) {
    const insumo = opciones.insumo === undefined ? insumoVigente() : opciones.insumo;
    const desglose = opciones.sumas ?? sumas({ ENTRADA: 100 });

    const estado = { dentroDeTransaccion: false };
    const llamadasFueraDeTransaccion: string[] = [];

    function anotarSiEstaFuera(metodo: string): void {
      if (!estado.dentroDeTransaccion) llamadasFueraDeTransaccion.push(metodo);
    }

    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };

    const movimientoRepo = {
      // Resuelve con el MISMO asiento que recibió, a propósito — issue #159:
      // el puerto real devuelve el asiento reconstituido con el `createdAt`
      // de la base, y el caso de uso tiene que reenviar ESE valor de retorno.
      insert: vi.fn(async (movimiento) => {
        anotarSiEstaFuera('insert');
        return movimiento;
      }),
      lockAndSumByTipo: vi.fn(async () => {
        anotarSiEstaFuera('lockAndSumByTipo');
        return desglose;
      }),
    };

    // El runner falso va escrito a mano y no con `vi.fn`: `Mock<...>` instancia
    // el genérico de `ITenantTransactionRunner.run` en `unknown`, así que el
    // espía no encaja en el `Pick` del constructor y la única salida sería un
    // cast — que apagaría justamente el chequeo de que el colaborador cumple
    // el contrato que dice cumplir. El contador reemplaza a
    // `toHaveBeenCalledTimes` sin perder nada: cuenta lo mismo.
    const transacciones = { abiertas: 0 };
    const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        transacciones.abiertas += 1;
        estado.dentroDeTransaccion = true;
        try {
          return await fn();
        } finally {
          estado.dentroDeTransaccion = false;
        }
      },
    };

    const familiaRepo = familiaRepoFake(opciones.familia);
    const useCase = new RegistrarAjusteInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      txRunner,
      familiaRepo,
    );

    return {
      useCase,
      insumoRepo,
      movimientoRepo,
      familiaRepo,
      transacciones,
      llamadasFueraDeTransaccion,
    };
  }

  /**
   * El motivo va en el DTO base porque los DOS ajustes lo exigen: un caso de
   * prueba que lo omitiera sin querer estaría midiendo el guard del motivo en
   * lugar de lo que dice medir.
   */
  function dtoDe(tipo: TipoAjusteInsumo) {
    return {
      insumoId: 'ins-1',
      tipo,
      cantidad: 3,
      usuarioId: 'usr-7',
      motivo: 'Conteo físico del 06/09',
    };
  }

  // ─── Camino feliz, en las dos direcciones ────────────────────────────────

  it('asienta el AJUSTE_POSITIVO cuando el insumo es elegible', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute(dtoDe('AJUSTE_POSITIVO'));

    expect(result.isOk()).toBe(true);
    const movimiento = result.getValue();
    expect(movimiento.tipo).toBe('AJUSTE_POSITIVO');
    expect(movimiento.insumoId).toBe('ins-1');
    expect(movimiento.cantidad).toBe(3);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
    expect(c.movimientoRepo.insert).toHaveBeenCalledWith(movimiento);
  });

  it('asienta el AJUSTE_NEGATIVO cuando el insumo es elegible y hay con qué', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute(dtoDe('AJUSTE_NEGATIVO'));

    expect(result.isOk()).toBe(true);
    const movimiento = result.getValue();
    expect(movimiento.tipo).toBe('AJUSTE_NEGATIVO');
    expect(movimiento.cantidad).toBe(3);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
    expect(c.movimientoRepo.insert).toHaveBeenCalledWith(movimiento);
  });

  /**
   * Issue #159 — el caso de uso tiene que devolver lo que `insert()`
   * RESUELVE, no el asiento que construyó antes de entrar a la transacción.
   * El mock resuelve un objeto DIFERENTE del que recibió a propósito: si el
   * caso de uso devolviera su variable local `asiento` en lugar del resultado
   * de `insert()`, este assert lo detecta; con el mock genérico de
   * `buildColaboradores()` —que resuelve el mismo objeto que recibe— este
   * caso pasaría igual con la implementación vieja y no probaría nada.
   */
  it('devuelve el asiento que resuelve insert(), no el que construyó antes de llamarlo', async () => {
    const asentadoPorLaBase = { esElAsientoQueDevuelveLaBase: true };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumoVigente()) };
    const movimientoRepo = {
      insert: vi.fn().mockResolvedValue(asentadoPorLaBase),
      lockAndSumByTipo: vi.fn().mockResolvedValue(sumas({ ENTRADA: 100 })),
    };
    const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    };
    const useCase = new RegistrarAjusteInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      txRunner,
      familiaRepoFake(),
    );

    const result = await useCase.execute(dtoDe('AJUSTE_POSITIVO'));

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(asentadoPorLaBase);
  });

  it('asienta el usuarioId que recibe, sin derivarlo de ningún otro dato', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_POSITIVO'), usuarioId: 'usr-99' });

    expect(result.getValue().usuarioId).toBe('usr-99');
  });

  it('conserva el motivo recortado y la trazabilidad de equipo y sector', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute({
      ...dtoDe('AJUSTE_NEGATIVO'),
      motivo: '  Conteo físico: faltaban 3 unidades  ',
      equipoId: 'eq-3',
      sectorId: 'sec-2',
    });

    expect(result.getValue().motivo).toBe('Conteo físico: faltaban 3 unidades');
    expect(result.getValue().equipoId).toBe('eq-3');
    expect(result.getValue().sectorId).toBe('sec-2');
  });

  // ─── El motivo obligatorio, derivado del catálogo de ajustes ─────────────

  /**
   * Los casos se derivan de `TIPOS_AJUSTE_INSUMO` y no se enumeran a mano: si
   * entrara una tercera dirección, esta batería la cubre sola. Enumerarlos acá
   * sería el lugar exacto donde el catálogo y sus reglas se desincronizan.
   *
   * La regla vive en `MovimientoInsumoEntity.create()` y el caso de uso solo
   * propaga su `Result`; estos casos verifican esa propagación, no una copia
   * de la regla.
   */
  describe.each([...TIPOS_AJUSTE_INSUMO])('motivo obligatorio en %s', (tipo) => {
    it('rechaza con MOTIVO_AJUSTE_REQUERIDO el ajuste sin motivo', async () => {
      const c = buildColaboradores();
      const { motivo: _motivo, ...sinMotivo } = dtoDe(tipo);

      const result = await c.useCase.execute(sinMotivo);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('MOTIVO_AJUSTE_REQUERIDO');
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('rechaza con MOTIVO_AJUSTE_REQUERIDO el motivo que solo tiene espacios', async () => {
      const c = buildColaboradores();

      const result = await c.useCase.execute({ ...dtoDe(tipo), motivo: '   \t  ' });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('MOTIVO_AJUSTE_REQUERIDO');
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('rechaza con MOTIVO_AJUSTE_REQUERIDO el motivo explícitamente nulo', async () => {
      const c = buildColaboradores();

      const result = await c.useCase.execute({ ...dtoDe(tipo), motivo: null });

      expect(result.getError().code).toBe('MOTIVO_AJUSTE_REQUERIDO');
    });

    /**
     * El hermano invertido de los tres de arriba: con UN carácter de contenido
     * el mismo ajuste entra. Sin este caso, los rechazos pasarían igual si el
     * caso de uso rechazara todo ajuste.
     */
    it('acepta el mismo ajuste en cuanto el motivo tiene contenido', async () => {
      const c = buildColaboradores();

      const result = await c.useCase.execute({ ...dtoDe(tipo), motivo: '  x  ' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().motivo).toBe('x');
      expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
    });

    /**
     * El motivo no depende del stock, así que se evalúa ANTES de la sección
     * crítica: abrir la transacción y tomar el lock para un asiento que ni
     * siquiera puede construirse haría esperar al resto de los escritores del
     * insumo por nada.
     */
    it('no abre la transacción cuando falta el motivo', async () => {
      const c = buildColaboradores();

      await c.useCase.execute({ ...dtoDe(tipo), motivo: '  ' });

      expect(c.transacciones.abiertas).toBe(0);
      expect(c.movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
    });
  });

  // ─── El límite exacto del stock, solo para la dirección que RESTA ────────

  /**
   * El límite exacto, que es donde se rompen el `<` y el `<=`. Un ajuste que
   * deja el depósito en cero es legítimo: el conteo físico puede decir que no
   * quedó nada.
   */
  it('permite el AJUSTE_NEGATIVO que deja el stock EXACTAMENTE en cero', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 10 });

    expect(result.isOk()).toBe(true);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('rechaza con STOCK_INSUFICIENTE el AJUSTE_NEGATIVO que dejaría el stock en −1', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 11 });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  it('nombra en el error la cantidad pedida y la disponible', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 11 });

    expect(result.getError().message).toContain('11');
    expect(result.getError().message).toContain('10');
  });

  /**
   * El hermano invertido del guard: el AJUSTE_POSITIVO SUMA, así que nunca
   * puede dejar el saldo por debajo de donde estaba y no se mide contra el
   * stock disponible. Sin este caso, aplicar el guard a las dos direcciones
   * pasaría desapercibido y el ajuste que corrige un faltante hacia arriba
   * quedaría bloqueado justo cuando más falta hace.
   */
  it('permite el AJUSTE_POSITIVO por MUCHO más que el stock disponible', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 1 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_POSITIVO'), cantidad: 500 });

    expect(result.isOk()).toBe(true);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  /**
   * Una bitácora que ya quedó en negativo —lo que `calcularStock()` devuelve
   * tal cual en vez de recortar a cero— se corrige con un AJUSTE_POSITIVO. Si
   * el guard mirara el saldo resultante sin mirar la dirección, ese ajuste se
   * rechazaría y el desvío no tendría forma de repararse.
   */
  it('permite el AJUSTE_POSITIVO que corrige una bitácora ya negativa', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 1, SALIDA: 4 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_POSITIVO'), cantidad: 3 });

    expect(result.isOk()).toBe(true);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('rechaza el AJUSTE_NEGATIVO sobre esa misma bitácora ya negativa', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 1, SALIDA: 4 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 1 });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  // ─── El saldo se calcula con los CUATRO tipos ────────────────────────────

  it('descuenta las salidas previas de lo disponible', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, SALIDA: 4 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 6 });

    expect(result.isOk()).toBe(true);
  });

  it('rechaza lo que excede el saldo una vez descontadas las salidas previas', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, SALIDA: 4 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 7 });

    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
  });

  /**
   * Un AJUSTE_NEGATIVO previo ya asentó un faltante: esas unidades no están,
   * por más que la entrada las haya registrado. Si la fórmula lo ignorara —o
   * le diera el signo contrario—, el sistema autorizaría a bajar de nuevo un
   * stock que el conteo anterior ya había descontado.
   */
  it('descuenta el AJUSTE_NEGATIVO previo: lo que antes alcanzaba, ahora no', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_NEGATIVO: 3 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 8 });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  it('permite el límite exacto que deja el AJUSTE_NEGATIVO previo', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_NEGATIVO: 3 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 7 });

    expect(result.isOk()).toBe(true);
  });

  it('suma el AJUSTE_POSITIVO previo: alcanza para bajar más de lo que entró', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_POSITIVO: 5 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 15 });

    expect(result.isOk()).toBe(true);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('rechaza lo que excede el saldo aun con el AJUSTE_POSITIVO previo sumado', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_POSITIVO: 5 }) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 16 });

    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
  });

  // ─── El insumo sin bitácora ──────────────────────────────────────────────

  /**
   * Un insumo recién dado de alta no tiene ninguna fila, y el puerto devuelve
   * los cuatro tipos en cero. Para el AJUSTE_POSITIVO eso no es un obstáculo:
   * el primer movimiento de un insumo puede perfectamente ser el ajuste que
   * carga el conteo inicial del depósito.
   */
  it('asienta el AJUSTE_POSITIVO sobre un insumo sin ninguna bitácora', async () => {
    const c = buildColaboradores({ sumas: sumas({}) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_POSITIVO'), cantidad: 7 });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().tipo).toBe('AJUSTE_POSITIVO');
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('trata como stock cero al insumo sin bitácora frente a un AJUSTE_NEGATIVO', async () => {
    const c = buildColaboradores({ sumas: sumas({}) });

    const result = await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 1 });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
    expect(result.getError().message).toContain('0');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  // ─── La sección crítica ──────────────────────────────────────────────────

  /**
   * El caso de uso abre la transacción y toma el lock en LAS DOS direcciones,
   * y los casos se derivan de `TIPOS_AJUSTE_INSUMO` para que una dirección
   * nueva quede cubierta sola. Es la decisión de diseño de esta unidad: el
   * lock deja de ser una rama que se elige en tiempo de ejecución y pasa a ser
   * lo que este caso de uso hace siempre, así que no hay forma de saltearlo
   * para el AJUSTE_NEGATIVO sin romper también al positivo.
   *
   * El runner falso reproduce sin base la condición que el repositorio real
   * exige: anota toda llamada que ocurra con la transacción cerrada.
   */
  describe.each([...TIPOS_AJUSTE_INSUMO])('sección crítica de %s', (tipo) => {
    it('toma el lock y asienta el movimiento DENTRO de la misma transacción', async () => {
      const c = buildColaboradores();

      const result = await c.useCase.execute(dtoDe(tipo));

      expect(result.isOk()).toBe(true);
      expect(c.transacciones.abiertas).toBe(1);
      expect(c.movimientoRepo.lockAndSumByTipo).toHaveBeenCalledWith('ins-1');
      expect(c.llamadasFueraDeTransaccion).toEqual([]);
    });

    /**
     * El orden dentro de la sección crítica no es indistinto: leer el saldo
     * DESPUÉS de insertar mediría un stock que ya incluye el ajuste en
     * evaluación, y el rechazo llegaría tarde sobre una fila ya escrita.
     */
    it('lee las sumas ANTES de insertar, no después', async () => {
      const c = buildColaboradores();

      await c.useCase.execute(dtoDe(tipo));

      const ordenDeLaLectura = c.movimientoRepo.lockAndSumByTipo.mock.invocationCallOrder[0];
      const ordenDeLaEscritura = c.movimientoRepo.insert.mock.invocationCallOrder[0];
      expect(ordenDeLaLectura).toBeLessThan(ordenDeLaEscritura);
    });
  });

  it('no asienta nada cuando el stock no alcanza, aunque ya haya abierto la transacción', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 1 }) });

    await c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 2 });

    expect(c.transacciones.abiertas).toBe(1);
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * La elegibilidad del insumo se resuelve ANTES de abrir la transacción: no
   * necesita el lock, y abrirla igual haría esperar a los escritores del mismo
   * insumo detrás de una consulta que va a terminar en rechazo.
   */
  it('no abre la transacción si el insumo no es elegible', async () => {
    const c = buildColaboradores({ insumo: null });

    await c.useCase.execute(dtoDe('AJUSTE_NEGATIVO'));

    expect(c.transacciones.abiertas).toBe(0);
    expect(c.movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
  });

  // ─── Elegibilidad del insumo ─────────────────────────────────────────────

  /**
   * El hermano invertido del rechazo de la ENTRADA, y una decisión explícita:
   * un ajuste sobre un insumo DESHABILITADO se permite. Corregir el conteo
   * físico de lo que quedó en el depósito es justo lo que se espera después de
   * retirar el insumo de circulación; rechazarlo dejaría ese stock atrapado,
   * sin forma de llegar a cero salvo rehabilitando el insumo.
   */
  describe.each([...TIPOS_AJUSTE_INSUMO])('insumo deshabilitado con %s', (tipo) => {
    it('PERMITE el ajuste', async () => {
      const c = buildColaboradores({ insumo: insumoDeshabilitado() });

      const result = await c.useCase.execute(dtoDe(tipo));

      expect(result.isOk()).toBe(true);
      expect(result.getValue().tipo).toBe(tipo);
      expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
    });
  });

  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo no existe en el catálogo', async () => {
    const c = buildColaboradores({ insumo: null });

    const result = await c.useCase.execute({
      ...dtoDe('AJUSTE_POSITIVO'),
      insumoId: 'inexistente',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * La baja lógica SÍ cuenta como inexistencia, a diferencia del
   * deshabilitado: `findById()` no filtra por `deletedAt`, así que la fila
   * vuelve igual y sin este guard el ajuste se asentaría contra un insumo que
   * el catálogo ya no reconoce.
   */
  it('rechaza con INSUMO_NO_ENCONTRADO al insumo con baja lógica, aunque esté habilitado', async () => {
    const c = buildColaboradores({ insumo: insumoDadoDeBaja() });

    const result = await c.useCase.execute(dtoDe('AJUSTE_POSITIVO'));

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  it('rechaza con INSUMO_NO_ENCONTRADO al insumo dado de baja y además deshabilitado', async () => {
    const c = buildColaboradores({ insumo: insumoDadoDeBaja(false) });

    const result = await c.useCase.execute(dtoDe('AJUSTE_NEGATIVO'));

    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
  });

  // ─── Precondición de la cantidad ─────────────────────────────────────────

  /**
   * La cantidad fuera de rango o de escala es una violación de contrato del
   * caller: la entidad la tira como `throw` y el caso de uso NO la convierte
   * en `Result` — el borde ya la rechaza con un 400 que nombra el campo. Lo
   * que importa acá es que la precondición se evalúe ANTES de la sección
   * crítica.
   */
  it('propaga la violación de precondición de la cantidad sin abrir la transacción', async () => {
    const c = buildColaboradores();

    await expect(c.useCase.execute({ ...dtoDe('AJUSTE_NEGATIVO'), cantidad: 0 })).rejects.toThrow(
      /cantidad/,
    );
    expect(c.transacciones.abiertas).toBe(0);
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  // ─── Condición del saldo (stock-usado-componentes) ───────────────────────

  describe('condición NUEVO / USADO', () => {
    it('sin condición asienta NUEVO y no consulta la familia', async () => {
      const c = buildColaboradores({ familia: { esRepuesto: false } });

      const result = await c.useCase.execute(dtoDe('AJUSTE_POSITIVO'));

      expect(result.getValue().condicion).toBe('NUEVO');
      expect(c.familiaRepo.findById).not.toHaveBeenCalled();
    });

    it('rechaza un ajuste negativo USADO mayor que el saldo USADO aunque haya NUEVO', async () => {
      const c = buildColaboradores({
        sumas: sumasCon({ NUEVO: { ENTRADA: 100 }, USADO: { ENTRADA: 1 } }),
      });

      const result = await c.useCase.execute({
        ...dtoDe('AJUSTE_NEGATIVO'),
        cantidad: 2,
        condicion: 'USADO',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });

    it('asienta un ajuste negativo USADO dentro del saldo USADO', async () => {
      const c = buildColaboradores({ sumas: sumasCon({ USADO: { ENTRADA: 2 } }) });

      const result = await c.useCase.execute({
        ...dtoDe('AJUSTE_NEGATIVO'),
        cantidad: 2,
        condicion: 'USADO',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().condicion).toBe('USADO');
    });

    it('un ajuste positivo USADO no exige saldo previo', async () => {
      const c = buildColaboradores({ sumas: sumasCon({}) });

      const result = await c.useCase.execute({ ...dtoDe('AJUSTE_POSITIVO'), condicion: 'USADO' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().condicion).toBe('USADO');
    });

    it('el ajuste USADO sigue sin exigir el insumo habilitado, como el ajuste NUEVO', async () => {
      const c = buildColaboradores({ insumo: insumoDeshabilitado() });

      const result = await c.useCase.execute({ ...dtoDe('AJUSTE_POSITIVO'), condicion: 'USADO' });

      expect(result.isOk()).toBe(true);
    });

    it('rechaza USADO sobre un insumo que no es repuesto, antes de abrir la transacción', async () => {
      const c = buildColaboradores({ familia: { esRepuesto: false } });

      const result = await c.useCase.execute({ ...dtoDe('AJUSTE_POSITIVO'), condicion: 'USADO' });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
      expect(c.transacciones.abiertas).toBe(0);
      expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
    });
  });
});
