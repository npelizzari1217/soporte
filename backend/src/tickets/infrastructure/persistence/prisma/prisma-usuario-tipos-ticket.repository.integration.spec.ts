/**
 * T8.3 [INTEGRATION] — `PrismaUsuarioTiposTicketRepository` contra Postgres
 * REAL (`soporte_tenant_test`), vía `TenantContext.bind()` (mismo patrón
 * que `prisma-catalogos.integration.spec.ts`, PR2).
 *
 * Usa un `tipoTicket` de fixture con código `T8_TEST_TIPO_TICKET` (la FK
 * real `usuario_tipos_ticket.tipo_ticket_id → tipos_ticket.id` exige un
 * tipo existente) y `usuarioId`s sintéticos (soft ref sin FK cross-DB —
 * no requieren existir en `master.usuarios` para este test de repositorio
 * puro). Limpia sus propias filas en `afterAll`.
 *
 * Ref spec: sdd/tickets-core/spec T3. Ref design: "Archivos afectados" PR8.
 * Tarea: T8.3.
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaUsuarioTiposTicketRepository } from './prisma-usuario-tipos-ticket.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaUsuarioTiposTicketRepository — Integration (T8.3)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaUsuarioTiposTicketRepository;

  let tipoTicketId: string;
  const usuarioA = randomUUID();
  const usuarioB = randomUUID();

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-usuario-tipos-ticket',
    });

    repo = new PrismaUsuarioTiposTicketRepository(tenantContext);

    const tipo = await tenantClient.tipoTicket.create({
      data: {
        codigo: `T8_TEST_TIPO_TICKET_${randomUUID().slice(0, 8)}`,
        nombre: 'Test',
        activo: true,
      },
    });
    tipoTicketId = tipo.id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.usuarioTiposTicket.deleteMany({ where: { tipoTicketId } });
    await tenantClient.tipoTicket.delete({ where: { id: tipoTicketId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  it('isUserEligibleForType retorna false sin fila previa', async () => {
    const eligible = await repo.isUserEligibleForType(usuarioA, tipoTicketId);
    expect(eligible).toBe(false);
  });

  it('assign crea la fila; isUserEligibleForType retorna true', async () => {
    await repo.assign(usuarioA, tipoTicketId);

    const eligible = await repo.isUserEligibleForType(usuarioA, tipoTicketId);
    expect(eligible).toBe(true);

    const row = await tenantClient.usuarioTiposTicket.findUnique({
      where: { usuarioId_tipoTicketId: { usuarioId: usuarioA, tipoTicketId } },
    });
    expect(row).not.toBeNull();
  });

  it('assign es idempotente: re-asignar la misma fila no lanza ni duplica', async () => {
    await repo.assign(usuarioA, tipoTicketId);
    await expect(repo.assign(usuarioA, tipoTicketId)).resolves.not.toThrow();

    const count = await tenantClient.usuarioTiposTicket.count({
      where: { usuarioId: usuarioA, tipoTicketId },
    });
    expect(count).toBe(1);
  });

  it('assign no afecta la elegibilidad de otro usuario para el mismo tipo', async () => {
    const eligible = await repo.isUserEligibleForType(usuarioB, tipoTicketId);
    expect(eligible).toBe(false);
  });

  it('revoke elimina físicamente la fila; isUserEligibleForType vuelve a false', async () => {
    await repo.assign(usuarioB, tipoTicketId);
    expect(await repo.isUserEligibleForType(usuarioB, tipoTicketId)).toBe(true);

    await repo.revoke(usuarioB, tipoTicketId);

    expect(await repo.isUserEligibleForType(usuarioB, tipoTicketId)).toBe(false);
    const row = await tenantClient.usuarioTiposTicket.findUnique({
      where: { usuarioId_tipoTicketId: { usuarioId: usuarioB, tipoTicketId } },
    });
    expect(row).toBeNull();
  });

  it('revoke es idempotente: revocar una fila inexistente no lanza', async () => {
    await expect(repo.revoke(randomUUID(), tipoTicketId)).resolves.not.toThrow();
  });

  // ─── findAll (sdd/beta-frontend item 5 — GET /routing) ─────────────────

  it('findAll incluye las asociaciones creadas en este tenant (TenantContext)', async () => {
    await repo.assign(usuarioA, tipoTicketId);

    const todas = await repo.findAll();

    expect(todas).toEqual(expect.arrayContaining([{ usuarioId: usuarioA, tipoTicketId }]));
  });
});
