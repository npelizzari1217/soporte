/**
 * compras.module.spec.ts — wiring de `ComprasModule` (PR-22, cierra la
 * FASE E de sdd/redisenio-modulo-compras).
 *
 * Dos capas de la defensa de 3 capas contra el olvido de bitácora (ADR-C4):
 *
 * - **Capa 2 (wiring, estructural)**: lee `Reflect.getMetadata('providers',
 *   ComprasModule)` directamente — sin compilar el árbol de módulos ni
 *   requerir DB, mismo patrón que `equipos.module.spec.ts`/
 *   `reparaciones.module.spec.ts`. La regla "tx ⇒ bitácora" es un PREDICADO
 *   sobre `inject[]`, no una lista de nombres tipeada a mano: cualquier
 *   provider NUEVO cuyo `inject[]` contenga `TENANT_TX_RUNNER` cae bajo el
 *   mismo chequeo automáticamente — si un PR futuro agrega un mutador sin
 *   cablear `RegistrarOperacionCompra`, este test lo atrapa SOLO, sin que
 *   nadie lo edite.
 * - **Capa 3 (comportamiento, wiring real)**: invoca el `useFactory` REAL
 *   registrado en el módulo (no una re-implementación de mano) para
 *   construir cada uno de los 10 casos de uso mutadores con dependencias
 *   fake, ejecuta `execute()` con un DTO mínimo válido, y verifica con un
 *   spy que la bitácora se llamó exactamente 1 vez con el `tipo` correcto —
 *   cierra el hueco entre "la metadata declara la dependencia" (capa 2) y
 *   "el caso de uso wireado de verdad la usa" (capa 3), distinto de los
 *   specs unitarios de PR-14..PR-18 (que instancian a mano, no vía DI).
 *
 * Ref design: ADR-C2, ADR-C4, ADR-C5. Ref tasks: PR-22.
 */
