import { describe, it, expect, vi } from 'vitest';
import { InstalarComponenteDesdeDepositoUseCase } from './instalar-componente-desde-deposito.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { MovimientoInsumoEntity } from '../../../insumos/domain/entities/movimiento-insumo.entity';
import { Result } from '../../../shared/domain/result';
import {
  EquipoNoEncontradoError,
  InsumoNoEsRepuestoError,
} from '../../domain/errors/equipos.errors';
import { StockInsuficienteError } from '../../../insumos/domain/errors/insumos.errors';

/**
 * WU-4 (sdd/repuestos-instalar-desde-deposito, issue #153) —
 * `InstalarComponenteDesdeDepositoUseCase`.
 *
 * Unit: los dos use cases colaboradores (`AgregarComponenteUseCase`,
 * `RegistrarSalidaInsumoUseCase`) van mockeados por completo — la prueba de
 * que el mecanismo S36 (lanzar dentro de `run()`, desenvolver afuera) hace
 * REVERTIR de verdad contra Postgres vive en el spec de integración
 * (`instalar-componente-desde-deposito.integration.spec.ts`), no acá: un
 * mock siempre "commitea" porque no hay nada que revertir. Este spec prueba
 * la ORQUESTACIÓN: qué se llama, en qué orden, con qué payload, y qué pasa
 * con cada combinación de éxito/fallo de los dos colaboradores.
 */
