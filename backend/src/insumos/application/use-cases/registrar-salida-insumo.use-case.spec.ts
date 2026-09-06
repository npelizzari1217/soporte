import { describe, expect, it, vi } from 'vitest';
import { RegistrarSalidaInsumoUseCase } from './registrar-salida-insumo.use-case';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { TipoMovimientoInsumo } from '../../domain/entities/tipo-movimiento-insumo';
import { SumasPorTipoMovimiento } from '../../domain/ports/i-movimiento-insumo.repository';

describe('RegistrarSalidaInsumoUseCase', () => {
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
   * anota si ocurrió con la transacción abierta o no.
   */
  function buildColaboradores(
    opciones: { insumo?: InsumoEntity | null; sumas?: SumasPorTipoMovimiento } = {},
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
      insert: vi.fn(async () => {
        anotarSiEstaFuera('insert');
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

    const useCase = new RegistrarSalidaInsumoUseCase(insumoRepo, movimientoRepo, txRunner);

    return { useCase, insumoRepo, movimientoRepo, transacciones, llamadasFueraDeTransaccion };
  }

  const dtoBase = { insumoId: 'ins-1', cantidad: 10, usuarioId: 'usr-7' };

  // ─── Camino feliz ────────────────────────────────────────────────────────

  it('asienta la salida cuando el insumo es elegible y hay stock suficiente', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 100 }) });

    const result = await c.useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    const movimiento = result.getValue();
    expect(movimiento.tipo).toBe('SALIDA');
    expect(movimiento.insumoId).toBe('ins-1');
    expect(movimiento.cantidad).toBe(10);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
    expect(c.movimientoRepo.insert).toHaveBeenCalledWith(movimiento);
  });

  it('asienta el usuarioId que recibe, sin derivarlo de ningún otro dato', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute({ ...dtoBase, usuarioId: 'usr-99' });

    expect(result.getValue().usuarioId).toBe('usr-99');
  });

  /**
   * El motivo es OPCIONAL en la salida: solo los dos ajustes lo exigen. Sacar
   * un tóner del depósito para ponerlo en una impresora no necesita
   * explicación, y exigirla llenaría la bitácora de relleno.
   */
  it('asienta la salida sin motivo, que en este tipo no es obligatorio', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().motivo).toBeNull();
  });

  it('conserva el motivo recortado y la trazabilidad de equipo y sector', async () => {
    const c = buildColaboradores();

    const result = await c.useCase.execute({
      ...dtoBase,
      motivo: '  Repuesto para la impresora de mesa de entradas  ',
      equipoId: 'eq-3',
      sectorId: 'sec-2',
    });

    expect(result.getValue().motivo).toBe('Repuesto para la impresora de mesa de entradas');
    expect(result.getValue().equipoId).toBe('eq-3');
    expect(result.getValue().sectorId).toBe('sec-2');
  });

  // ─── El límite exacto del stock ──────────────────────────────────────────

  /**
   * El límite exacto, que es donde se rompen el `>` y el `>=`. Vaciar el
   * depósito es una operación legítima y frecuente: se saca la última unidad y
   * el saldo queda en cero, que no es negativo.
   */
  it('permite sacar EXACTAMENTE todo el stock disponible', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 10 });

    expect(result.isOk()).toBe(true);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('rechaza con STOCK_INSUFICIENTE una sola unidad más que el stock disponible', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 11 });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  it('nombra en el error la cantidad pedida y la disponible', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 11 });

    expect(result.getError().message).toContain('11');
    expect(result.getError().message).toContain('10');
  });

  // ─── El saldo se calcula con los CUATRO tipos ────────────────────────────

  it('descuenta las salidas previas de lo disponible', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, SALIDA: 4 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 6 });

    expect(result.isOk()).toBe(true);
  });

  it('rechaza lo que excede el saldo una vez descontadas las salidas previas', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, SALIDA: 4 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 7 });

    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
  });

  /**
   * Un `AJUSTE_NEGATIVO` previo asentó un faltante: esas unidades no están en
   * el depósito por más que la entrada las haya registrado. Si la fórmula lo
   * ignorara —o le diera el signo contrario—, el sistema autorizaría a sacar
   * unidades que el conteo físico ya declaró perdidas.
   */
  it('descuenta el AJUSTE_NEGATIVO previo: lo que antes alcanzaba, ahora no', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_NEGATIVO: 3 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 8 });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  it('permite el límite exacto que deja el AJUSTE_NEGATIVO previo', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_NEGATIVO: 3 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 7 });

    expect(result.isOk()).toBe(true);
  });

  /**
   * Un `AJUSTE_POSITIVO` previo asentó que el conteo físico dio MÁS de lo
   * registrado, así que aumenta lo disponible. Sin ese término, una salida
   * legítima se rechazaría contra un stock que el ajuste ya había corregido.
   */
  it('suma el AJUSTE_POSITIVO previo: alcanza para más de lo que entró', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_POSITIVO: 5 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 15 });

    expect(result.isOk()).toBe(true);
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('rechaza lo que excede el saldo aun con el AJUSTE_POSITIVO previo sumado', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 10, AJUSTE_POSITIVO: 5 }) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 16 });

    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
  });

  /**
   * El insumo recién dado de alta no tiene ninguna fila en la bitácora, y el
   * puerto devuelve los cuatro tipos en cero. Eso es stock CERO, no stock
   * desconocido: no hay salida posible.
   */
  it('trata como stock cero al insumo sin ninguna bitácora', async () => {
    const c = buildColaboradores({ sumas: sumas({}) });

    const result = await c.useCase.execute({ ...dtoBase, cantidad: 1 });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('STOCK_INSUFICIENTE');
    expect(result.getError().message).toContain('0');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  // ─── La sección crítica ──────────────────────────────────────────────────

  /**
   * La salida RESTA, así que decide bajo el advisory lock: leer las sumas y
   * escribir el asiento van dentro de la MISMA transacción. Fuera de ella el
   * repositorio real lanza —Postgres libera el lock al terminar la sentencia,
   * y dos salidas simultáneas del mismo insumo verían las mismas sumas y
   * pasarían las dos—. El runner falso reproduce esa distinción anotando toda
   * llamada que ocurra con la transacción cerrada.
   */
  it('toma el lock y asienta el movimiento DENTRO de la misma transacción', async () => {
    const c = buildColaboradores();

    await c.useCase.execute(dtoBase);

    expect(c.transacciones.abiertas).toBe(1);
    expect(c.movimientoRepo.lockAndSumByTipo).toHaveBeenCalledWith('ins-1');
    expect(c.llamadasFueraDeTransaccion).toEqual([]);
  });

  /**
   * El orden dentro de la sección crítica no es indistinto: leer el saldo
   * DESPUÉS de insertar mediría un stock que ya incluye la salida que se está
   * evaluando, y el rechazo llegaría tarde sobre una fila ya escrita.
   */
  it('lee las sumas ANTES de insertar, no después', async () => {
    const c = buildColaboradores();

    await c.useCase.execute(dtoBase);

    const ordenDeLaLectura = c.movimientoRepo.lockAndSumByTipo.mock.invocationCallOrder[0];
    const ordenDeLaEscritura = c.movimientoRepo.insert.mock.invocationCallOrder[0];
    expect(ordenDeLaLectura).toBeLessThan(ordenDeLaEscritura);
  });

  it('no asienta nada cuando el stock no alcanza, aunque ya haya abierto la transacción', async () => {
    const c = buildColaboradores({ sumas: sumas({ ENTRADA: 1 }) });

    await c.useCase.execute({ ...dtoBase, cantidad: 2 });

    expect(c.transacciones.abiertas).toBe(1);
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * La elegibilidad del insumo se resuelve ANTES de abrir la transacción: no
   * necesita el lock, y abrirla igual haría esperar a las salidas del mismo
   * insumo detrás de una consulta que va a terminar en rechazo.
   */
  it('no abre la transacción si el insumo no es elegible', async () => {
    const c = buildColaboradores({ insumo: null });

    await c.useCase.execute(dtoBase);

    expect(c.transacciones.abiertas).toBe(0);
    expect(c.movimientoRepo.lockAndSumByTipo).not.toHaveBeenCalled();
  });

  // ─── Elegibilidad del insumo ─────────────────────────────────────────────

  /**
   * El hermano invertido del rechazo de la ENTRADA, y una decisión explícita:
   * una salida sobre un insumo DESHABILITADO se permite. Es consumir lo que
   * quedó en el depósito, justo lo que se espera después de retirarlo de
   * circulación. Rechazarla dejaría ese stock atrapado, sin forma de llegar a
   * cero salvo rehabilitando el insumo o asentando un ajuste que mentiría
   * sobre lo que pasó.
   */
  it('PERMITE la salida sobre un insumo deshabilitado', async () => {
    const c = buildColaboradores({ insumo: insumoDeshabilitado() });

    const result = await c.useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().tipo).toBe('SALIDA');
    expect(c.movimientoRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('rechaza con INSUMO_NO_ENCONTRADO si el insumo no existe en el catálogo', async () => {
    const c = buildColaboradores({ insumo: null });

    const result = await c.useCase.execute({ ...dtoBase, insumoId: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  /**
   * La baja lógica SÍ cuenta como inexistencia, a diferencia del
   * deshabilitado: `findById()` no filtra por `deletedAt`, así que la fila
   * vuelve igual y sin este guard la salida se asentaría contra un insumo que
   * el catálogo ya no reconoce.
   */
  it('rechaza con INSUMO_NO_ENCONTRADO al insumo con baja lógica, aunque esté habilitado', async () => {
    const c = buildColaboradores({ insumo: insumoDadoDeBaja() });

    const result = await c.useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });

  it('rechaza con INSUMO_NO_ENCONTRADO al insumo dado de baja y además deshabilitado', async () => {
    const c = buildColaboradores({ insumo: insumoDadoDeBaja(false) });

    const result = await c.useCase.execute(dtoBase);

    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
  });

  // ─── Precondición de la cantidad ─────────────────────────────────────────

  /**
   * La cantidad fuera de rango o de escala es una violación de contrato del
   * caller: la entidad la tira como `throw` y el caso de uso NO la convierte
   * en `Result` — el borde ya la rechaza con un 400 que nombra el campo. Lo
   * que importa acá es que la precondición se evalúe ANTES de la sección
   * crítica: abrir la transacción y tomar el lock para un movimiento que ni
   * siquiera puede construirse haría esperar al resto de los escritores del
   * insumo por nada.
   */
  it('propaga la violación de precondición de la cantidad sin abrir la transacción', async () => {
    const c = buildColaboradores();

    await expect(c.useCase.execute({ ...dtoBase, cantidad: 0 })).rejects.toThrow(/cantidad/);
    expect(c.transacciones.abiertas).toBe(0);
    expect(c.movimientoRepo.insert).not.toHaveBeenCalled();
  });
});
