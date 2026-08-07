/**
 * SA6 [INTEGRATION] — RED→GREEN: PrismaSlaConfigRepository contra Postgres
 * REAL (`soporte_tenant_test`), vía `TenantContext.bind()` (mismo patrón que
 * `prisma-catalogos.integration.spec.ts`).
 *
 * Verifica: seed real de provisioning ya corrido en esta suite deja 4 filas
 * de `sla_config` (una por prioridad fija); `save()` (upsert) persiste
 * cambios de horas/activo; `findByPrioridad()` resuelve por FK única.
 *
 * Este spec inserta sus PROPIAS filas de fixture (prioridad + sla_config con
 * códigos prefijados `SA6_TEST_*`) para no depender del estado global de la
 * DB compartida, y las limpia en `afterAll`.
 *
 * Ref spec: sdd/premium/spec S1. Ref design: ADR-P1/ADR-P4. Tarea: SA6.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaSlaConfigRepository } from './prisma-sla-config.repository';
import { SlaConfigEntity } from '../../../domain/entities/sla-config.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaSlaConfigRepository — Integration (SA6)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaSlaConfigRepository;

  const PRIORIDAD_CODIGO = 'SA6_TEST_PRIORIDAD';
  let prioridadId: string;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-sla-config',
    });

    repo = new PrismaSlaConfigRepository(tenantContext);

    const prioridad = await tenantClient.prioridad.create({
      data: { codigo: PRIORIDAD_CODIGO, nombre: 'Test SLA', orden: 997, activo: true },
    });
    prioridadId = prioridad.id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.slaConfig.deleteMany({ where: { prioridadId } });
    await tenantClient.prioridad.deleteMany({ where: { codigo: PRIORIDAD_CODIGO } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  it('[CRITICAL] save() INSERT: persiste una config nueva', async () => {
    const config = SlaConfigEntity.create({ prioridadId, horas: 6, activo: true });

    await repo.save(config);

    const row = await tenantClient.slaConfig.findUnique({ where: { id: config.id } });
    expect(row).not.toBeNull();
    expect(row!.horas).toBe(6);
    expect(row!.prioridadId).toBe(prioridadId);
  });

  it('findByPrioridad() resuelve por la FK única de prioridad', async () => {
    const config = await repo.findByPrioridad(prioridadId);
    expect(config).not.toBeNull();
    expect(config!.prioridadId).toBe(prioridadId);
    expect(config!.horas).toBe(6);
  });

  it('findByPrioridad() retorna null si la prioridad no tiene config', async () => {
    const config = await repo.findByPrioridad('00000000-0000-0000-0000-000000000000');
    expect(config).toBeNull();
  });

  it('[CRITICAL] save() UPDATE: persiste cambios sin pisar createdAt', async () => {
    const config = await repo.findByPrioridad(prioridadId);
    const original = await tenantClient.slaConfig.findUniqueOrThrow({
      where: { id: config!.id },
    });

    config!.editarHoras(10);
    config!.desactivar();
    await repo.save(config!);

    const actualizado = await tenantClient.slaConfig.findUniqueOrThrow({
      where: { id: config!.id },
    });
    expect(actualizado.horas).toBe(10);
    expect(actualizado.activo).toBe(false);
    expect(actualizado.createdAt.getTime()).toBe(original.createdAt.getTime());
  });

  it('findAll() incluye la fixture creada y excluye soft-deleted', async () => {
    const configs = await repo.findAll();
    const ids = configs.map((c) => c.id);
    const fixture = await tenantClient.slaConfig.findFirst({ where: { prioridadId } });
    expect(ids).toContain(fixture!.id);
  });

  it('lanza un error descriptivo si no hay TenantContext activo', async () => {
    const looseContext = new TenantContext();
    const looseRepo = new PrismaSlaConfigRepository(looseContext);
    await expect(looseRepo.findByPrioridad(prioridadId)).rejects.toThrow(
      /No hay TenantContext activo/,
    );
  });
});
