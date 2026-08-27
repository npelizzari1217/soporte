/**
 * PR-13 [INTEGRATION] — RED→GREEN: S36 contra Postgres REAL
 * (`soporte_tenant_test`). "Si falla la escritura de la operación, la
 * mutación se revierte (rollback completo)" — spec §4.10.
 *
 * **Por qué NO es un mock**: el punto entero de S36 es que el rollback lo
 * hace POSTGRES (`client.$transaction` rechaza y revierte), no el código de
 * la aplicación. Un mock del repo de `Compra` no probaría nada — probaría
 * que un spy fue llamado. Acá se persiste una `Compra` REAL con
 * `PrismaCompraRepository` (PR-11) dentro de una transacción REAL abierta
 * por `PrismaTenantTransactionRunner` (`shared/infrastructure/persistence/
 * tenant-transaction-runner.ts`), y luego se consulta la fila DIRECTO contra
 * la DB — fuera de cualquier `withTenant`/tx en memoria — para verificar que
 * la mutación NO quedó.
 *
 * El HECHO LOAD-BEARING (design, ADR-C4/encabezado): `PrismaTenantTransactionRunner.run()`
 * re-bindea `TenantContext` con el cliente `tx`, así que cualquier repo que
 * resuelva `TenantContext.getClient()` DENTRO del callback entra en la MISMA
 * transacción sin plumbing. El repo de bitácora de este test es un FAKE que
 * NO usa `TenantContext` (no necesita persistir nada real, solo debe
 * fallar), pero corre en el mismo callback que `PrismaCompraRepository.guardar()`
 * — cuando `RegistrarOperacionCompra.registrar()` lanza, ese `throw`
 * propaga hasta el callback de `$transaction`, que lo rechaza y Postgres
 * revierte TODO lo que se escribió en esa transacción, incluida la
 * cancelación de la compra.
 *
 * Se declara acá, dentro del spec (no en `application/use-cases/`, que es
 * alcance de PR-14 en adelante), el MÍNIMO caso de uso mutador necesario
 * para ejercitar el flujo real: `UseCaseMutadorDePruebaS36` cancela una
 * `Compra` de fixture y llama a `registrar()` en la misma transacción —
 * ningún caso de uso mutador real existe todavía en el árbol.
 *
 * HIGIENE DE DB (regla dura del orquestador): DB compartida, fixtures
 * propios (`PR13TEST_*`), `CicloCliente` propio con `activo: false`,
 * `afterAll` con `try/finally` que borra EXACTAMENTE lo creado por esta
 * suite.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S36). Ref design:
 * ADR-C4 (encabezado, "HECHO LOAD-BEARING"). Tarea: PR-13.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import {
  ITenantTransactionRunner,
  PrismaTenantTransactionRunner,
} from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaCompraRepository } from '../../infrastructure/persistence/prisma/prisma-compra.repository';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { IOperacionCompraRepository } from '../../domain/ports/i-operacion-compra.repository';
import { RegistrarOperacionCompra } from './registrar-operacion-compra';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

/**
 * UseCaseMutadorDePruebaS36 — el MÍNIMO caso de uso mutador necesario para
 * ejercitar S36 de punta a punta. NO es un caso de uso real del catálogo de
 * 10 (esos son PR-14..PR-18) — vive únicamente en este spec, declarado como
 * tal. Cancela la compra de fixture (mutación simple de una sola entidad,
 * sin ítems) y registra la operación en la MISMA transacción.
 */
class UseCaseMutadorDePruebaS36 {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardar'>,
    private readonly registrarOperacion: RegistrarOperacionCompra,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async ejecutar(compraId: string, usuarioId: string, motivoCancelacion: string): Promise<void> {
    await this.txRunner.run(async () => {
      const compra = await this.compraRepo.findByIdConItems(compraId);
      if (!compra) {
        throw new Error('UseCaseMutadorDePruebaS36: compra de fixture no encontrada.');
      }
      compra.cancelar(usuarioId, motivoCancelacion).getOrThrow();
      await this.compraRepo.guardar(compra);

      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: null,
        tipo: 'CANCELACION',
        usuarioId,
        detalle: motivoCancelacion,
        datos: null,
      });
    });
  }
}

