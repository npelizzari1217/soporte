/**
 * PR-12/PR-20 [INTEGRATION] — RED→GREEN: S32, presupuesto de sentencias SQL.
 *
 * Una página completa (`findAllConItems` + `count()` para el `total` de
 * paginación) debe resolverse en MÁXIMO 3 sentencias SQL. Medido de VERDAD
 * contando las sentencias emitidas por Prisma vía `$on('query', ...)` — no
 * por inspección del código fuente.
 *
 * **EXCEPCIÓN DOCUMENTADA a S32 (el "2" original) — por qué 3 y no 2**:
 * S32 fijó "máximo 2 sentencias SQL por página" y esa regla fue escrita
 * CONTRA el patrón N+1 — la patología es la consulta POR FILA (o por
 * ítem), que crece linealmente con el tamaño de la página. `findAllConItems`
 * ya mide 2 sentencias fijas (`include` de una relación 1:N = SELECT base +
 * SELECT de la relación, R17, medido en este mismo spec). `count()` agrega
 * una 3ª sentencia, pero es **O(1)**: una única sentencia agregada que NO
 * crece con la cantidad de filas de la página ni con la cantidad de ítems
 * por compra. Tres sentencias FIJAS siguen respetando el espíritu de S32 —
 * la prohibición del N+1 sigue vigente sin excepciones; lo que cambia es
 * que se admite un tercer round-trip fijo y aislado para la metadata de
 * paginación (`total`), en vez de forzarlo dentro de las primeras dos.
 *
 * Se descartó `COUNT(*) OVER()` (window function) para mantener el "2"
 * literal — ver `sdd/redisenio-modulo-compras/count-en-consulta`: rompe el
 * contrato del mapper (columnas snake_case crudas vía `$queryRaw`), el
 * total deserializa `bigint`, y si la página pedida devuelve CERO filas la
 * window function no tiene fila donde llevar el total (el caso exacto en
 * que más se necesita). `count()` aislado y tipado evita las tres
 * fragilidades a cambio de UNA sentencia SQL adicional — el patrón estándar
 * de la industria (`findMany` + `count()` con el mismo `where`).
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
 * ── FIX post-verify C2 (sdd/compras-tres-etapas-y-sectores) ──
 *
 * Las dos mediciones de abajo llamaban `findAllConItems`/`count` SIN
 * `soloEnCurso`, así que medían la forma VIEJA del `where` — la que arma
 * `buildWhere()` cuando `filtros?.soloEnCurso` es falsy (sin el `OR` de tres
 * `some`/`none`). El camino de PRODUCCIÓN nunca se midió: `listar-compras.
 * use-case.ts:107` fuerza `soloEnCurso: dto.soloEnCurso ?? true` SIEMPRE
 * (default `true`) y agrega filtros de fecha/sector cuando el caller los
 * manda (R7/R11). `resoluciones-pre-apply` §3 pidió medir el camino real; el
 * apply-progress previo reportó "MEDIDO" sin haberlo hecho.
 *
 * Los dos `it` de abajo ahora llaman con `soloEnCurso: true` MÁS
 * `fechaDesde`/`fechaHasta`/`sectorId` (el trío completo de filtros de R7/R11
 * que agrega `buildWhere()` a la sentencia base) — es el `where` real que
 * arma `ListarComprasUseCase.execute()` con esos 3 filtros presentes.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9 (S32). Ref design: ADR-C2.
 * Ref verify: sdd/compras-tres-etapas-y-sectores/verify-report C2.
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

/**
 * Presupuesto duro de una página completa: `findAllConItems` (2 sentencias
 * fijas, R17) + `count()` (1 sentencia fija, O(1) — excepción documentada a
 * S32, ver JSDoc del archivo). Total: 3, NO 2.
 */
const PRESUPUESTO_MAXIMO_SENTENCIAS = 3;

