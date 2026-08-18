/**
 * PR-12 [INTEGRATION] — [H1] Reposición del aislamiento cross-tenant de
 * compras, borrado en PR-1 junto con `compras/**` (importaba
 * `PrismaTicketCompraRepository`, clase que dejó de existir con el
 * rediseño). Este `it('[CRITICAL] ...')` es el reemplazo directo de aquel,
 * ahora contra `PrismaCompraRepository` (PR-11, ya completo y utilizable).
 *
 * Precedente EXACTO seguido: `prisma-ticket-repository.aislamiento.integration.spec.ts`
 * (`tickets/infrastructure/persistence/prisma/`) — misma estrategia: una
 * sola DB física efímera (tenant B) creada/migrada/borrada por este spec vía
 * `PostgresAdminService`/`TenantMigrationRunnerAdapter`, el tenant A es la DB
 * compartida de test (`soporte_tenant_test`). Verifica que UN MISMO
 * `PrismaCompraRepository`, bindeado al `TenantContext` del tenant B (DB
 * física distinta), NO ve las compras del tenant A — prueba real de la
 * arquitectura database-per-tenant, no solo "TenantContext ausente lanza"
 * (eso ya lo cubre `prisma-compra.repository.integration.spec.ts`, PR-11).
 *
 * SEGURIDAD: crea UNA sola DB efímera `soporte_prov_compriso_<rand>_test`
 * (prefijo `soporte_prov_`, sufijo `_test`, mismo patrón que el precedente
 * de tickets), la migra vía `TenantMigrationRunnerAdapter` (subproceso real
 * de `prisma migrate deploy`), y la borra en `afterAll`. NUNCA toca
 * `soporte_master`, `soporte_master_test` ni ninguna otra DB.
 *
 * HIGIENE DE DB en el tenant A (compartido): fixtures propios
 * (`PR12ISOA_*`), `CicloCliente` con `activo: false`, `afterAll` que borra
 * EXACTAMENTE las filas creadas por esta suite en el tenant A.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10, §4.11 (S41: aislamiento
 * por tenant). Ref tasks: PR-12, hueco [H1] (deuda repuesta desde PR-1).
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaCompraRepository } from './prisma-compra.repository';
import { CompraEntity } from '../../../domain/entities/compra.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_A_DB_NAME = 'soporte_tenant_test';
const TENANT_B_DB_NAME = `soporte_prov_compriso_${randomBytes(4).toString('hex')}_test`;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

describe('PrismaCompraRepository — Aislamiento cross-tenant real (PR-12, [H1])', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);

  let prismaService: PrismaService;
  let tenantAClient: InstanceType<typeof TenantPrismaClient>;
  let tenantBClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let compraRepo: PrismaCompraRepository;

  let cicloAId: string;
  let compraAId: string;

  beforeAll(async () => {
    // Tenant B: DB física efímera, real, migrada — NUNCA soporte_master*.
    await admin.createDatabase(TENANT_B_DB_NAME);
    await migrationRunner.run(TENANT_B_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantAClient = prismaService.getTenantClient(TENANT_A_DB_NAME);
    tenantBClient = prismaService.getTenantClient(TENANT_B_DB_NAME);
    tenantContext = new TenantContext();
    compraRepo = new PrismaCompraRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const cicloA = await tenantAClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: `PR12ISOA_CICLO_${suffix}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        // activo: false — higiene de DB (findActive() sin orderBy es
        // vulnerable a recoger un ciclo ajeno de otra suite).
        activo: false,
      },
    });
    cicloAId = cicloA.id;

    // Una compra real en el tenant A (soporte_tenant_test).
    const compraA = CompraEntity.create({
      numero: `COM-2026-ISO${suffix.slice(0, 5)}`,
      fechaSolicitud: new Date('2026-03-01'),
      motivo: 'Compra exclusiva del tenant A',
      descripcion: null,
      solicitanteId: DUMMY_USUARIO_ID,
      cicloId: cicloAId,
    });
    compraAId = compraA.id;

    await tenantContext.run(
      { prismaClient: tenantAClient, dbName: TENANT_A_DB_NAME, clienteId: 'tenant-a-cliente' },
      () => compraRepo.guardar(compraA),
    );
  }, 60_000);

  afterAll(async () => {
    // Borrado acotado EXACTAMENTE a lo creado por esta suite en el tenant A
    // compartido (nunca DELETE FROM sin filtro).
    await tenantAClient.compra.deleteMany({ where: { id: compraAId } });
    await tenantAClient.cicloCliente.delete({ where: { id: cicloAId } });
    await prismaService.onModuleDestroy();
    // Tenant B es una DB efímera propia de este spec: se destruye entera.
    await admin.dropDatabase(TENANT_B_DB_NAME);
  }, 60_000);

  it('un repo bindeado al tenant A encuentra la compra', async () => {
    const found = await tenantContext.run(
      { prismaClient: tenantAClient, dbName: TENANT_A_DB_NAME, clienteId: 'tenant-a-cliente' },
      () => compraRepo.findByIdConItems(compraAId),
    );
    expect(found).not.toBeNull();
    expect(found!.id).toBe(compraAId);
  });

  it('[CRITICAL] el mismo repo, bindeado al tenant B (DB física distinta), NO ve la compra del tenant A', async () => {
    const found = await tenantContext.run(
      { prismaClient: tenantBClient, dbName: TENANT_B_DB_NAME, clienteId: 'tenant-b-cliente' },
      () => compraRepo.findByIdConItems(compraAId),
    );
    expect(found).toBeNull();
  });

  it('[CRITICAL] findPaginaConItems() en el tenant B (vacío) no incluye compras del tenant A', async () => {
    const resultB = await tenantContext.run(
      { prismaClient: tenantBClient, dbName: TENANT_B_DB_NAME, clienteId: 'tenant-b-cliente' },
      () => compraRepo.findPaginaConItems(),
    );
    expect(resultB.compras.map((c) => c.id)).not.toContain(compraAId);
  });
});
