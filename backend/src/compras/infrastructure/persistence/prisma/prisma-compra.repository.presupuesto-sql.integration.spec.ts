/**
 * PR-12 [INTEGRATION] — RED→GREEN: S32, presupuesto de sentencias SQL.
 *
 * `findAllConItems` debe resolver UNA página en MÁXIMO 2 sentencias SQL
 * (spec §4.9: "1 para las compras+items vía `include`, otra para el `count`
 * de paginación, si el caller lo necesita" — este spec mide SOLO
 * `findAllConItems`, sin `count`, así que el presupuesto real esperado acá
 * es 1). Medido de VERDAD contando las sentencias emitidas por Prisma vía
 * `$on('query', ...)` — no por inspección del código fuente.
 *
 * `PrismaService.getTenantClient()`/`TenantContext` NO exponen el evento
 * `query` (el cliente se construye sin `log` configurado) — este spec
 * instancia su PROPIO `TenantPrismaClient` con
 * `log: [{ level: 'query', emit: 'event' }]`, reutilizando
 * `PrismaService.buildTenantUrl()` (método público existente) para la
 * connection string, mismo criterio que
 * `prisma-compra.repository.concurrencia.integration.spec.ts` (PR-11) usó
 * para reusar infraestructura sin duplicarla ni tocar `prisma.service.ts`.
 *
 * HIGIENE DE DB: fixtures propios (`PR12TESTSQL_*`), `CicloCliente` con
 * `activo: false`, `afterAll` que borra EXACTAMENTE lo creado por esta
 * suite.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9 (S32). Ref design: ADR-C2.
 * Tarea: PR-12.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaCompraRepository } from './prisma-compra.repository';
import { CompraEntity } from '../../../domain/entities/compra.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr12-sql-budget';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

/** Presupuesto duro de S32: máximo de sentencias SQL por página de `findAllConItems`. */
const PRESUPUESTO_MAXIMO_SENTENCIAS = 2;

describe('PrismaCompraRepository.findAllConItems — Presupuesto de sentencias SQL (S32)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let compraRepo: PrismaCompraRepository;
  let cicloId: string;
  const comprasIdsCreadas: string[] = [];
  let sentenciasEmitidas: string[] = [];

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `COM-2026-${RUN_PREFIX}${String(numeroCounter).padStart(2, '0')}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  async function crearCompraConItemFixture(): Promise<string> {
    const compra = CompraEntity.create({
      numero: nextNumero(),
      fechaSolicitud: new Date('2026-03-01'),
      motivo: 'Compra de test S32',
      descripcion: null,
      solicitanteId: DUMMY_USUARIO_ID,
      cicloId,
    });
    comprasIdsCreadas.push(compra.id);
    compra
      .agregarItem({
        descripcion: 'Item de presupuesto SQL',
        cantidad: 1,
        proveedor: 'Proveedor SA',
        monto: 100,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-03-01'),
        observaciones: null,
      })
      .getOrThrow();
    await withTenant(async () => {
      await compraRepo.guardar(compra);
      await compraRepo.guardarItem(compra.items[0]);
    });
    return compra.id;
  }

  beforeAll(async () => {
    // Reusa buildTenantUrl() (método público existente) — este PrismaService
    // NUNCA abre su propio pool de tenant, no interfiere con el cliente
    // instrumentado de abajo.
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);

    pool = new Pool({ connectionString: tenantUrl });
    const adapter = new PrismaPg(pool);
    tenantClient = new TenantPrismaClient({
      adapter,
      log: [{ level: 'query', emit: 'event' }],
    });
    // El tipado de PrismaClient con `log` configurado expone `$on('query', ...)`.
    tenantClient.$on('query', (event) => {
      sentenciasEmitidas.push(event.query);
    });

    tenantContext = new TenantContext();
    compraRepo = new PrismaCompraRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: `PR12TESTSQL_CICLO_${suffix}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
      },
    });
    cicloId = ciclo.id;

    await crearCompraConItemFixture();
  }, 30_000);

  afterAll(async () => {
    if (comprasIdsCreadas.length > 0) {
      await tenantClient.itemCompra.deleteMany({
        where: { compraId: { in: comprasIdsCreadas } },
      });
      await tenantClient.compra.deleteMany({ where: { id: { in: comprasIdsCreadas } } });
    }
    await tenantClient.cicloCliente.delete({ where: { id: cicloId } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(() => {
    // Limpia el contador ANTES de cada `it` — solo interesan las sentencias
    // emitidas por la llamada bajo test, no las del fixture de `beforeAll`.
    sentenciasEmitidas = [];
  });

  it(`[CRITICAL] resuelve una página con ítems incluidos en máximo ${PRESUPUESTO_MAXIMO_SENTENCIAS} sentencias SQL (medido con $on('query'))`, async () => {
    const pagina = await withTenant(() => compraRepo.findAllConItems({ limit: 10, offset: 0 }));

    expect(pagina.length).toBeGreaterThan(0);
    expect(pagina[0].items.length).toBeGreaterThan(0);

    console.info(
      `[S32] Sentencias SQL emitidas por findAllConItems: ${sentenciasEmitidas.length}` +
        ` -> ${JSON.stringify(sentenciasEmitidas)}`,
    );
    expect(sentenciasEmitidas.length).toBeLessThanOrEqual(PRESUPUESTO_MAXIMO_SENTENCIAS);
  }, 15_000);
});
