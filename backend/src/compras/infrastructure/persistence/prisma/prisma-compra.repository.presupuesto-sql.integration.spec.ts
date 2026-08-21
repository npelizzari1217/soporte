/**
 * PR-12/PR-20 [INTEGRATION] — RED→GREEN: S32, presupuesto de sentencias SQL.
 *
 * Una página completa (`findPaginaConItems`: las filas MÁS el `total` de
 * paginación) debe resolverse en MÁXIMO 3 sentencias SQL. Medido de VERDAD
 * contando las sentencias emitidas por Prisma vía `$on('query', ...)` — no
 * por inspección del código fuente.
 *
 * **EXCEPCIÓN DOCUMENTADA a S32 (el "2" original) — por qué 3 y no 2**:
 * S32 fijó "máximo 2 sentencias SQL por página" y esa regla fue escrita
 * CONTRA el patrón N+1 — la patología es la consulta POR FILA (o por
 * ítem), que crece linealmente con el tamaño de la página. Ninguna de las 3
 * sentencias de acá lo es: (1) el `$queryRaw` que resuelve filtro, grupo
 * derivado, orden, paginación y `total` devolviendo SÓLO ids; (2)+(3) la
 * hidratación con `findMany` + `include` de ítems (una relación 1:N de
 * Prisma siempre emite el SELECT base más un SELECT de la relación, R17).
 * Tres sentencias FIJAS: no crecen con el tamaño de la página ni con la
 * cantidad de ítems por compra.
 *
 * **WU-25 (sdd/compras-orden-filtro-estado) — cambió QUÉ son las 3, no
 * cuántas.** Antes eran `findAllConItems` (2) + `count()` (1). Ahora el
 * grupo de estado es una expresión derivada de `(canceladaEn, items[])`,
 * que Prisma no puede ordenar ni filtrar declarativamente, así que la
 * selección de ids se resolvió en SQL crudo — y devolver el `total` desde
 * esa MISMA sentencia elimina por construcción la desincronización que S62
 * vigilaba.
 *
 * La objeción histórica a `COUNT(*) OVER()`
 * (`sdd/redisenio-modulo-compras/count-en-consulta`) NO aplica a esta
 * forma: (a) el SQL crudo devuelve ids, nunca filas que alimenten a
 * `CompraMapper.toDomain` (el mapper sigue recibiendo la forma camelCase de
 * `findMany`); (b) los enteros van casteados a `::int`, no llegan como
 * `bigint`; y (c) los ids viajan agregados con `array_agg`, así que la
 * consulta devuelve SIEMPRE exactamente una fila y el `total` llega incluso
 * con la página vacía.
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
 * Las mediciones de abajo llamaban al repositorio SIN el filtro de estado,
 * así que medían la forma VIEJA del `where` (sin el predicado derivado). El
 * camino de PRODUCCIÓN nunca se midió: `ListarComprasUseCase` fuerza
 * SIEMPRE un `grupoEstado` (default `ACTIVAS`) y agrega filtros de
 * fecha/sector cuando el caller los manda (R7/R11).
 * `resoluciones-pre-apply` §3 pidió medir el camino real; el apply-progress
 * previo reportó "MEDIDO" sin haberlo hecho.
 *
 * Los `it` de abajo llaman con `grupoEstado: 'ACTIVAS'` MÁS
 * `fechaDesde`/`fechaHasta`/`sectorId` (el trío completo de filtros de
 * R7/R11) — es el filtro real que arma `ListarComprasUseCase.execute()` con
 * esos 3 presentes.
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
import { CompraListFiltros } from '../../../domain/ports/i-compra.repository';
import { CompraEntity } from '../../../domain/entities/compra.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr12-sql-budget';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

/**
 * Presupuesto duro de una página completa: 1 sentencia de ids+total +
 * 2 de hidratación (`findMany` con `include`, R17). Total: 3, NO 2 —
 * excepción documentada a S32, ver JSDoc del archivo.
 */
const PRESUPUESTO_MAXIMO_SENTENCIAS = 3;

