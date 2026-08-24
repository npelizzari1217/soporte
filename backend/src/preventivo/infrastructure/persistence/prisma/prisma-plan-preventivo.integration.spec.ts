/**
 * prisma-plan-preventivo.integration.spec.ts — WU-4 (4.1), integración
 * contra Postgres REAL (`soporte_tenant_test`, compartida — mismo patrón que
 * `prisma-equipos.integration.spec.ts`: fixtures prefijadas, cleanup
 * acotado por los ids creados en ESTA suite, nunca TRUNCATE global).
 *
 * Foco: `findVencibles(hoy)` — la query EXACTA del barrido (`activo AND
 * deleted_at IS NULL AND proxima_ejecucion_en <= hoy`). Se siembran CUATRO
 * planes con exactamente un eje distinto cada uno para que el filtro tenga
 * algo que excluir de verdad (instrucción del orquestador: "un test de
 * filtro con una sola fila pasa con cualquier WHERE, porque no hay nada que
 * excluir"). Mutación probada manualmente: comentar la cláusula `activo:
 * true` (o `deletedAt: null`, o `proximaEjecucionEn: {lte: hoy}`) en
 * `findVencibles` hace fallar este test — ver apply-progress-wu4.
 *
 * También cubre `actualizarProximaEjecucion` (escritura directa fuera del
 * alcance de la entidad, EditarPlanUseCase [R2]) y el roundtrip
 * guardar/buscarPorId/listar.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Baja de plan frena generación
 * sin borrar historial" [R4]. Ref design: ADR-PV1, ADR-PV2/PV3 (flujo de
 * datos, findVencibles). Tarea: 4.1.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaPlanPreventivoRepository } from './prisma-plan-preventivo.repository';
import { PlanPreventivoEntity } from '../../../domain/entities/plan-preventivo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_RESPONSABLE_ID = '01900000-0000-7000-8000-000000000101';

describe('PrismaPlanPreventivoRepository — Integration (4.1)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaPlanPreventivoRepository;

  let prioridadId: string;
  const planIdsCreados: string[] = [];

  const RUN_PREFIX = randomBytes(3).toString('hex');
  let planCounter = 0;
  function nextTitulo(): string {
    planCounter += 1;
    return `PLAN_PREV_TEST_${RUN_PREFIX}_${planCounter}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-prev' },
      fn,
    );
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    repo = new PrismaPlanPreventivoRepository(tenantContext);

    // Fixture propia (mismo patrón que prisma-equipos.integration.spec.ts):
    // `soporte_tenant_test` NO viene pre-sembrada, cada spec crea lo que
    // necesita y lo limpia en `afterAll`.
    const prioridad = await tenantClient.prioridad.create({
      data: { codigo: `TEST_PREV_${RUN_PREFIX}`, nombre: 'Prioridad test preventivo WU-4' },
    });
    prioridadId = prioridad.id;
  }, 60_000);

  afterAll(async () => {
    if (planIdsCreados.length > 0) {
      await tenantClient.preventivoGeneracion.deleteMany({
        where: { planId: { in: planIdsCreados } },
      });
      await tenantClient.planPreventivo.deleteMany({ where: { id: { in: planIdsCreados } } });
    }
    if (prioridadId) {
      await tenantClient.prioridad.delete({ where: { id: prioridadId } }).catch(() => undefined);
    }
    await prismaService.onModuleDestroy();
  }, 60_000);

  function makePlan(
    overrides: Partial<Parameters<typeof PlanPreventivoEntity.create>[0]> = {},
  ): PlanPreventivoEntity {
    const plan = PlanPreventivoEntity.create({
      titulo: nextTitulo(),
      instrucciones: null,
      equipoId: null,
      ubicacion: 'DEPOSITO CENTRAL',
      prioridadId,
      responsableId: DUMMY_RESPONSABLE_ID,
      intervaloValor: 7,
      intervaloUnidad: 'DIAS',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-08'),
      activo: true,
      ...overrides,
    }).getValue();
    planIdsCreados.push(plan.id);
    return plan;
  }

  it('guardar → buscarPorId roundtrip preserva todos los campos', async () => {
    const plan = makePlan();

    await withTenant(() => repo.guardar(plan));
    const encontrado = await withTenant(() => repo.buscarPorId(plan.id));

    expect(encontrado).not.toBeNull();
    expect(encontrado!.titulo).toBe(plan.titulo);
    expect(encontrado!.ubicacion).toBe('DEPOSITO CENTRAL');
    expect(encontrado!.intervaloValor).toBe(7);
    expect(encontrado!.intervaloUnidad).toBe('DIAS');
    expect(encontrado!.activo).toBe(true);
  });

  it('actualizarProximaEjecucion escribe directo, sin pasar por guardar()', async () => {
    const plan = makePlan();
    await withTenant(() => repo.guardar(plan));

    await withTenant(() => repo.actualizarProximaEjecucion(plan.id, new Date('2027-01-01')));

    const encontrado = await withTenant(() => repo.buscarPorId(plan.id));
    expect(encontrado!.proximaEjecucionEn).toEqual(new Date('2027-01-01'));
  });

  // ─── findVencibles: el filtro tiene que EXCLUIR, no solo incluir ─────────

  it('[R4] findVencibles devuelve SOLO el plan activo+no-eliminado+vencido — los otros tres quedan afuera', async () => {
    const hoy = new Date('2026-06-01');

    const vencibleActivo = makePlan({ proximaEjecucionEn: new Date('2026-05-01') });
    const vencibleInactivo = makePlan({
      proximaEjecucionEn: new Date('2026-05-01'),
      activo: false,
    });
    const vencibleEliminado = makePlan({ proximaEjecucionEn: new Date('2026-05-01') });
    const noVencidoTodavia = makePlan({ proximaEjecucionEn: new Date('2026-12-01') });

    await withTenant(() => repo.guardar(vencibleActivo));
    await withTenant(() => repo.guardar(vencibleInactivo));
    await withTenant(() => repo.guardar(vencibleEliminado));
    await withTenant(() => repo.guardar(noVencidoTodavia));
    // [R4] baja lógica real (softDelete) del tercer plan — no un DELETE físico.
    vencibleEliminado.softDelete();
    await withTenant(() => repo.guardar(vencibleEliminado));

    const vencibles = await withTenant(() => repo.findVencibles(hoy));
    const idsVencibles = vencibles.map((p) => p.id);

    expect(idsVencibles).toContain(vencibleActivo.id);
    expect(idsVencibles).not.toContain(vencibleInactivo.id);
    expect(idsVencibles).not.toContain(vencibleEliminado.id);
    expect(idsVencibles).not.toContain(noVencidoTodavia.id);
  });

  it('listar() excluye los soft-deleted pero incluye los inactivos (activo=false sigue visible en el ABM)', async () => {
    const inactivo = makePlan({ activo: false });
    const eliminado = makePlan();
    await withTenant(() => repo.guardar(inactivo));
    await withTenant(() => repo.guardar(eliminado));
    eliminado.softDelete();
    await withTenant(() => repo.guardar(eliminado));

    const listado = await withTenant(() => repo.listar());
    const ids = listado.map((p) => p.id);

    expect(ids).toContain(inactivo.id);
    expect(ids).not.toContain(eliminado.id);
  });
});