describe('PrismaCompraRepository.findAllConItems — Presupuesto de sentencias SQL (S32)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let compraRepo: PrismaCompraRepository;
  let cicloId: string;
  let sectorId: string;
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
      sectorId,
    });
    comprasIdsCreadas.push(compra.id);
    // Ítem PENDIENTE (default de `agregarItem`, sin `estadoAprobacion`
    // explícito) — satisface el 1er término del OR de `soloEnCurso` (fix C2:
    // la compra tiene que quedar "en curso" para que el `where` real de
    // producción la devuelva).
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

    // Sector fixture (fix C2): el camino real de `ListarComprasUseCase`
    // acepta `sectorId` (R11) — sin esto, medir con ese filtro no era posible.
    const sector = await tenantClient.sector.create({
      data: { codigo: `PR12TESTSQL_SECTOR_${suffix}`, nombre: 'Sector presupuesto SQL' },
    });
    sectorId = sector.id;

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
    await tenantClient.sector.delete({ where: { id: sectorId } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(() => {
    // Limpia el contador ANTES de cada `it` — solo interesan las sentencias
    // emitidas por la llamada bajo test, no las del fixture de `beforeAll`.
    sentenciasEmitidas = [];
  });

  /**
   * Filtros REALES de `ListarComprasUseCase.execute()` con `soloEnCurso`
   * default (`true`) y fecha/sector presentes (fix C2) — NO el `where`
   * desnudo. `fechaDesde`/`fechaHasta` encierran el `fechaSolicitud` del
   * fixture ('2026-03-01'); `sectorId` es el sector real creado en
   * `beforeAll`.
   */
  function filtrosCaminoReal(): {
    soloEnCurso: true;
    fechaDesde: Date;
    fechaHasta: Date;
    sectorId: string;
  } {
    return {
      soloEnCurso: true,
      fechaDesde: new Date('2026-01-01'),
      fechaHasta: new Date('2026-12-31'),
      sectorId,
    };
  }

  it(`[CRITICAL] resuelve una página con ítems incluidos en máximo ${PRESUPUESTO_MAXIMO_SENTENCIAS} sentencias SQL (camino real: soloEnCurso+fechas+sector, medido con $on('query'))`, async () => {
    const pagina = await withTenant(() =>
      compraRepo.findAllConItems({ limit: 10, offset: 0, ...filtrosCaminoReal() }),
    );

    expect(pagina.length).toBeGreaterThan(0);
    expect(pagina[0].items.length).toBeGreaterThan(0);

    console.info(
      `[S32][camino real] Sentencias SQL emitidas por findAllConItems: ${sentenciasEmitidas.length}` +
        ` -> ${JSON.stringify(sentenciasEmitidas)}`,
    );
    expect(sentenciasEmitidas.length).toBeLessThanOrEqual(2);
  }, 15_000);

  it(`[CRITICAL] una página completa (findAllConItems + count) resuelve en EXACTAMENTE ${PRESUPUESTO_MAXIMO_SENTENCIAS} sentencias SQL — camino real de producción (soloEnCurso+fechas+sector, excepción documentada a S32)`, async () => {
    const [pagina, total] = await withTenant(() =>
      Promise.all([
        compraRepo.findAllConItems({ limit: 10, offset: 0, ...filtrosCaminoReal() }),
        compraRepo.count(filtrosCaminoReal()),
      ]),
    );

    expect(pagina.length).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(pagina.length);

    console.info(
      `[S32+count][camino real] Sentencias SQL emitidas por findAllConItems+count: ${sentenciasEmitidas.length}` +
        ` -> ${JSON.stringify(sentenciasEmitidas)}`,
    );
    // Medido con el `where` REAL que arma producción (soloEnCurso+fechas+
    // sector) — si esto no da exactamente 3, el presupuesto de S32 NO se
    // toca: se reporta el número real como "needs human review" (fix C2, ver
    // verify-report).
    expect(sentenciasEmitidas.length).toBe(PRESUPUESTO_MAXIMO_SENTENCIAS);
  }, 15_000);
});