/**
 * Construye el cliente instrumentado con `log: [{ level: 'query', emit: 'event' }] as const`.
 * El `as const` es necesario para que Prisma infiera el tipo literal `'query'`
 * en `$on()` — sin él, `ClientOptions['log']` se ensancha a `LogDefinition[]`
 * genérico y `$on('query', ...)` tipa el evento como `LogEvent` (sin
 * `.query`) en vez de `QueryEvent`. Encapsular la construcción en una función
 * y capturar el tipo vía `ReturnType` (en vez de `InstanceType<typeof TenantPrismaClient>`
 * a secas) preserva esa inferencia en la variable declarada más abajo.
 */
function crearClienteInstrumentado(adapter: PrismaPg) {
  return new TenantPrismaClient({
    adapter,
    log: [{ level: 'query', emit: 'event' }] as const,
  });
}

describe('PrismaCompraRepository.findPaginaConItems — Presupuesto de sentencias SQL (S32)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: ReturnType<typeof crearClienteInstrumentado>;
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
    // explícito) — la compra queda en el grupo ACTIVAS (`nP >= 1`), que es
    // lo que pide el filtro real de producción (fix C2).
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
    tenantClient = crearClienteInstrumentado(adapter);
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
   * Filtros REALES de `ListarComprasUseCase.execute()`: `grupoEstado` con su
   * default (`ACTIVAS`) más fecha/sector presentes (fix C2) — NO el filtro
   * desnudo. `fechaDesde`/`fechaHasta` encierran el `fechaSolicitud` del
   * fixture ('2026-03-01'); `sectorId` es el sector real creado en
   * `beforeAll`.
   */
  function filtrosCaminoReal(): CompraListFiltros {
    return {
      grupoEstado: 'ACTIVAS',
      fechaDesde: new Date('2026-01-01'),
      fechaHasta: new Date('2026-12-31'),
      sectorId,
    };
  }

  it(`[CRITICAL] una página completa (filas + total) resuelve en EXACTAMENTE ${PRESUPUESTO_MAXIMO_SENTENCIAS} sentencias SQL — camino real de producción (grupoEstado+fechas+sector, medido con $on('query'))`, async () => {
    const { compras, total } = await withTenant(() =>
      compraRepo.findPaginaConItems({ limit: 10, offset: 0, ...filtrosCaminoReal() }),
    );

    expect(compras.length).toBeGreaterThan(0);
    expect(compras[0].items.length).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(compras.length);

    console.info(
      `[S32][camino real] Sentencias SQL emitidas por findPaginaConItems: ${sentenciasEmitidas.length}` +
        ` -> ${JSON.stringify(sentenciasEmitidas)}`,
    );
    // Medido con el filtro REAL que arma producción (grupoEstado+fechas+
    // sector) — si esto no da exactamente 3, el presupuesto de S32 NO se
    // toca: se reporta el número real como "needs human review" (fix C2, ver
    // verify-report).
    expect(sentenciasEmitidas.length).toBe(PRESUPUESTO_MAXIMO_SENTENCIAS);
  }, 15_000);

  it('[CRITICAL] una página VACÍA (offset más allá del total) resuelve en 1 sola sentencia y aun así trae el total', async () => {
    const { compras, total } = await withTenant(() =>
      compraRepo.findPaginaConItems({ limit: 10, offset: 100_000, ...filtrosCaminoReal() }),
    );

    expect(compras).toEqual([]);
    // El total NO depende de que la página tenga filas — `array_agg` deja la
    // sentencia devolviendo siempre exactamente una fila.
    expect(total).toBeGreaterThan(0);

    console.info(
      `[S32][página vacía] Sentencias SQL emitidas: ${sentenciasEmitidas.length}` +
        ` -> ${JSON.stringify(sentenciasEmitidas)}`,
    );
    // Sin ids que hidratar, el `findMany` se saltea entero.
    expect(sentenciasEmitidas.length).toBe(1);
  }, 15_000);
});
