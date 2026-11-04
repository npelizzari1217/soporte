/**
 * tickets-modalidad.integration.spec.ts — odd/edilicia-obra-externa T1a (S1).
 *
 * Contra Postgres REAL (`soporte_tenant_test`): la columna `tickets.modalidad` tiene un CHECK que
 * enumera los mismos valores que `MODALIDADES_TICKET`. El riesgo es la deriva: agregar una modalidad
 * al array sin su migración deja el INSERT rechazado por la base.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { MODALIDADES_TICKET } from '../../../domain/entities/ticket.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('tickets.modalidad — CHECK de la migración', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;

  beforeAll(() => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  it('el CHECK real enumera exactamente MODALIDADES_TICKET', async () => {
    const filas = await tenantClient.$queryRaw<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conname = 'tickets_modalidad_check'`;

    expect(filas).toHaveLength(1);
    const enLaDb = [...filas[0].def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
    expect(enLaDb).toEqual([...MODALIDADES_TICKET].sort());
  });

  it('el DEFAULT de la columna es INTERNA, igual que el @default del schema', async () => {
    const filas = await tenantClient.$queryRaw<{ def: string | null }[]>`
      SELECT column_default AS def
        FROM information_schema.columns
       WHERE table_name = 'tickets' AND column_name = 'modalidad'`;

    expect(filas).toHaveLength(1);
    expect(filas[0].def).toMatch(/^'INTERNA'/);
  });
});
