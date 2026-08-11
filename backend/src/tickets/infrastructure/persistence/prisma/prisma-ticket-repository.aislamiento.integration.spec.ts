/**
 * T5.7 [INTEGRATION] — RED→GREEN: aislamiento multi-tenant real (T23).
 *
 * Un repo bindeado al TenantContext del tenant A (una DB física) NO ve
 * filas del tenant B (OTRA DB física) — verificación real de la
 * arquitectura database-per-tenant, no solo "TenantContext ausente lanza"
 * (eso ya lo cubre `prisma-tickets.integration.spec.ts`).
 *
 * SEGURIDAD: crea UNA sola DB efímera `soporte_prov_tickiso_<rand>_test`
 * (prefijo `soporte_prov_`, sufijo `_test`, mismo patrón que
 * `tenant-seeder.adapter.integration.spec.ts` de Fase 1) vía
 * `PostgresAdminService`, la migra vía `TenantMigrationRunnerAdapter`
 * (subproceso real de `prisma migrate deploy`), y la borra en `afterAll`.
 * NUNCA toca `soporte_master`, `soporte_master_test`, `soporte_tenant_test`
 * ni ninguna otra DB. El tenant B (`soporte_tenant_test`, ya migrada y
 * compartida por el resto de la suite) actúa como tenant A en este test —
 * la DB efímera es el tenant B "vacío" que no debe ver las filas de A.
 *
 * Lento (spawnea `prisma migrate deploy`) — corre una sola vez en
 * `beforeAll`.
 *
 * Ref spec: sdd/tickets-core/spec T23. Ref design: "Firmas TS clave", ADR-8.
 * Tarea: T5.7.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaTicketRepository } from './prisma-ticket.repository';
import { TicketEntity } from '../../../domain/entities/ticket.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_A_DB_NAME = 'soporte_tenant_test';
const TENANT_B_DB_NAME = `soporte_prov_tickiso_${randomBytes(4).toString('hex')}_test`;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

describe('PrismaTicketRepository — Aislamiento cross-tenant real (T5.7, T23)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);

  let prismaService: PrismaService;
  let tenantAClient: InstanceType<typeof TenantPrismaClient>;
  let tenantBClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let ticketRepo: PrismaTicketRepository;

  let tipoAId: string;
  let estadoAId: string;
  let prioridadAId: string;
  let ticketAId: string;

  beforeAll(async () => {
    // Tenant B: DB física efímera, real, migrada — NUNCA soporte_master*.
    await admin.createDatabase(TENANT_B_DB_NAME);
    await migrationRunner.run(TENANT_B_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantAClient = prismaService.getTenantClient(TENANT_A_DB_NAME);
    tenantBClient = prismaService.getTenantClient(TENANT_B_DB_NAME);
    tenantContext = new TenantContext();
    ticketRepo = new PrismaTicketRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const tipoA = await tenantAClient.tipoTicket.create({
      data: {
        codigo: `T5ISOA${suffix}`,
        nombre: 'Aislamiento Tenant A',
        activo: true,
        modulo: 'SOPORTE',
      },
    });
    tipoAId = tipoA.id;

    const estadoA = await tenantAClient.estado.create({
      data: {
        codigo: `T5ISOAEST${suffix}`,
        nombre: 'Estado Aislamiento A',
        orden: 1,
        activo: true,
      },
    });
    estadoAId = estadoA.id;

    const prioridadA = await tenantAClient.prioridad.create({
      data: {
        codigo: `T5ISOAPRI${suffix}`,
        nombre: 'Prioridad Aislamiento A',
        orden: 1,
        activo: true,
      },
    });
    prioridadAId = prioridadA.id;

    // Un ticket real en el tenant A (soporte_tenant_test).
    const ticketA = TicketEntity.create({
      numero: `T5ISO${suffix.slice(0, 6)}`,
      titulo: 'Ticket exclusivo del tenant A',
      descripcion: null,
      tipoId: tipoAId,
      estadoId: estadoAId,
      prioridadId: prioridadAId,
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: DUMMY_USUARIO_ID,
    });
    ticketAId = ticketA.id;

    await tenantContext.run(
      { prismaClient: tenantAClient, dbName: TENANT_A_DB_NAME, clienteId: 'tenant-a-cliente' },
      () => ticketRepo.save(ticketA),
    );
  }, 60_000);

  afterAll(async () => {
    await tenantAClient.ticket.deleteMany({ where: { tipoId: tipoAId } });
    await tenantAClient.tipoTicket.delete({ where: { id: tipoAId } });
    await tenantAClient.estado.delete({ where: { id: estadoAId } });
    await tenantAClient.prioridad.delete({ where: { id: prioridadAId } });
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_B_DB_NAME);
  }, 60_000);

  it('un repo bindeado al tenant A encuentra el ticket', async () => {
    const found = await tenantContext.run(
      { prismaClient: tenantAClient, dbName: TENANT_A_DB_NAME, clienteId: 'tenant-a-cliente' },
      () => ticketRepo.findById(ticketAId),
    );
    expect(found).not.toBeNull();
    expect(found!.id).toBe(ticketAId);
  });

  it('[CRITICAL] el mismo repo, bindeado al tenant B (DB física distinta), NO ve el ticket del tenant A', async () => {
    const found = await tenantContext.run(
      { prismaClient: tenantBClient, dbName: TENANT_B_DB_NAME, clienteId: 'tenant-b-cliente' },
      () => ticketRepo.findById(ticketAId),
    );
    expect(found).toBeNull();
  });

  it('[CRITICAL] findAll() en el tenant B (vacío) no incluye tickets del tenant A', async () => {
    const resultB = await tenantContext.run(
      { prismaClient: tenantBClient, dbName: TENANT_B_DB_NAME, clienteId: 'tenant-b-cliente' },
      () => ticketRepo.findAll(),
    );
    expect(resultB.map((t) => t.id)).not.toContain(ticketAId);
  });
});
