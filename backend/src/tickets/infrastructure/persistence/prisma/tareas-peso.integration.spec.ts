/**
 * tareas-peso.integration.spec.ts — odd/edilicia-obra-externa T2a (S4, L17).
 *
 * Contra Postgres REAL (`soporte_tenant_test`): la columna `tareas_ticket.peso` nace en 0 y su
 * CHECK acota cada tarea a [0, 100], el mismo tope que `PESO_TAREAS_MAX` del dominio.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PESO_TAREAS_MAX } from '../../../domain/entities/tarea-ticket.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('tareas_ticket.peso — CHECK y DEFAULT de la migración', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;

  beforeAll(() => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  it('el CHECK real acota el peso a [0, PESO_TAREAS_MAX]', async () => {
    const filas = await tenantClient.$queryRaw<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conname = 'tareas_ticket_peso_check'`;

    expect(filas).toHaveLength(1);
    expect(filas[0].def).toMatch(/peso >= 0/);
    expect(filas[0].def).toContain(`peso <= ${PESO_TAREAS_MAX}`);
  });

  it('el DEFAULT de la columna es 0, igual que el @default del schema', async () => {
    const filas = await tenantClient.$queryRaw<{ def: string | null }[]>`
      SELECT column_default AS def
        FROM information_schema.columns
       WHERE table_name = 'tareas_ticket' AND column_name = 'peso'`;

    expect(filas).toHaveLength(1);
    expect(filas[0].def).toBe('0');
  });
});
