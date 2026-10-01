/**
 * [INTEGRATION] El enganche entre la recepción de una compra y la bitácora de
 * existencias, contra Postgres REAL (`soporte_tenant_test`).
 *
 * **Por qué NO puede ser un mock.** `RegistrarEntradaInsumoUseCase` devuelve
 * `Result` y no lanza, y `$transaction` de Prisma solo revierte ante una
 * EXCEPCIÓN. Si el enganche propagara ese `Result.fail` sin lanzar, Postgres
 * comitearía la recepción sin el movimiento de stock —la pérdida silenciosa
 * que la decisión 3 del diseño descartó— y un `txRunner` de mentira comitearía
 * igual: el verde mentiría justo en el caso que importa. Acá se persiste una
 * compra REAL con `PrismaCompraRepository`, dentro de una transacción REAL
 * abierta por `PrismaTenantTransactionRunner`, con la entrada de stock REAL; y
 * después se consulta la fila DIRECTO contra la base, fuera de toda
 * transacción, para ver qué quedó.
 *
 * Es el mismo mecanismo y el mismo molde que
 * `registrar-operacion-compra.s36.integration.spec.ts`, que prueba S36 para la
 * bitácora de compras: el `throw` propaga hasta el callback de
 * `client.$transaction(...)`, que lo rechaza, y Postgres revierte TODO lo que
 * se escribió en esa transacción.
 *
 * El fallo de la entrada se provoca con un camino REAL del caso de uso —un
 * insumo con baja lógica, que `validarInsumoElegible` rechaza— y no con un
 * repositorio saboteado: así el error que vuelve es el que un usuario podría
 * llegar a ver, y el assert nombra su `code`.
 *
 * HIGIENE DE DB: la base de test es COMPARTIDA. Fixtures propios prefijados
 * `RECSTK_*`, `CicloCliente` con `activo: false` para no ensuciar el
 * `findActive()` de otras suites, y `afterAll` que borra EXACTAMENTE lo creado
 * por esta suite en orden de FK — nunca un TRUNCATE global.
 *
 * Ref design: openspec/changes/insumos-entrega-3/design.md, decisiones 1, 3, 4 y 6.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { construirEntradaReal } from '../../../insumos/testing/entrada-insumo-real';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import {
  ITenantTransactionRunner,
  PrismaTenantTransactionRunner,
} from '../../../shared/infrastructure/persistence/tenant-transaction-runner';

import { PrismaCompraRepository } from '../../infrastructure/persistence/prisma/prisma-compra.repository';
import { PrismaOperacionCompraRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import { RegistrarRecepcionDeItemUseCase } from './registrar-recepcion-de-item.use-case';

import { PrismaFamiliaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

/** Fecha de la orden del ítem de fixture; la recepción va un día después. */
const FECHA_ORDEN = new Date('2026-08-02');
const FECHA_RECEPCION = new Date('2026-08-03');

