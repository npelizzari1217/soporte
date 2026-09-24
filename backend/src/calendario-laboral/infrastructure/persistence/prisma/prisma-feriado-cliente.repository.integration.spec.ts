/**
 * PrismaFeriadoClienteRepository — integración (WU3a, sdd/feriados-configurables,
 * issue #216). Postgres real, DB tenant EFÍMERA propia: crea
 * `soporte_feriados_cliente_<rand>_test` vía `PostgresAdminService`, la migra
 * con `TenantMigrationRunnerAdapter` (subproceso real de `prisma migrate
 * deploy`, aplica también la migración nueva `20260924130000_feriados_cliente`)
 * y la borra en `afterAll` — mismo patrón que
 * `tenant-seeder.adapter.integration.spec.ts`. Nunca toca
 * `soporte_master_test`, `soporte_tenant_test` ni una DB de tenant real.
 *
 * Cubre task 3.4 (mitad WU3a): CRUD, constraint UNIQUE de `fecha`, y el
 * round-trip de fecha a través del mapper (trampa `@db.Date`, D2). La
 * cobertura de `esGlobal`/`FeriadosGlobalesMasterChecker` queda para WU3b.
 *
 * Cada test envuelve el repo en `tenantContext.run(ctx, fn)` en vez de
 * `bind()`: el `beforeAll` de este spec cruza awaits reales de subproceso
 * (`prisma migrate deploy`) antes de tener el contexto listo, y el fallback
 * `enterWith()` de `bind()` (pensado para el caso simple, ver su JSDoc) no
 * propaga de forma confiable de ese `beforeAll` a los `it()` hermanos en
 * este runner — `run()` sí, por diseño (`AsyncLocalStorage.run`).
 *
 * Hygiene order: limpiar filas (redundante acá, la DB entera es efímera) →
 * desconectar el client Prisma → `dropDatabase`.
 *
 * Ref design: D1, D2. Ref tasks: 3.4.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext, TenantContextData } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaFeriadoClienteRepository } from './prisma-feriado-cliente.repository';
import { FeriadoEntity } from '../../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../../domain/value-objects/fecha-calendario';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB_NAME = `soporte_feriados_cliente_${randomBytes(4).toString('hex')}_test`;

function fecha(iso: string): FechaCalendario {
  return FechaCalendario.crear(iso).getValue();
}

describe('PrismaFeriadoClienteRepository (WU3a, integración — Postgres real, DB tenant efímera)', () => {
  const admin = new PostgresAdminService(MASTER_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_URL);
  const tenantContext = new TenantContext();

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let ctx: TenantContextData;
  let repo: PrismaFeriadoClienteRepository;

  /** Ejecuta `fn` con el TenantContext bindeado vía `run()` (ver JSDoc de cabecera). */
  function conContexto<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(ctx, fn);
  }

  beforeAll(async () => {
    await admin.createDatabase(DB_NAME);
    await migrationRunner.run(DB_NAME);

    prismaService = new PrismaService(MASTER_URL);
    tenantClient = prismaService.getTenantClient(DB_NAME);
    ctx = { prismaClient: tenantClient, dbName: DB_NAME, clienteId: 'test-cliente-feriados' };
    repo = new PrismaFeriadoClienteRepository(tenantContext);
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(DB_NAME);
  });

  afterEach(async () => {
    await tenantClient.feriadoCliente.deleteMany({});
  });

  describe('CRUD', () => {
    it('crear() persiste y buscarPorId() lo lee de vuelta', () =>
      conContexto(async () => {
        const nuevo = FeriadoEntity.crear({
          fecha: fecha('2031-05-01'),
          descripcion: 'Feriado de prueba',
        });

        await repo.crear(nuevo);
        const leido = await repo.buscarPorId(nuevo.id);

        expect(leido).not.toBeNull();
        expect(leido!.fecha.aClave()).toBe('2031-05-01');
        expect(leido!.descripcion).toBe('Feriado de prueba');
      }));

    it('buscarPorId() retorna null para un id inexistente', () =>
      conContexto(async () => {
        const leido = await repo.buscarPorId('00000000-0000-0000-0000-000000000000');
        expect(leido).toBeNull();
      }));

    it('listar() retorna los feriados ordenados por fecha ascendente', () =>
      conContexto(async () => {
        await repo.crear(
          FeriadoEntity.crear({ fecha: fecha('2031-12-25'), descripcion: 'Navidad' }),
        );
        await repo.crear(
          FeriadoEntity.crear({ fecha: fecha('2031-01-01'), descripcion: 'Año Nuevo' }),
        );

        const feriados = await repo.listar();

        expect(feriados.map((f) => f.fecha.aClave())).toEqual(['2031-01-01', '2031-12-25']);
      }));

    it('editar() actualiza fecha y descripción de una fila existente', () =>
      conContexto(async () => {
        const original = FeriadoEntity.crear({
          fecha: fecha('2031-06-20'),
          descripcion: 'Original',
        });
        await repo.crear(original);

        const paraEditar = await repo.buscarPorId(original.id);
        paraEditar!.editar({ fecha: fecha('2031-06-21'), descripcion: 'Trasladado' });
        await repo.editar(paraEditar!);

        const releido = await repo.buscarPorId(original.id);
        expect(releido!.fecha.aClave()).toBe('2031-06-21');
        expect(releido!.descripcion).toBe('Trasladado');
      }));

    it('eliminar() borra físicamente la fila', () =>
      conContexto(async () => {
        const nuevo = FeriadoEntity.crear({ fecha: fecha('2031-08-17'), descripcion: 'A borrar' });
        await repo.crear(nuevo);

        await repo.eliminar(nuevo.id);

        expect(await repo.buscarPorId(nuevo.id)).toBeNull();
      }));
  });

  describe('constraint UNIQUE(fecha)', () => {
    it('rechaza dos feriados de cliente con la misma fecha', () =>
      conContexto(async () => {
        await repo.crear(
          FeriadoEntity.crear({ fecha: fecha('2031-09-09'), descripcion: 'Primero' }),
        );

        await expect(
          repo.crear(FeriadoEntity.crear({ fecha: fecha('2031-09-09'), descripcion: 'Duplicado' })),
        ).rejects.toThrow();
      }));
  });

  describe('round-trip de fecha (trampa @db.Date, D2)', () => {
    it('la fecha guardada se lee de vuelta como el mismo día calendario, sin corrimiento UTC-3', () =>
      conContexto(async () => {
        // 23hs locales AR (UTC-3): el caso límite donde un `desplazarAArgentina`
        // aplicado por error correría el día para atrás.
        const nuevo = FeriadoEntity.crear({
          fecha: fecha('2031-03-15'),
          descripcion: 'Límite UTC-3',
        });
        await repo.crear(nuevo);

        const releido = await repo.buscarPorId(nuevo.id);

        expect(releido!.fecha.aClave()).toBe('2031-03-15');
      }));
  });
});
