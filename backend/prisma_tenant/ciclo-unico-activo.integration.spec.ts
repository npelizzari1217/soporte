/**
 * ciclo-unico-activo.integration.spec.ts — WU-02 (sdd/compras-tres-etapas-y-sectores, FASE 1).
 *
 * M0 cierra el riesgo de `findActive()` no determinístico (ADR-T8, design parte 1):
 * un índice único parcial en DB impide dos ciclos `activo=true` simultáneos, y un
 * `orderBy` total en `PrismaCicloClienteRepository.findActive()` (src/tickets/...)
 * hace que la lectura sea reproducible en toda corrida, incluso si algún día el
 * índice se relajara.
 *
 * Dos `it`:
 * (a) con `pg` crudo: un segundo `UPDATE ... SET activo=true` sobre otra fila
 *     DEBE ser rechazado por el índice único parcial `ciclos_cliente_unico_activo_idx`.
 * (b) con dos ciclos que solo difieren en `fechaInicio` (uno activo, uno no),
 *     `findActive()` devuelve el MISMO ciclo en llamadas repetidas — protege contra
 *     una futura regresión que vuelva a hacer el `where` ambiguo o dependiente de
 *     orden físico de fila. No se puede ejercer la ambigüedad de dos activos
 *     simultáneos en este archivo porque el índice de (a) ya la hace irrepresentable
 *     una vez aplicada la migración — es la propiedad que (a) prueba.
 */
import { Client } from 'pg';
import { TenantPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../src/shared/tenancy/tenant-context';
import { PrismaCicloClienteRepository } from '../src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';

/** URL de la DB tenant de test (mismo default usado en otras integration specs del repo). */
const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('M0 — índice único de ciclo activo + orderBy determinístico (WU-02)', () => {
  let client: Client;
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let cicloClienteRepo: PrismaCicloClienteRepository;

  beforeAll(async () => {
    // `tenantContext.bind()` DEBE correr ANTES del primer `await` de este hook:
    // usa `AsyncLocalStorage.enterWith()` bajo el capó (TenantContext.bind()),
    // que solo ata el contexto async ACTUAL — si corriera después de un
    // `await`, quedaría atado a esa continuación puntual y no propagaría a los
    // `it()` que vitest invoca luego. Mismo orden que
    // prisma-ciclo-repos.integration.spec.ts.
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-wu02',
    });
    cicloClienteRepo = new PrismaCicloClienteRepository(tenantContext);

    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.query('DELETE FROM ciclos_cliente WHERE nombre LIKE $1', ['WU-02 %']);
    await client.end();
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await client.query('DELETE FROM ciclos_cliente WHERE nombre LIKE $1', ['WU-02 %']);
  });

  describe('(a) índice único parcial ciclos_cliente_unico_activo_idx', () => {
    it('rechaza un segundo UPDATE ... SET activo=true sobre otra fila', async () => {
      const primero = await client.query(
        `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-02 primero', '2026-01-01', '2026-06-30', true, now())
         RETURNING id`,
      );
      const segundo = await client.query(
        `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-02 segundo', '2026-07-01', '2026-12-31', false, now())
         RETURNING id`,
      );
      expect(primero.rows[0].id).toBeDefined();

      await expect(
        client.query(`UPDATE ciclos_cliente SET activo = true WHERE id = $1`, [
          segundo.rows[0].id,
        ]),
      ).rejects.toThrow(/ciclos_cliente_unico_activo_idx|duplicate key/i);
    });

    it('acepta el segundo activo=true recién DESPUÉS de desactivar el primero (mismo patrón que activarCiclo)', async () => {
      const primero = await client.query(
        `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-02 primero b', '2026-01-01', '2026-06-30', true, now())
         RETURNING id`,
      );
      const segundo = await client.query(
        `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-02 segundo b', '2026-07-01', '2026-12-31', false, now())
         RETURNING id`,
      );

      await client.query('BEGIN');
      await client.query(`UPDATE ciclos_cliente SET activo = false WHERE id = $1`, [
        primero.rows[0].id,
      ]);
      const resultado = await client.query(
        `UPDATE ciclos_cliente SET activo = true WHERE id = $1 RETURNING id`,
        [segundo.rows[0].id],
      );
      await client.query('COMMIT');

      expect(resultado.rowCount).toBe(1);
    });
  });

  describe('(b) findActive() determinístico', () => {
    it('devuelve el mismo ciclo activo en llamadas repetidas, con otro ciclo inactivo de fechaInicio distinta en la tabla', async () => {
      const activo = await client.query(
        `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-02 activo det', '2026-01-01', '2026-06-30', true, now())
         RETURNING id`,
      );
      await client.query(
        `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-02 inactivo det', '2026-07-01', '2026-12-31', false, now())`,
      );

      const idEsperado = activo.rows[0].id as string;
      const primera = await cicloClienteRepo.findActive();
      const segunda = await cicloClienteRepo.findActive();
      const tercera = await cicloClienteRepo.findActive();

      for (const r of [primera, segunda, tercera]) {
        expect(r).not.toBeNull();
        expect(r!.id).toBe(idEsperado);
      }
    });
  });
});