import 'reflect-metadata';
import { vi, type Mock } from 'vitest';
import { ComprasModule } from './compras.module';
import { ComprasController } from './interface/controllers/compras.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { AuthModule } from '../auth/auth.module';
import { SectoresModule } from '../sectores/sectores.module';
import { InsumosModule } from '../insumos/insumos.module';
import { ISectorRepository } from '../sectores/domain/ports/i-sector.repository';
import { RegistrarEntradaInsumoUseCase } from '../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import { MovimientoInsumoEntity } from '../insumos/domain/entities/movimiento-insumo.entity';
import { InsumoEntity } from '../insumos/domain/entities/insumo.entity';
import { IInsumoRepository } from '../insumos/domain/ports/i-insumo.repository';
import {
  TENANT_TX_RUNNER,
  ITenantTransactionRunner,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { COMPRA_REPOSITORY, ICompraRepository } from './domain/ports/i-compra.repository';
import {
  OPERACION_COMPRA_REPOSITORY,
  IOperacionCompraRepository,
} from './domain/ports/i-operacion-compra.repository';
import { NumeradorCompra } from './domain/services/numerador-compra';
import { RegistrarOperacionCompra } from './application/services/registrar-operacion-compra';
import { ResolverCicloActivoCompra } from './application/services/resolver-ciclo-activo-compra.service';
import { CicloClienteEntity } from '../tickets/domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../tickets/domain/ports/i-ciclo-cliente.repository';
import { Result } from '../shared/domain/result';
import { SinCicloActivoError as ComprasSinCicloActivoError } from './domain/errors/compras.errors';

import { CompraEntity, CompraProps } from './domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraProps } from './domain/entities/item-compra.entity';

import { CrearCompraUseCase } from './application/use-cases/crear-compra.use-case';
import { AgregarItemCompraUseCase } from './application/use-cases/agregar-item-compra.use-case';
import { EditarItemCompraUseCase } from './application/use-cases/editar-item-compra.use-case';
import { EliminarItemCompraUseCase } from './application/use-cases/eliminar-item-compra.use-case';
import { AprobarItemCompraUseCase } from './application/use-cases/aprobar-item-compra.use-case';
import { RechazarItemCompraUseCase } from './application/use-cases/rechazar-item-compra.use-case';
import { RegistrarOrdenDeItemUseCase } from './application/use-cases/registrar-orden-de-item.use-case';
import { RegistrarRecepcionDeItemUseCase } from './application/use-cases/registrar-recepcion-de-item.use-case';
import { RegistrarEntregaDeItemUseCase } from './application/use-cases/registrar-entrega-de-item.use-case';
import { EditarFechaEtapaDeItemUseCase } from './application/use-cases/editar-fecha-etapa-de-item.use-case';
import { CerrarItemConFaltanteUseCase } from './application/use-cases/cerrar-item-con-faltante.use-case';
import { CancelarCompraUseCase } from './application/use-cases/cancelar-compra.use-case';

// ─── Helpers de metadata (capa 2 y capa 3 comparten esta lectura) ─────────

interface FactoryProvider {
  provide: unknown;
  useFactory: (...args: unknown[]) => unknown;
  inject?: unknown[];
}

function isFactoryProvider(p: unknown): p is FactoryProvider {
  return (
    typeof p === 'object' &&
    p !== null &&
    'useFactory' in p &&
    typeof (p as { useFactory?: unknown }).useFactory === 'function' &&
    'inject' in p
  );
}

function providersMetadata(): unknown[] {
  return (Reflect.getMetadata('providers', ComprasModule) ?? []) as unknown[];
}

function factoryProviders(): FactoryProvider[] {
  return providersMetadata().filter(isFactoryProvider);
}

function getFactoryProvider(token: unknown): FactoryProvider {
  const found = factoryProviders().find((p) => p.provide === token);
  if (!found) {
    throw new Error(
      'ComprasModule no registra un provider con useFactory para el token dado (wiring incompleto).',
    );
  }
  return found;
}

// ─── Fixtures de dominio (capa 3) ──────────────────────────────────────────

const COMPRA_ID = 'compra-fixture-1';
const ITEM_ID = 'item-fixture-1';
const FECHA_BASE = new Date('2026-01-01');
const INSUMO_ID = '00000000-0000-4000-8000-0000000000aa';

function compraProps(overrides: Partial<CompraProps> = {}): CompraProps {
  return {
    numero: 'COM-2026-00001',
    fechaSolicitud: FECHA_BASE,
    motivo: 'Compra de prueba (wiring)',
    descripcion: null,
    solicitanteId: 'solicitante-1',
    cicloId: 'ciclo-1',
    canceladaEn: null,
    canceladoPorId: null,
    motivoCancelacion: null,
    ...overrides,
  };
}

function itemProps(overrides: Partial<ItemCompraProps> = {}): ItemCompraProps {
  return {
    compraId: COMPRA_ID,
    descripcion: 'Notebook Dell Latitude',
    insumoId: null,
    cantidad: 2,
    proveedor: 'Proveedor SA',
    monto: 150000,
    moneda: 'ARS',
    fechaCotizacion: FECHA_BASE,
    observaciones: null,
    estadoAprobacion: 'PENDIENTE',
    decididoPorId: null,
    decididoEn: null,
    cantidadOrdenada: 0,
    cantidadRecibida: 0,
    cantidadEntregada: 0,
    fechaOrden: null,
    fechaRecepcion: null,
    fechaEntrega: null,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    ...overrides,
  };
}

function itemFixture(overrides: Partial<ItemCompraProps> = {}): ItemCompraEntity {
  return ItemCompraEntity.reconstitute(itemProps(overrides), ITEM_ID, FECHA_BASE, FECHA_BASE, null);
}

function compraFixture(
  items: ItemCompraEntity[] = [],
  overrides: Partial<CompraProps> = {},
): CompraEntity {
  return CompraEntity.reconstitute(
    compraProps(overrides),
    items,
    COMPRA_ID,
    FECHA_BASE,
    FECHA_BASE,
    null,
  );
}

// ─── Fakes de infraestructura (capa 3) ─────────────────────────────────────

function fakeTxRunner(): ITenantTransactionRunner {
  return { run: async (fn) => fn(), alCommitear: (fn) => fn() };
}

function fakeOperacionRepo(): Pick<IOperacionCompraRepository, 'crear'> & { crear: Mock } {
  return { crear: vi.fn().mockResolvedValue(undefined) };
}

/**
 * Catálogo de insumos que SÍ resuelve el id que le piden. Un doble que
 * devolviera `null` dejaría verde el wiring del alta y la edición del ítem sin
 * haber probado que el segundo argumento del factory llega a destino: el caso
 * de uso cortaría con `InsumoNoEncontradoError` y el test nunca lo notaría.
 */
function fakeCatalogoInsumos(): Pick<IInsumoRepository, 'findById'> {
  return {
    findById: vi.fn().mockResolvedValue(
      InsumoEntity.reconstitute(
        {
          codigo: 'TON-001',
          nombre: 'Tóner negro',
          familiaId: 'familia-1',
          unidadMedidaId: 'unidad-1',
          stockMinimo: null,
          activo: true,
          codigosAlternativos: [],
          compatibilidad: [],
        },
        INSUMO_ID,
        FECHA_BASE,
        FECHA_BASE,
        null,
      ),
    ),
  };
}

/**
 * Entrada de stock CARGADA: asienta un movimiento real con el DTO que recibe,
 * en vez de devolver un valor fijo. Con un doble inerte, el caso de la
 * recepción con insumo declarado quedaría verde sin haber probado que el
 * cuarto argumento del factory llega a destino.
 */
function fakeEntradaInsumo(): Pick<RegistrarEntradaInsumoUseCase, 'execute'> & { execute: Mock } {
  return {
    execute: vi.fn(async (dto: { insumoId: string; cantidad: number; usuarioId: string }) =>
      MovimientoInsumoEntity.create({
        insumoId: dto.insumoId,
        tipo: 'ENTRADA',
        cantidad: dto.cantidad,
        usuarioId: dto.usuarioId,
      }),
    ),
  };
}

describe('ComprasModule wiring (PR-22, sdd/redisenio-modulo-compras)', () => {
  it('registra ComprasController', () => {
    const controllers = (Reflect.getMetadata('controllers', ComprasModule) ?? []) as unknown[];
    expect(controllers).toContain(ComprasController);
  });

  it('importa TicketsModule, AuthModule, SectoresModule (fix post-verify W6) e InsumosModule (insumos-entrega-3)', () => {
    const imports = (Reflect.getMetadata('imports', ComprasModule) ?? []) as unknown[];
    expect(imports).toContain(TicketsModule);
    expect(imports).toContain(AuthModule);
    expect(imports).toContain(SectoresModule);
    expect(imports).toContain(InsumosModule);
  });

  it.each([COMPRA_REPOSITORY, OPERACION_COMPRA_REPOSITORY])('%s está exportado', (token) => {
    const exportsList = (Reflect.getMetadata('exports', ComprasModule) ?? []) as unknown[];
    expect(exportsList).toContain(token);
  });

  describe('Capa 2 (ADR-C4) — regla estructural "tx ⇒ bitácora"', () => {
    /**
     * Predicado estructural, NO una lista tipeada a mano: cualquier
     * provider cuyo `inject[]` contenga `TENANT_TX_RUNNER` (es decir,
     * cualquier caso de uso que abre transacción, exista hoy o se agregue
     * en un PR futuro) DEBE también inyectar `RegistrarOperacionCompra`.
     */
    const providersConTx = (): FactoryProvider[] =>
      factoryProviders().filter((p) => (p.inject ?? []).includes(TENANT_TX_RUNNER));

    it('registra al menos los 12 casos de uso mutadores con TENANT_TX_RUNNER (WU-25: +RegistrarOrdenDeItemUseCase, +EditarFechaEtapaDeItemUseCase)', () => {
      expect(providersConTx().length).toBeGreaterThanOrEqual(12);
    });

    it.each(
      providersConTx().map((p) => {
        const token = p.provide as { name?: string } | symbol;
        const nombre = typeof token === 'symbol' ? token.toString() : (token.name ?? String(token));
        return [nombre, p] as const;
      }),
    )(
      '%s: si abre transacción (TENANT_TX_RUNNER), también registra bitácora (RegistrarOperacionCompra)',
      (_nombre, p) => {
        expect(p.inject).toContain(RegistrarOperacionCompra);
      },
    );

    it('las 3 consultas NO inyectan TENANT_TX_RUNNER (son lecturas puras, §4.9/§4.10)', () => {
      const consultas = [
        'ListarComprasUseCase',
        'ObtenerCompraUseCase',
        'ListarOperacionesCompraUseCase',
      ];
      const providersConsulta = factoryProviders().filter((p) => {
        const token = p.provide as { name?: string };
        return typeof token === 'function' && consultas.includes(token.name);
      });
      expect(providersConsulta.length).toBe(3);
      for (const p of providersConsulta) {
        expect(p.inject ?? []).not.toContain(TENANT_TX_RUNNER);
      }
    });
  });

  describe('Capa 3 (ADR-C4) — comportamiento: wiring REAL + spy sobre la bitácora', () => {
    it('CrearCompraUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo CREACION', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const compraRepo: Pick<ICompraRepository, 'guardar'> = {
        guardar: vi.fn().mockResolvedValue(undefined),
      };
      const numerador: Pick<NumeradorCompra, 'generarNumero'> = {
        generarNumero: vi.fn().mockResolvedValue(Result.ok('COM-2026-00001')),
      };
      const cicloFixture = CicloClienteEntity.create(
        {
          cicloVigenteId: 'ciclo-vigente-1',
          nombre: 'Ciclo 2026',
          fechaInicio: FECHA_BASE,
          fechaFin: new Date('2026-12-31'),
          activo: true,
        },
        'ciclo-1',
      );
      const resolverCicloActivo: Pick<ResolverCicloActivoCompra, 'resolver'> = {
        resolver: vi.fn().mockResolvedValue(Result.ok(cicloFixture)),
      };
      // Fix post-verify W6: sin `sectorId` en el DTO de este test, el
      // caso de uso NUNCA consulta `sectorRepo` — el mock no necesita
      // devolver nada útil, solo estar presente en la firma del factory.
      const sectorRepo: Pick<ISectorRepository, 'findById'> = {
        findById: vi.fn().mockResolvedValue(null),
      };

      const provider = getFactoryProvider(CrearCompraUseCase);
      const instance = provider.useFactory(
        compraRepo,
        numerador,
        resolverCicloActivo,
        sectorRepo,
        registrarOperacion,
        fakeTxRunner(),
      ) as CrearCompraUseCase;

      const result = await instance.execute({
        motivo: 'Compra de prueba',
        descripcion: null,
        fechaSolicitud: FECHA_BASE,
        solicitanteId: 'user-1',
        anio: 2026,
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'CREACION' }),
      );
    });

    it('resolución de ciclo activo (wiring real): sin ciclo activo, falla con SinCicloActivoError de COMPRAS (no de tickets)', async () => {
      // Regresión: el resolver de ciclo activo WIREADO por ComprasModule
      // debe fallar con la clase de `compras/domain/errors`, nunca con la
      // de `tickets/domain/errors` — aunque ambas comparten `code =
      // 'SIN_CICLO_ACTIVO'` y mensaje similar, son clases DISTINTAS y
      // `ComprasController.toHttpException` hace `instanceof` contra la de
      // compras (409). Antes del fix, `ComprasModule` cableaba el
      // `ResolverCicloActivoParaCreacion` de `tickets/` sin más, que
      // devuelve la clase de tickets -> el `instanceof` de la capa HTTP
      // nunca daba `true` y el caller recibía 422 + el mensaje de tickets.
      // Confirmado en RED antes de este fix (ver apply-progress).
      const cicloRepo: Pick<ICicloClienteRepository, 'findActive'> = {
        findActive: vi.fn().mockResolvedValue(null),
      };

      const provider = getFactoryProvider(ResolverCicloActivoCompra);
      const instance = provider.useFactory(cicloRepo) as ResolverCicloActivoCompra;

      const result = await instance.resolver();

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ComprasSinCicloActivoError);
    });

    it('AgregarItemCompraUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ITEM_AGREGADO', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const compra = compraFixture([]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardar' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardar: vi.fn().mockResolvedValue(undefined),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const catalogoInsumos = fakeCatalogoInsumos();
      const provider = getFactoryProvider(AgregarItemCompraUseCase);
      const instance = provider.useFactory(
        compraRepo,
        catalogoInsumos,
        registrarOperacion,
        fakeTxRunner(),
      ) as AgregarItemCompraUseCase;

      // Con `insumoId` declarado: es lo que hace pasar el segundo argumento del
      // factory por el camino real en vez de dejarlo inerte en la firma.
      const result = await instance.execute({
        compraId: COMPRA_ID,
        usuarioId: 'user-1',
        descripcion: 'Mouse',
        cantidad: 1,
        proveedor: 'Proveedor SA',
        monto: 5000,
        moneda: 'ARS',
        fechaCotizacion: FECHA_BASE,
        observaciones: null,
        insumoId: INSUMO_ID,
      });

      expect(result.isFail()).toBe(false);
      expect(catalogoInsumos.findById).toHaveBeenCalledWith(INSUMO_ID);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ITEM_AGREGADO' }),
      );
    });

    it('EditarItemCompraUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ITEM_EDITADO', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const compra = compraFixture([itemFixture()]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardar' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardar: vi.fn().mockResolvedValue(undefined),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const catalogoInsumos = fakeCatalogoInsumos();
      const provider = getFactoryProvider(EditarItemCompraUseCase);
      const instance = provider.useFactory(
        compraRepo,
        catalogoInsumos,
        registrarOperacion,
        fakeTxRunner(),
      ) as EditarItemCompraUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
        descripcion: 'Notebook Dell Latitude (editado)',
        insumoId: INSUMO_ID,
      });

      expect(result.isFail()).toBe(false);
      expect(catalogoInsumos.findById).toHaveBeenCalledWith(INSUMO_ID);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ITEM_EDITADO' }),
      );
    });

    it('EliminarItemCompraUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ITEM_ELIMINADO', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const compra = compraFixture([itemFixture()]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardar' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardar: vi.fn().mockResolvedValue(undefined),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(EliminarItemCompraUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacion,
        fakeTxRunner(),
      ) as EliminarItemCompraUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ITEM_ELIMINADO' }),
      );
    });

    it('AprobarItemCompraUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ITEM_APROBADO', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacionCompra = new RegistrarOperacionCompra(operacionRepo);
      const compra = compraFixture([itemFixture()]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(AprobarItemCompraUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacionCompra,
        fakeTxRunner(),
      ) as AprobarItemCompraUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ITEM_APROBADO' }),
      );
    });

    it('RechazarItemCompraUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ITEM_RECHAZADO', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacionCompra = new RegistrarOperacionCompra(operacionRepo);
      const compra = compraFixture([itemFixture()]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(RechazarItemCompraUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacionCompra,
        fakeTxRunner(),
      ) as RechazarItemCompraUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ITEM_RECHAZADO' }),
      );
    });

    it('RegistrarOrdenDeItemUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ORDEN_REGISTRADA', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const itemAprobado = itemFixture({
        estadoAprobacion: 'APROBADO',
        decididoPorId: 'aprobador-1',
        decididoEn: FECHA_BASE,
      });
      const compra = compraFixture([itemAprobado]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(RegistrarOrdenDeItemUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacion,
        fakeTxRunner(),
      ) as RegistrarOrdenDeItemUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
        cantidadOrdenada: 1,
        fecha: FECHA_BASE,
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ORDEN_REGISTRADA' }),
      );
    });

    it('RegistrarRecepcionDeItemUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo RECEPCION_REGISTRADA', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const itemAprobado = itemFixture({
        estadoAprobacion: 'APROBADO',
        decididoPorId: 'aprobador-1',
        decididoEn: FECHA_BASE,
        cantidadOrdenada: 2,
      });
      const compra = compraFixture([itemAprobado]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(RegistrarRecepcionDeItemUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacion,
        fakeTxRunner(),
        fakeEntradaInsumo(),
      ) as RegistrarRecepcionDeItemUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
        cantidadRecibida: 1,
        fecha: FECHA_BASE,
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'RECEPCION_REGISTRADA' }),
      );
    });

    // Capa 3 del wiring para la dependencia NUEVA (insumos-entrega-3, unidad
    // 5): el `inject[]` puede declarar `RegistrarEntradaInsumoUseCase` y el
    // `useFactory` olvidarse de pasarlo al constructor. La metadata no ve esa
    // diferencia; el comportamiento sí.
    it('RegistrarRecepcionDeItemUseCase (wiring real): con insumo declarado, la entrada de stock wireada se invoca por el delta', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const itemConInsumo = itemFixture({
        insumoId: 'insumo-fixture-1',
        estadoAprobacion: 'APROBADO',
        decididoPorId: 'aprobador-1',
        decididoEn: FECHA_BASE,
        cantidadOrdenada: 2,
      });
      const compra = compraFixture([itemConInsumo]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };
      const entradaInsumo = fakeEntradaInsumo();

      const provider = getFactoryProvider(RegistrarRecepcionDeItemUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacion,
        fakeTxRunner(),
        entradaInsumo,
      ) as RegistrarRecepcionDeItemUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
        cantidadRecibida: 1,
        fecha: FECHA_BASE,
      });

      expect(result.isFail()).toBe(false);
      expect(entradaInsumo.execute).toHaveBeenCalledTimes(1);
      expect(entradaInsumo.execute).toHaveBeenCalledWith({
        insumoId: 'insumo-fixture-1',
        cantidad: 1,
        usuarioId: 'user-1',
        itemCompraId: ITEM_ID,
      });
    });

    it('RegistrarEntregaDeItemUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ENTREGA_REGISTRADA', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const itemComprado = itemFixture({
        estadoAprobacion: 'APROBADO',
        decididoPorId: 'aprobador-1',
        decididoEn: FECHA_BASE,
        cantidadOrdenada: 2,
        cantidadRecibida: 2,
      });
      const compra = compraFixture([itemComprado]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(RegistrarEntregaDeItemUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacion,
        fakeTxRunner(),
      ) as RegistrarEntregaDeItemUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
        cantidadEntregada: 1,
        fecha: FECHA_BASE,
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ENTREGA_REGISTRADA' }),
      );
    });

    it('EditarFechaEtapaDeItemUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ITEM_EDITADO', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
      const itemConOrden = itemFixture({
        estadoAprobacion: 'APROBADO',
        decididoPorId: 'aprobador-1',
        decididoEn: FECHA_BASE,
        cantidadOrdenada: 2,
        fechaOrden: FECHA_BASE,
      });
      const compra = compraFixture([itemConOrden]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(EditarFechaEtapaDeItemUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacion,
        fakeTxRunner(),
      ) as EditarFechaEtapaDeItemUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
        etapa: 'ORDEN',
        fecha: FECHA_BASE,
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ITEM_EDITADO' }),
      );
    });

    it('CerrarItemConFaltanteUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo ITEM_CERRADO_CON_FALTANTE', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacionCompra = new RegistrarOperacionCompra(operacionRepo);
      const itemConFaltante = itemFixture({
        estadoAprobacion: 'APROBADO',
        decididoPorId: 'aprobador-1',
        decididoEn: FECHA_BASE,
        cantidadOrdenada: 2,
        cantidadRecibida: 1, // < cantidad (2) — faltante real, S23
      });
      const compra = compraFixture([itemConFaltante]);
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardarItem: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(CerrarItemConFaltanteUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacionCompra,
        fakeTxRunner(),
      ) as CerrarItemConFaltanteUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        itemId: ITEM_ID,
        usuarioId: 'user-1',
        motivo: 'Proveedor sin stock',
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ITEM_CERRADO_CON_FALTANTE' }),
      );
    });

    it('CancelarCompraUseCase (wiring real): execute() exitoso llama a la bitácora 1 vez con tipo CANCELACION', async () => {
      const operacionRepo = fakeOperacionRepo();
      const registrarOperacionCompra = new RegistrarOperacionCompra(operacionRepo);
      const compra = compraFixture([]); // S31: cancelar sin ítems está PERMITIDO
      const compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardar'> = {
        findByIdConItems: vi.fn().mockResolvedValue(compra),
        guardar: vi.fn().mockResolvedValue(undefined),
      };

      const provider = getFactoryProvider(CancelarCompraUseCase);
      const instance = provider.useFactory(
        compraRepo,
        registrarOperacionCompra,
        fakeTxRunner(),
      ) as CancelarCompraUseCase;

      const result = await instance.execute({
        compraId: COMPRA_ID,
        usuarioId: 'user-1',
        motivo: 'Ya no se necesita',
      });

      expect(result.isFail()).toBe(false);
      expect(operacionRepo.crear).toHaveBeenCalledTimes(1);
      expect(operacionRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'CANCELACION' }),
      );
    });
  });
});