describe('S36 — rollback real de la mutacion si falla la bitacora (PR-13)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let compraRepo: PrismaCompraRepository;
  let txRunner: ITenantTransactionRunner;
  let cicloId: string;
  const comprasIdsCreadas: string[] = [];

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `COM-2026-${RUN_PREFIX}${String(numeroCounter).padStart(2, '0')}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-pr13' },
      fn,
    );
  }

  function makeCompra(): CompraEntity {
    const compra = CompraEntity.create({
      numero: nextNumero(),
      fechaSolicitud: new Date('2026-03-01'),
      motivo: 'Compra de test PR-13 (S36)',
      descripcion: null,
      solicitanteId: DUMMY_USUARIO_ID,
      cicloId,
    });
    comprasIdsCreadas.push(compra.id);
    return compra;
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    compraRepo = new PrismaCompraRepository(tenantContext);
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

    const suffix = randomBytes(3).toString('hex');
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: `PR13TEST_CICLO_${suffix}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        // activo: false — misma higiene de DB que PR-11/PR-12: evita que
        // findActive() de otra suite recoja un ciclo ajeno.
        activo: false,
      },
    });
    cicloId = ciclo.id;
  }, 30_000);

  afterAll(async () => {
    try {
      if (comprasIdsCreadas.length > 0) {
        await tenantClient.operacionCompra.deleteMany({
          where: { compraId: { in: comprasIdsCreadas } },
        });
        await tenantClient.itemCompra.deleteMany({
          where: { compraId: { in: comprasIdsCreadas } },
        });
        await tenantClient.compra.deleteMany({ where: { id: { in: comprasIdsCreadas } } });
      }
    } finally {
      await tenantClient.cicloCliente.delete({ where: { id: cicloId } });
      await prismaService.onModuleDestroy();
    }
  }, 30_000);

  it('[S36][CRITICAL] si el repo de bitacora falla, la mutacion NO queda en la DB (rollback real via Postgres, sin mock)', async () => {
    const compra = makeCompra();
    await withTenant(async () => {
      await compraRepo.guardar(compra);
    });

    const errorBitacora = new Error('Fallo simulado al escribir la bitacora');
    const bitacoraQueFalla: Pick<IOperacionCompraRepository, 'crear'> = {
      crear: vi.fn().mockRejectedValue(errorBitacora),
    };
    const registrar = new RegistrarOperacionCompra(bitacoraQueFalla);
    const useCase = new UseCaseMutadorDePruebaS36(compraRepo, registrar, txRunner);

    await withTenant(() =>
      expect(
        useCase.ejecutar(compra.id, DUMMY_USUARIO_ID, 'Motivo de cancelacion de prueba S36'),
      ).rejects.toThrow(errorBitacora),
    );

    // Verificacion DIRECTA contra Postgres, fuera de la transaccion que
    // hizo rollback: la cancelacion NUNCA se persistio. Si $transaction no
    // hubiera hecho rollback, canceladaEn tendria un valor no-null acá.
    const rowPostRollback = await tenantClient.compra.findUniqueOrThrow({
      where: { id: compra.id },
    });
    expect(rowPostRollback.canceladaEn).toBeNull();
    expect(rowPostRollback.canceladoPorId).toBeNull();
    expect(rowPostRollback.motivoCancelacion).toBeNull();

    // Y tampoco quedo ninguna fila de bitacora (aunque el repo de bitacora
    // usado acá es un fake que no persiste — esto blinda contra un futuro
    // cambio donde alguien reordene el codigo y persista la compra DESPUES
    // de intentar la bitacora real).
    const operaciones = await tenantClient.operacionCompra.findMany({
      where: { compraId: compra.id },
    });
    expect(operaciones).toHaveLength(0);
  });

  it('[companion RED#3] con bitacora exitosa, ITenantTransactionRunner.run() se invoca EXACTAMENTE 1 vez (RegistrarOperacionCompra no abre la suya)', async () => {
    const compra = makeCompra();
    await withTenant(async () => {
      await compraRepo.guardar(compra);
    });

    const runSpy = vi.spyOn(txRunner, 'run');
    const bitacoraOk: Pick<IOperacionCompraRepository, 'crear'> = {
      crear: vi.fn().mockResolvedValue(undefined),
    };
    const registrar = new RegistrarOperacionCompra(bitacoraOk);
    const useCase = new UseCaseMutadorDePruebaS36(compraRepo, registrar, txRunner);

    await withTenant(() =>
      useCase.ejecutar(compra.id, DUMMY_USUARIO_ID, 'Motivo de cancelacion OK'),
    );

    // El unico llamado a run() es el que hace UseCaseMutadorDePruebaS36 al
    // abrir SU transaccion. Si RegistrarOperacionCompra abriera la propia,
    // este conteo seria 2.
    expect(runSpy).toHaveBeenCalledTimes(1);
    runSpy.mockRestore();

    const rowPostCommit = await tenantClient.compra.findUniqueOrThrow({
      where: { id: compra.id },
    });
    expect(rowPostCommit.canceladaEn).not.toBeNull();
  });
});