describe('InstalarComponenteDesdeDepositoUseCase', () => {
  function makeComponente(insumoId: string): ComponenteEquipoEntity {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-uuid',
      insumoId,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
  }

  function makeMovimiento(insumoId: string): MovimientoInsumoEntity {
    return MovimientoInsumoEntity.create({
      insumoId,
      tipo: 'SALIDA',
      condicion: 'NUEVO',
      cantidad: 1,
      usuarioId: 'usuario-uuid',
      equipoId: 'equipo-uuid',
    }).getValue();
  }

  /**
   * `txRunner.run()` FAKE que ejecuta el callback en el mismo tick, sin abrir
   * nada real — alcanza para probar la orquestación (orden de llamadas,
   * propagación del throw) sin un Postgres de verdad.
   */
  function makeTxRunner() {
    return { run: vi.fn((fn: () => unknown) => fn()) };
  }

  function makeUseCase(overrides: {
    txRunner?: unknown;
    agregarComponenteUseCase?: unknown;
    registrarSalidaInsumoUseCase?: unknown;
    componenteRepo?: unknown;
  }) {
    return new InstalarComponenteDesdeDepositoUseCase(
      (overrides.txRunner ?? makeTxRunner()) as never,
      (overrides.agregarComponenteUseCase ?? { execute: vi.fn() }) as never,
      (overrides.registrarSalidaInsumoUseCase ?? { execute: vi.fn() }) as never,
      (overrides.componenteRepo ?? { save: vi.fn() }) as never,
    );
  }

  it('camino feliz: crea el componente y registra la salida de 1 unidad con el equipoId, dentro de la MISMA transacción', async () => {
    const insumoId = 'insumo-uuid';
    const componente = makeComponente(insumoId);
    const movimiento = makeMovimiento(insumoId);
    const txRunner = makeTxRunner();
    const agregarComponenteUseCase = { execute: vi.fn().mockResolvedValue(Result.ok(componente)) };
    const registrarSalidaInsumoUseCase = {
      execute: vi.fn().mockResolvedValue(Result.ok(movimiento)),
    };
    const useCase = makeUseCase({
      txRunner,
      agregarComponenteUseCase,
      registrarSalidaInsumoUseCase,
    });

    const result = await useCase.execute({
      equipoId: 'equipo-uuid',
      insumoId,
      usuarioId: 'usuario-uuid',
      descripcion: 'Instalado desde depósito',
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(componente);
    expect(txRunner.run).toHaveBeenCalledTimes(1);
    expect(agregarComponenteUseCase.execute).toHaveBeenCalledWith({
      equipoId: 'equipo-uuid',
      insumoId,
      descripcion: 'Instalado desde depósito',
      numeroSerie: null,
      capacidad: null,
    });
    expect(registrarSalidaInsumoUseCase.execute).toHaveBeenCalledWith({
      insumoId,
      cantidad: 1,
      usuarioId: 'usuario-uuid',
      equipoId: 'equipo-uuid',
      condicion: undefined,
    });

    // Orden: el componente se crea ANTES de intentar la salida (mismo
    // criterio que `RegistrarRecepcionDeItemUseCase`, compras).
    const ordenComponente = agregarComponenteUseCase.execute.mock.invocationCallOrder[0];
    const ordenSalida = registrarSalidaInsumoUseCase.execute.mock.invocationCallOrder[0];
    expect(ordenComponente).toBeLessThan(ordenSalida);
  });

  it('vincula la SALIDA al componente y lo guarda DESPUÉS de la salida, dentro del run()', async () => {
    const insumoId = 'insumo-uuid';
    const componente = makeComponente(insumoId);
    const movimiento = makeMovimiento(insumoId);
    const componenteRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const registrarSalidaInsumoUseCase = {
      execute: vi.fn().mockResolvedValue(Result.ok(movimiento)),
    };
    const useCase = makeUseCase({
      agregarComponenteUseCase: { execute: vi.fn().mockResolvedValue(Result.ok(componente)) },
      registrarSalidaInsumoUseCase,
      componenteRepo,
    });

    const result = await useCase.execute({
      equipoId: 'equipo-uuid',
      insumoId,
      usuarioId: 'usuario-uuid',
    });

    expect(result.isOk()).toBe(true);
    expect(componente.instalacionMovimientoId).toBe(movimiento.id);
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
    expect(registrarSalidaInsumoUseCase.execute.mock.invocationCallOrder[0]).toBeLessThan(
      componenteRepo.save.mock.invocationCallOrder[0],
    );
  });

  it.each(['NUEVO', 'USADO'] as const)(
    'la condición %s pedida viaja a la SALIDA',
    async (condicion) => {
      const insumoId = 'insumo-uuid';
      const registrarSalidaInsumoUseCase = {
        execute: vi.fn().mockResolvedValue(Result.ok(makeMovimiento(insumoId))),
      };
      const useCase = makeUseCase({
        agregarComponenteUseCase: {
          execute: vi.fn().mockResolvedValue(Result.ok(makeComponente(insumoId))),
        },
        registrarSalidaInsumoUseCase,
      });

      await useCase.execute({
        equipoId: 'equipo-uuid',
        insumoId,
        usuarioId: 'usuario-uuid',
        condicion,
      });

      expect(registrarSalidaInsumoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ condicion }),
      );
    },
  );

  it('saldo de la condición insuficiente: rechaza sin vincular ni guardar el componente', async () => {
    const insumoId = 'insumo-uuid';
    const error = new StockInsuficienteError(insumoId, 1, 0);
    const componenteRepo = { save: vi.fn() };
    const useCase = makeUseCase({
      agregarComponenteUseCase: {
        execute: vi.fn().mockResolvedValue(Result.ok(makeComponente(insumoId))),
      },
      registrarSalidaInsumoUseCase: { execute: vi.fn().mockResolvedValue(Result.fail(error)) },
      componenteRepo,
    });

    const result = await useCase.execute({
      equipoId: 'equipo-uuid',
      insumoId,
      usuarioId: 'usuario-uuid',
      condicion: 'USADO',
    });

    expect(result.getError()).toBe(error);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('stock insuficiente: la salida falla y el use case devuelve el MISMO StockInsuficienteError, lanzando DENTRO del run() para que revierta también el componente', async () => {
    const insumoId = 'insumo-uuid';
    const componente = makeComponente(insumoId);
    const error = new StockInsuficienteError(insumoId, 1, 0);
    const runSpy = vi.fn(async (fn: () => Promise<unknown>) => fn());
    const txRunner = { run: runSpy };
    const agregarComponenteUseCase = { execute: vi.fn().mockResolvedValue(Result.ok(componente)) };
    const registrarSalidaInsumoUseCase = {
      execute: vi.fn().mockResolvedValue(Result.fail(error)),
    };
    const useCase = makeUseCase({
      txRunner,
      agregarComponenteUseCase,
      registrarSalidaInsumoUseCase,
    });

    const result = await useCase.execute({
      equipoId: 'equipo-uuid',
      insumoId,
      usuarioId: 'usuario-uuid',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    // El callback pasado a run() tiene que HABER LANZADO — si no lanzara,
    // Postgres comitearía el componente sin la salida (S36). Se comprueba
    // llamando al callback capturado directamente.
    const callback = runSpy.mock.calls[0][0] as () => Promise<unknown>;
    await expect(callback()).rejects.toThrow(/salida de stock/i);
  });

  it('la creación del componente falla (insumo no es repuesto): NO se intenta la salida', async () => {
    const error = new InsumoNoEsRepuestoError('insumo-uuid');
    const agregarComponenteUseCase = { execute: vi.fn().mockResolvedValue(Result.fail(error)) };
    const registrarSalidaInsumoUseCase = { execute: vi.fn() };
    const useCase = makeUseCase({ agregarComponenteUseCase, registrarSalidaInsumoUseCase });

    const result = await useCase.execute({
      equipoId: 'equipo-uuid',
      insumoId: 'insumo-uuid',
      usuarioId: 'usuario-uuid',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(registrarSalidaInsumoUseCase.execute).not.toHaveBeenCalled();
  });

  it('equipo inexistente (reusa AgregarComponenteUseCase sin duplicar el chequeo): NO se intenta la salida', async () => {
    const error = new EquipoNoEncontradoError('no-existe');
    const agregarComponenteUseCase = { execute: vi.fn().mockResolvedValue(Result.fail(error)) };
    const registrarSalidaInsumoUseCase = { execute: vi.fn() };
    const useCase = makeUseCase({ agregarComponenteUseCase, registrarSalidaInsumoUseCase });

    const result = await useCase.execute({
      equipoId: 'no-existe',
      insumoId: 'insumo-uuid',
      usuarioId: 'usuario-uuid',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(registrarSalidaInsumoUseCase.execute).not.toHaveBeenCalled();
  });

  /**
   * Un error inesperado (la base caída, no un `DomainError` de negocio)
   * PROPAGA tal cual — no se disfraza de `Result.fail`. Mismo criterio que
   * `RegistrarRecepcionDeItemUseCase` (compras): solo `FalloSalidaDeStock` se
   * desenvuelve en el catch.
   */
  it('un error que NO es de la salida (p.ej. la base caída) propaga sin convertirse en Result.fail', async () => {
    const fallaInesperada = new Error('conexión perdida');
    const txRunner = { run: vi.fn().mockRejectedValue(fallaInesperada) };
    const useCase = makeUseCase({ txRunner });

    await expect(
      useCase.execute({
        equipoId: 'equipo-uuid',
        insumoId: 'insumo-uuid',
        usuarioId: 'usuario-uuid',
      }),
    ).rejects.toBe(fallaInesperada);
  });
});
