/**
 * calendario-laboral.repositorios.integration.spec.ts — WU-3/WU-5
 * (sdd/horario-laboral-por-cliente, H2).
 *
 * Contra Postgres REAL: ejerce `PrismaCalendarioLaboralSemanalRepository`
 * contra una DB tenant EFÍMERA (`PostgresAdminService`/
 * `TenantMigrationRunnerAdapter`, mismo patrón que
 * `prisma-feriado-cliente.repository.integration.spec.ts:27-50`) — desde
 * este WU el repositorio lee `calendario_laboral_dias_cliente` del tenant
 * vía `TenantContext` y ya no toca `soporte_master_test`, así que este
 * archivo no necesita `usarLockMasterTest()`.
 *
 * La cobertura de `PrismaFeriadosLaboralesRepository` (unión global+cliente)
 * vivía antes en este mismo archivo; queda fuera de alcance de este WU y ya
 * está cubierta por `prisma-feriados-laborales.repository.spec.ts` (unit,
 * con mocks) sin duplicar Postgres real.
 *
 * WU-5 (tarea 5.7) agrega `reemplazar()` envuelto en un
 * `PrismaTenantTransactionRunner` REAL (mismo mecanismo que
 * `registrar-operacion-compra.s36.integration.spec.ts`: el throw propaga
 * hasta el callback de `client.$transaction`, que lo rechaza, y Postgres
 * revierte TODO lo escrito en esa transacción). La falla a mitad de camino
 * se fuerza parcheando el delegado `upsert` del cliente TRANSACCIONAL (`tx`,
 * capturado interceptando `$transaction`) — nunca el repositorio ni el VO,
 * que no tienen forma de producir un payload inválido a mitad de un
 * agregado ya validado.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext, TenantContextData } from '../../../../shared/tenancy/tenant-context';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { HorarioLaboralSemanal } from '../../../domain/value-objects/horario-laboral-semanal';
import {
  CalendarioLaboralSinTenantContextError,
  PrismaCalendarioLaboralSemanalRepository,
} from './prisma-calendario-laboral-semanal.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB_NAME = `soporte_calendario_laboral_${randomBytes(4).toString('hex')}_test`;

describe('PrismaCalendarioLaboralSemanalRepository — Integration (WU-3, sdd/horario-laboral-por-cliente)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  const tenantContext = new TenantContext();

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let ctx: TenantContextData;
  let repo: PrismaCalendarioLaboralSemanalRepository;

  /** Ejecuta `fn` con el TenantContext bindeado vía `run()` (ver JSDoc de `prisma-feriado-cliente.repository.integration.spec.ts`). */
  function conContexto<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(ctx, fn);
  }

  beforeAll(async () => {
    await admin.createDatabase(DB_NAME);
    await migrationRunner.run(DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(DB_NAME);
    ctx = {
      prismaClient: tenantClient,
      dbName: DB_NAME,
      clienteId: 'test-cliente-calendario-laboral',
    };
    repo = new PrismaCalendarioLaboralSemanalRepository(tenantContext);
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(DB_NAME);
  });

  it('lee las 7 filas sembradas por defecto como la tupla semanal', () =>
    conContexto(async () => {
      const semanal = await repo.obtener();

      expect(semanal[0]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
      expect(semanal[1]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
      expect(semanal[6]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
    }));

  it('lanza si el calendario en la base queda incompleto', () =>
    conContexto(async () => {
      await tenantClient.calendarioLaboralDiaCliente.delete({ where: { diaSemana: 6 } });
      try {
        await expect(repo.obtener()).rejects.toThrow(/6/);
      } finally {
        // Re-siembra la fila borrada para no dejar la base rota para otro test.
        await tenantClient.calendarioLaboralDiaCliente.create({
          data: { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
        });
      }
    }));

  it('lanza CalendarioLaboralSinTenantContextError si corre sin TenantContext bindeado (D4, fail-closed)', async () => {
    // Deliberadamente FUERA de `conContexto()`.
    await expect(repo.obtener()).rejects.toThrow(CalendarioLaboralSinTenantContextError);
  });

  describe('reemplazar() — WU-5, tarea 5.7', () => {
    it(
      'los 7 upsert salen SECUENCIALES en orden diaSemana 0→6, cada uno después de que ' +
        'termina el anterior, y un fallo a mitad de camino deja las 7 filas SIN CAMBIOS ' +
        '(rollback real de Postgres vía PrismaTenantTransactionRunner)',
      () =>
        conContexto(async () => {
          const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
          const antes = await repo.obtener();

          const horarioNuevo = HorarioLaboralSemanal.crear([
            { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
            { diaSemana: 1, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 2, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 3, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 4, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 5, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
          ]).getValue();

          const ordenInicio: number[] = [];
          const tiempoInicio: number[] = [];
          const transaccionOriginal = tenantClient.$transaction.bind(tenantClient);

          // Intercepta `$transaction` (no el repo ni el VO) para parchear el
          // delegado `upsert` DEL CLIENTE TRANSACCIONAL que Prisma le pasa al
          // callback — nunca el `tenantClient` de afuera, que las próximas
          // aserciones (`repo.obtener()`) siguen necesitando intacto.
          const transaccionMockeada = (async (fn: (tx: any) => Promise<unknown>) =>
            transaccionOriginal(async (tx: any) => {
              const upsertOriginal = tx.calendarioLaboralDiaCliente.upsert.bind(
                tx.calendarioLaboralDiaCliente,
              );
              tx.calendarioLaboralDiaCliente.upsert = vi.fn(async (args: any) => {
                const diaSemana = args.where.diaSemana as number;
                ordenInicio.push(diaSemana);
                tiempoInicio.push(Date.now());
                // Delay SOLO en el día 0: si `reemplazar` corriera con
                // Promise.all en vez de `for...await` secuencial, el día 1
                // arrancaría casi junto al día 0, sin esperar este delay.
                if (diaSemana === 0) {
                  await new Promise((resolve) => setTimeout(resolve, 150));
                }
                // Falla SOLO en el día 3, a mitad de los 7: prueba que
                // Postgres revierte TODO lo escrito hasta acá en esta tx.
                if (diaSemana === 3) {
                  throw new Error('Fallo simulado a mitad de camino (WU-5, atomicidad)');
                }
                return upsertOriginal(args);
              });
              return fn(tx);
            })) as unknown as typeof tenantClient.$transaction;

          const txSpy = vi
            .spyOn(tenantClient, '$transaction')
            .mockImplementation(transaccionMockeada);

          try {
            await expect(txRunner.run(() => repo.reemplazar(horarioNuevo))).rejects.toThrow(
              'Fallo simulado a mitad de camino',
            );
          } finally {
            txSpy.mockRestore();
          }

          // Orden fijo y secuencial hasta el punto del fallo: los días 4-6
          // nunca arrancan — el `for...await` corta ahí. Con `Promise.all`
          // los 7 se hubieran disparado ya (map síncrono), sin esperar el
          // delay del día 0 ni detenerse en el día 3.
          expect(ordenInicio).toEqual([0, 1, 2, 3]);
          expect(tiempoInicio[1] - tiempoInicio[0]).toBeGreaterThanOrEqual(140);

          // Rollback real: las 7 filas quedan EXACTAMENTE como antes del intento.
          const despues = await repo.obtener();
          expect(despues).toEqual(antes);
        }),
      10_000,
    );
  });
});
