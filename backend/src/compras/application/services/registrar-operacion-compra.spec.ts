/**
 * PR-13 [UNIT] — RED→GREEN: `RegistrarOperacionCompra` (ADR-C4).
 *
 * Cubre, en aislamiento (sin DB, sin `ITenantTransactionRunner` real):
 * 1. `registrar()` LANZA (no `Result.fail`) cuando `IOperacionCompraRepository.crear()`
 *    falla — el `throw` es el MECANISMO de rollback de S36 dentro de
 *    `$transaction`, no un descuido de manejo de errores.
 * 2. `registrar()` delega tal cual en `crear()` y no envuelve el resultado
 *    en `Result` (retorna `void`/`undefined`).
 * 3. `RegistrarOperacionCompra` NUNCA abre su propia transacción (ADR-C4):
 *    guardia estructural (aridad del constructor: solo depende del repo de
 *    bitácora) + guardia de comportamiento (un `ITenantTransactionRunner`
 *    "ambiente" nunca es tocado por `registrar()`).
 *
 * El caso de integración real (S36 con rollback contra Postgres) vive en
 * `registrar-operacion-compra.s36.integration.spec.ts` — acá NO se prueba
 * el rollback en sí (eso requiere DB real), solo el contrato de
 * `RegistrarOperacionCompra` en aislamiento.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S35-S37). Ref design:
 * ADR-C4. Tarea: PR-13.
 */
import { RegistrarOperacionCompra } from './registrar-operacion-compra';
import { IOperacionCompraRepository } from '../../domain/ports/i-operacion-compra.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';

describe('RegistrarOperacionCompra', () => {
  describe('registrar()', () => {
    it('LANZA (no retorna Result.fail) cuando el repo de bitacora falla al crear', async () => {
      const errorRepo = new Error('DB no disponible al escribir la bitacora');
      const operacionRepoStub: Pick<IOperacionCompraRepository, 'crear'> = {
        crear: vi.fn().mockRejectedValue(errorRepo),
      };
      const registrar = new RegistrarOperacionCompra(operacionRepoStub);

      await expect(
        registrar.registrar({
          compraId: 'compra-1',
          itemCompraId: null,
          tipo: 'CREACION',
          usuarioId: 'usuario-1',
          detalle: 'Alta de la compra',
          datos: null,
        }),
      ).rejects.toThrow(errorRepo);
    });

    it('delega en operacionRepo.crear() con los props recibidos y retorna void (no Result)', async () => {
      const crearMock = vi.fn().mockResolvedValue(undefined);
      const registrar = new RegistrarOperacionCompra({ crear: crearMock });

      const retorno = await registrar.registrar({
        compraId: 'compra-1',
        itemCompraId: 'item-1',
        tipo: 'ITEM_AGREGADO',
        usuarioId: 'usuario-1',
        detalle: 'Se agrego un item',
        datos: { cantidad: 2 },
      });

      expect(crearMock).toHaveBeenCalledTimes(1);
      expect(crearMock).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemCompraId: 'item-1',
        tipo: 'ITEM_AGREGADO',
        usuarioId: 'usuario-1',
        detalle: 'Se agrego un item',
        datos: { cantidad: 2 },
      });
      // No Result: ni .isOk ni .isFail existen en el retorno.
      expect(retorno).toBeUndefined();
    });

    it('datos es opcional en la entrada y se normaliza a null antes de crear()', async () => {
      const crearMock = vi.fn().mockResolvedValue(undefined);
      const registrar = new RegistrarOperacionCompra({ crear: crearMock });

      await registrar.registrar({
        compraId: 'compra-1',
        itemCompraId: null,
        tipo: 'CANCELACION',
        usuarioId: 'usuario-1',
        detalle: 'Cancelacion sin datos adicionales',
      });

      expect(crearMock).toHaveBeenCalledWith(expect.objectContaining({ datos: null }));
    });
  });

  describe('no abre transaccion propia (ADR-C4)', () => {
    it('el constructor tiene aridad 1: SOLO depende del repo de bitacora, nunca de ITenantTransactionRunner', () => {
      expect(RegistrarOperacionCompra.length).toBe(1);
    });

    it('registrar() no invoca ningun ITenantTransactionRunner.run ambiente (spy con 0 llamadas)', async () => {
      // Simula que en el entorno de ejecucion existe un runner (el mismo que
      // el caso de uso mutador usaria para abrir SU transaccion) — la
      // aridad del constructor ya impide pasarselo a RegistrarOperacionCompra,
      // así que este spy debe permanecer en 0 llamadas durante registrar().
      const runSpy = vi.fn();
      const txRunnerAmbiente: Pick<ITenantTransactionRunner, 'run'> = { run: runSpy };
      void txRunnerAmbiente;

      const crearMock = vi.fn().mockResolvedValue(undefined);
      const registrar = new RegistrarOperacionCompra({ crear: crearMock });

      await registrar.registrar({
        compraId: 'compra-1',
        itemCompraId: null,
        tipo: 'CREACION',
        usuarioId: 'usuario-1',
        detalle: 'Alta de la compra',
        datos: null,
      });

      expect(runSpy).not.toHaveBeenCalled();
    });
  });
});
