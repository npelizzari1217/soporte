/**
 * T7.4 / T1.1-T1.2 (Fase 3, ADR-5) [INT] — Test de integración de
 * `TenantSeederAdapter` sobre una DB tenant REAL, recién creada y migrada
 * (encadena T7.2 + T7.3 + T7.4 sin mocks, contra Postgres real).
 *
 * SEGURIDAD: crea UNA sola DB efímera `soporte_prov_seed_<rand>_test`
 * (prefijo `soporte_prov_`, sufijo `_test`) vía `PostgresAdminService`, la
 * migra vía `TenantMigrationRunnerAdapter` (subproceso real de
 * `prisma migrate deploy`), siembra vía `TenantSeederAdapter`, y la borra en
 * `afterAll`. NUNCA toca `soporte_master`, `soporte_master_test`,
 * `soporte_tenant_test`, `soporte_e2e` ni las bases `soporte_019f...`.
 *
 * Contrato verificado (R19, ampliado Fase 3 ADR-5/F3-S1; WU-1
 * sdd/repuestos-familias):
 * - Tras `seed()`, la DB tenant tiene 6 estados / 4 prioridades /
 *   5 tipo_operacion (los de R19; APROBACION/RECHAZO removidos en PR-1 de
 *   sdd/redisenio-modulo-compras) / 4 tipos_ticket / 11 familias_insumo de
 *   repuesto persistidos con los códigos exactos. `tipos_componente` YA NO
 *   se siembra por tenant (PR4b, sdd/tipos-componente-master — catálogo
 *   GLOBAL en MASTER).
 * - Correr `seed()` una segunda vez sobre la MISMA DB no duplica filas ni
 *   lanza error (idempotencia real, no solo mockeada).
 *
 * Este spec es lento (spawnea `prisma migrate deploy` real) — corre en
 * `beforeAll`, una sola vez para toda la suite.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R19; sdd/flujos-especializados/spec §F3-S1
 * Ref design: sdd/flujos-especializados/design ADR-5
 * Tarea: T7.4 (base) / T1.1-T1.2 (Fase 3, PR1 gated)
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PostgresAdminService } from './postgres-admin.service';
import { TenantMigrationRunnerAdapter } from './tenant-migration-runner.adapter';
import { TenantSeederAdapter } from './tenant-seeder.adapter';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB_NAME = `soporte_prov_seed_${randomBytes(4).toString('hex')}_test`;

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('TenantSeederAdapter (T7.4, integración — Postgres real, DB efímera)', () => {
  const admin = new PostgresAdminService(MASTER_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_URL);
  const seeder = new TenantSeederAdapter(MASTER_URL);

  let verifyPool: Pool;
  let verifyClient: InstanceType<typeof TenantPrismaClient>;

  beforeAll(async () => {
    await admin.createDatabase(DB_NAME);
    await migrationRunner.run(DB_NAME);

    verifyPool = new Pool({ connectionString: buildTenantUrl(DB_NAME) });
    verifyClient = new TenantPrismaClient({ adapter: new PrismaPg(verifyPool) });
  }, 60_000);

  afterAll(async () => {
    await verifyClient.$disconnect();
    await verifyPool.end();
    await admin.dropDatabase(DB_NAME);
  });

  const CODIGOS_FAMILIAS_REPUESTO = [
    'CPU',
    'MOUSE',
    'TECLADO',
    'RAM',
    'MONITOR',
    'FUENTE',
    'GPU',
    'RED',
    'SSD',
    'HDD',
    'IMPRESORA',
  ];

  it('[CRITICAL] seed() persiste los 5 catálogos con los códigos exactos en la DB tenant real', async () => {
    // La migración 20260909120000_add_tipo_preventivo ya insertó PREVENTIVO
    // al correr `migrate deploy` en el beforeAll, así que sin este DELETE la
    // aserción de tipos_ticket pasaría aunque el seeder NO lo sembrara: el
    // test probaría la migración, no el seed. Se borra la fila para que la
    // única fuente posible del PREVENTIVO que se verifica abajo sea seed().
    await verifyClient.tipoTicket.deleteMany({ where: { codigo: 'PREVENTIVO' } });

    // Mismo motivo, para familias_insumo: la migración de datos
    // 20260910120100_seed_familias_insumo_repuesto ya insertó las 11 filas
    // al correr `migrate deploy` en el beforeAll. Sin este DELETE, la
    // aserción de abajo pasaría aunque `TenantSeederAdapter.seed()` NO
    // sembrara nada — probaría la migración, no el seed (mismo hallazgo que
    // ya bloqueó la revisión automática en un caso idéntico).
    await verifyClient.familiaInsumo.deleteMany({
      where: { codigo: { in: CODIGOS_FAMILIAS_REPUESTO } },
    });

    await seeder.seed(DB_NAME);

    const estados = await verifyClient.estado.findMany({ orderBy: { orden: 'asc' } });
    expect(estados.map((e) => e.codigo)).toEqual([
      'NUEVO',
      'ASIGNADO',
      'EN_PROCESO',
      'RESUELTO',
      'CERRADO',
      'CANCELADO',
    ]);

    const prioridades = await verifyClient.prioridad.findMany({ orderBy: { orden: 'asc' } });
    expect(prioridades.map((p) => p.codigo)).toEqual(['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);

    // Fase 4 (S1, GATE G1): sla_horas/sla_activo sembrados 1:1 con prioridades
    // (movido de la tabla separada `sla_config`, eliminada).
    const horasPorCodigo = Object.fromEntries(prioridades.map((p) => [p.codigo, p.slaHoras]));
    expect(horasPorCodigo).toEqual({ CRITICA: 4, ALTA: 8, MEDIA: 24, BAJA: 48 });
    expect(prioridades.every((p) => p.slaActivo)).toBe(true);

    const tipoOperacion = await verifyClient.tipoOperacion.findMany({ orderBy: { nombre: 'asc' } });
    expect(tipoOperacion).toHaveLength(5);
    expect(tipoOperacion.map((t) => t.codigo).sort()).toEqual(
      ['CAMBIO_ESTADO', 'COMENTARIO', 'ASIGNACION', 'ADJUNTO', 'AVANCE_EDILICIO'].sort(),
    );

    const tiposTicket = await verifyClient.tipoTicket.findMany({ orderBy: { codigo: 'asc' } });
    expect(tiposTicket.map((t) => t.codigo).sort()).toEqual(
      ['SOPORTE', 'EDILICIA', 'MANTENIMIENTO', 'PREVENTIVO'].sort(),
    );

    const familias = await verifyClient.familiaInsumo.findMany({
      where: { codigo: { in: CODIGOS_FAMILIAS_REPUESTO } },
      orderBy: { codigo: 'asc' },
    });
    expect(familias.map((f) => f.codigo).sort()).toEqual([...CODIGOS_FAMILIAS_REPUESTO].sort());
    expect(familias.every((f) => f.esRepuesto)).toBe(true);
  }, 30_000);

  it('[CRITICAL] correr seed() una segunda vez NO duplica filas ni falla (R19, ampliado F3-S1)', async () => {
    await seeder.seed(DB_NAME);
    await seeder.seed(DB_NAME); // re-run

    const [estados, prioridades, tipoOperacion, tiposTicket, familias] = await Promise.all([
      verifyClient.estado.findMany(),
      verifyClient.prioridad.findMany(),
      verifyClient.tipoOperacion.findMany(),
      verifyClient.tipoTicket.findMany(),
      verifyClient.familiaInsumo.findMany({ where: { codigo: { in: CODIGOS_FAMILIAS_REPUESTO } } }),
    ]);

    expect(estados).toHaveLength(6);
    expect(prioridades).toHaveLength(4);
    expect(tipoOperacion).toHaveLength(5);
    expect(tiposTicket).toHaveLength(4);
    expect(familias).toHaveLength(11);
  }, 30_000);
});