describe('Recepción de compra → entrada de stock (insumos-entrega-3, unidades 5 y 6)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: ITenantTransactionRunner;
  let compraRepo: PrismaCompraRepository;
  let operacionRepo: PrismaOperacionCompraRepository;
  let insumoRepo: PrismaInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;
  let familiaInsumoRepo: PrismaFamiliaInsumoRepository;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `RECSTK_${randomBytes(2).toString('hex')}`;

  /** Quien registra la recepción: soft ref a `master.usuarios.id`, sin FK. */
  const usuarioId = randomUUID();

  let familiaId: string;
  let unidadMedidaId: string;
  let cicloId: string;
  let compraId: string;

  /** Insumo vigente y habilitado: el camino feliz. */
  let insumoVigenteId: string;
  /** Insumo con baja lógica: `validarInsumoElegible` lo rechaza y la entrada falla. */
  let insumoDadoDeBajaId: string;
  /** Insumo deshabilitado: la decisión 1 dice que NO bloquea la recepción. */
  let insumoDeshabilitadoId: string;

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: `${PREFIJO}-cliente` },
      fn,
    );
  }

  /**
   * Arma el caso de uso con TODAS sus dependencias reales: repos Prisma,
   * transacción real y la entrada de stock real. Ningún doble.
   */
  function makeUseCase(): RegistrarRecepcionDeItemUseCase {
    return new RegistrarRecepcionDeItemUseCase(
      compraRepo,
      new RegistrarOperacionCompra(operacionRepo),
      txRunner,
      construirEntradaReal({
        tenantContext,
        txRunner: txRunner,
        insumoRepo,
        movimientoRepo,
        familiaRepo: familiaInsumoRepo,
      }),
    );
  }

  async function crearInsumo(sufijo: string, extra: { activo?: boolean; baja?: boolean } = {}) {
    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}_${sufijo}`,
        nombre: `Insumo de test ${sufijo}`,
        familiaId,
        unidadMedidaId,
        activo: extra.activo ?? true,
        deletedAt: extra.baja === true ? new Date('2026-08-01') : null,
      },
    });
    return insumo.id;
  }

  /**
   * Crea un ítem APROBADO con la orden ya registrada — el único estado desde
   * el que `registrarRecepcion()` acepta avanzar.
   *
   * @param insumoIdDelItem Insumo del catálogo, o `null` para el ítem
   *   histórico de texto libre.
   * @param cantidadRecibida Acumulado previo, para los casos de reenvío.
   */
  async function crearItemOrdenado(
    insumoIdDelItem: string | null,
    cantidadRecibida = 0,
  ): Promise<string> {
    const item = await tenantClient.itemCompra.create({
      data: {
        compraId,
        descripcion: 'Ítem de test',
        insumoId: insumoIdDelItem,
        cantidad: 10,
        proveedor: 'Proveedor de test',
        monto: 1000,
        fechaCotizacion: new Date('2026-08-01'),
        estadoAprobacion: 'APROBADO',
        decididoPorId: usuarioId,
        decididoEn: FECHA_ORDEN,
        cantidadOrdenada: 8,
        cantidadRecibida,
        fechaOrden: FECHA_ORDEN,
        fechaRecepcion: cantidadRecibida > 0 ? FECHA_RECEPCION : null,
      },
    });
    return item.id;
  }

  /** Lee la fila del ítem tal como quedó en la base, fuera de toda transacción. */
  function filaDelItem(itemId: string) {
    return tenantClient.itemCompra.findUniqueOrThrow({ where: { id: itemId } });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    compraRepo = new PrismaCompraRepository(tenantContext);
    operacionRepo = new PrismaOperacionCompraRepository(tenantContext);
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);
    familiaInsumoRepo = new PrismaFamiliaInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}_FAM`, nombre: 'Familia de test' },
    });
    familiaId = familia.id;

    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}_UN`, nombre: 'Unidad de test' },
    });
    unidadMedidaId = unidad.id;

    insumoVigenteId = await crearInsumo('VIGENTE');
    insumoDadoDeBajaId = await crearInsumo('BAJA', { baja: true });
    insumoDeshabilitadoId = await crearInsumo('DESHABILITADO', { activo: false });

    // `activo: false` a propósito: `findActive()` resuelve el ciclo vigente con
    // un `findFirst` sin `orderBy`, así que un ciclo activo de más en la base
    // compartida vuelve intermitente a cualquier spec que lo consulte.
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: randomUUID(),
        nombre: `${PREFIJO} ciclo`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
      },
    });
    cicloId = ciclo.id;

    const compra = await tenantClient.compra.create({
      data: {
        numero: PREFIJO.slice(0, 20),
        fechaSolicitud: new Date('2026-08-01'),
        motivo: 'Compra de test del enganche con stock',
        solicitanteId: usuarioId,
        cicloId,
      },
    });
    compraId = compra.id;
  }, 30_000);

  afterAll(async () => {
    try {
      // Orden por FKs: las hijas antes que las padres.
      await tenantClient.movimientoInsumo.deleteMany({ where: { usuarioId } });
      await tenantClient.operacionCompra.deleteMany({ where: { compraId } });
      await tenantClient.itemCompra.deleteMany({ where: { compraId } });
      await tenantClient.compra.deleteMany({ where: { id: compraId } });
      await tenantClient.cicloCliente.deleteMany({ where: { id: cicloId } });
      await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
      await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
      await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    } finally {
      await prismaService.onModuleDestroy();
    }
  }, 30_000);

  // ─── El caso que da nombre al archivo ────────────────────────────────────

  it('[CRITICAL] si la entrada de stock falla, la recepción NO queda en la base: rollback real de Postgres', async () => {
    const itemId = await crearItemOrdenado(insumoDadoDeBajaId);
    const useCase = makeUseCase();

    const result = await withTenant(() =>
      useCase.execute({
        compraId,
        itemId,
        usuarioId,
        cantidadRecibida: 4,
        fecha: FECHA_RECEPCION,
      }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');

    // Verificación DIRECTA contra Postgres, fuera de la transacción que hizo
    // rollback. Las tres escrituras de la recepción tienen que haber
    // desaparecido: si el enganche propagara el `Result.fail` sin lanzar, las
    // dos primeras estarían acá y el stock se habría perdido en silencio.
    const fila = await filaDelItem(itemId);
    expect(Number(fila.cantidadRecibida)).toBe(0);
    expect(fila.fechaRecepcion).toBeNull();

    const operaciones = await tenantClient.operacionCompra.findMany({
      where: { itemCompraId: itemId },
    });
    expect(operaciones).toHaveLength(0);

    const movimientos = await tenantClient.movimientoInsumo.findMany({
      where: { itemCompraId: itemId },
    });
    expect(movimientos).toHaveLength(0);
  });

  // Hermano invertido del anterior, y sobre el MISMO circuito real: sin este
  // caso, un enganche que fallara SIEMPRE dejaría el test de arriba en verde
  // sin haber probado que la recepción alguna vez comitea.
  it('con la entrada exitosa, la recepción, la bitácora y el movimiento quedan los tres en la base', async () => {
    const itemId = await crearItemOrdenado(insumoVigenteId);
    const useCase = makeUseCase();

    const result = await withTenant(() =>
      useCase.execute({
        compraId,
        itemId,
        usuarioId,
        cantidadRecibida: 4,
        fecha: FECHA_RECEPCION,
      }),
    );

    expect(result.isOk()).toBe(true);

    const fila = await filaDelItem(itemId);
    expect(Number(fila.cantidadRecibida)).toBe(4);

    const operaciones = await tenantClient.operacionCompra.findMany({
      where: { itemCompraId: itemId },
    });
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0].tipo).toBe('RECEPCION_REGISTRADA');

    const movimientos = await tenantClient.movimientoInsumo.findMany({
      where: { itemCompraId: itemId },
    });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].tipo).toBe('ENTRADA');
    expect(Number(movimientos[0].cantidad)).toBe(4);
    expect(movimientos[0].insumoId).toBe(insumoVigenteId);
    expect(movimientos[0].usuarioId).toBe(usuarioId);
    // La decisión de esta unidad: la trazabilidad va en `itemCompraId`, que es
    // dato estructurado, y no repetida como prosa en el motivo.
    expect(movimientos[0].motivo).toBeNull();
  });

  // ─── Decisión 1: el insumo deshabilitado no bloquea la recepción ─────────

  it('un insumo DESHABILITADO no bloquea la recepción: la entrada se asienta igual', async () => {
    const itemId = await crearItemOrdenado(insumoDeshabilitadoId);
    const useCase = makeUseCase();

    const result = await withTenant(() =>
      useCase.execute({
        compraId,
        itemId,
        usuarioId,
        cantidadRecibida: 2,
        fecha: FECHA_RECEPCION,
      }),
    );

    expect(result.isOk()).toBe(true);

    const movimientos = await tenantClient.movimientoInsumo.findMany({
      where: { itemCompraId: itemId },
    });
    expect(movimientos).toHaveLength(1);
    expect(Number(movimientos[0].cantidad)).toBe(2);
  });

  // Hermano invertido: el guard SIGUE VIVO sobre el MISMO insumo. Lo que lo
  // exime es el origen —el `itemCompraId` de la recepción—, no que el guard
  // haya dejado de existir. Sin este caso, un guard borrado por completo
  // dejaría el test de arriba en verde.
  it('el mismo insumo deshabilitado sigue rechazando la entrada MANUAL, sin origen de compra', async () => {
    const entrada = construirEntradaReal({
      tenantContext,
      txRunner: txRunner,
      insumoRepo,
      movimientoRepo,
      familiaRepo: familiaInsumoRepo,
    });

    const result = await withTenant(() =>
      entrada.execute({ insumoId: insumoDeshabilitadoId, cantidad: 2, usuarioId }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_DESHABILITADO');
  });

  // ─── Decisión 6: el ítem histórico sin insumo funciona como ayer ─────────

  it('un ítem SIN insumo se recibe igual y no deja ningún movimiento', async () => {
    const itemId = await crearItemOrdenado(null);
    const useCase = makeUseCase();

    const result = await withTenant(() =>
      useCase.execute({
        compraId,
        itemId,
        usuarioId,
        cantidadRecibida: 5,
        fecha: FECHA_RECEPCION,
      }),
    );

    expect(result.isOk()).toBe(true);

    const fila = await filaDelItem(itemId);
    expect(Number(fila.cantidadRecibida)).toBe(5);

    const movimientos = await tenantClient.movimientoInsumo.findMany({
      where: { itemCompraId: itemId },
    });
    expect(movimientos).toHaveLength(0);
  });

  // ─── Decisión 4: el delta, y la idempotencia que trae ────────────────────

  it('reenviar el mismo acumulado no agrega un segundo movimiento (delta cero)', async () => {
    const itemId = await crearItemOrdenado(insumoVigenteId, 3);
    const useCase = makeUseCase();

    const result = await withTenant(() =>
      useCase.execute({
        compraId,
        itemId,
        usuarioId,
        cantidadRecibida: 3,
        fecha: FECHA_RECEPCION,
      }),
    );

    expect(result.isOk()).toBe(true);

    const movimientos = await tenantClient.movimientoInsumo.findMany({
      where: { itemCompraId: itemId },
    });
    expect(movimientos).toHaveLength(0);
  });

  // Hermano invertido del anterior, sobre un ítem con el MISMO acumulado
  // previo: lo que emite es la diferencia, no el acumulado.
  it('un acumulado mayor emite un movimiento por la DIFERENCIA, no por el total', async () => {
    const itemId = await crearItemOrdenado(insumoVigenteId, 3);
    const useCase = makeUseCase();

    const result = await withTenant(() =>
      useCase.execute({
        compraId,
        itemId,
        usuarioId,
        cantidadRecibida: 7.5,
        fecha: FECHA_RECEPCION,
      }),
    );

    expect(result.isOk()).toBe(true);

    const movimientos = await tenantClient.movimientoInsumo.findMany({
      where: { itemCompraId: itemId },
    });
    expect(movimientos).toHaveLength(1);
    expect(Number(movimientos[0].cantidad)).toBe(4.5);
  });
});
