/**
 * [UNIT] — Tests de `ProvisionarTenantDatabaseUseCase`: orquesta
 * createDatabase → migrate → seed, con rollback compensatorio
 * (`dropDatabase`) ante cualquier fallo POSTERIOR a `createDatabase` (R18).
 *
 * Los 3 puertos (`IPostgresAdminPort`, `ITenantMigrationRunner`,
 * `ITenantSeeder`) se mockean — sin Postgres real, sin subprocesos. Esta
 * orquestación es la pieza reutilizable que `CrearClienteUseCase` (PR8)
 * consumirá para el flujo completo de alta de cliente (R16); acá se testea
 * aislada, sin el insert en `master.clientes` ni la creación del admin.
 *
 * Contrato verificado (R18):
 * - Happy path: createDatabase → run → seed, en orden, SIN dropDatabase.
 * - Falla `run` (migración) → dropDatabase(dbName) + re-lanza el error
 *   ORIGINAL (no uno nuevo envuelto).
 * - Falla `seed` → dropDatabase(dbName) + re-lanza el error original.
 * - Falla `createDatabase` en sí → NO se llama dropDatabase (nada que
 *   compensar — el paso que falló es el propio create).
 *
 * Ref spec: sdd/auth-multitenancy/spec §R18
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tarea: PR7 (orquestación de rollback, alcance explícito del batch)
 */
import { ProvisionarTenantDatabaseUseCase } from './provisionar-tenant-database.use-case';
import type { IPostgresAdminPort } from '../../domain/ports/i-postgres-admin.port';
import type { ITenantMigrationRunner } from '../../domain/ports/i-tenant-migration-runner.port';
import type { ITenantSeeder } from '../../domain/ports/i-tenant-seeder.port';

function makeMocks(): {
  postgresAdmin: IPostgresAdminPort;
  migrationRunner: ITenantMigrationRunner;
  seeder: ITenantSeeder;
} {
  return {
    postgresAdmin: {
      createDatabase: vi.fn().mockResolvedValue(undefined),
      dropDatabase: vi.fn().mockResolvedValue(undefined),
      databaseExists: vi.fn().mockResolvedValue(false),
    },
    migrationRunner: { run: vi.fn().mockResolvedValue(undefined) },
    seeder: { seed: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('ProvisionarTenantDatabaseUseCase (unit, mocks)', () => {
  it('[CRITICAL] happy path: createDatabase → run → seed, en orden, SIN dropDatabase', async () => {
    const { postgresAdmin, migrationRunner, seeder } = makeMocks();
    const useCase = new ProvisionarTenantDatabaseUseCase(postgresAdmin, migrationRunner, seeder);
    const callOrder: string[] = [];
    (postgresAdmin.createDatabase as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('createDatabase');
    });
    (migrationRunner.run as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('run');
    });
    (seeder.seed as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('seed');
    });

    await useCase.provision('soporte_prov_demo_test');

    expect(callOrder).toEqual(['createDatabase', 'run', 'seed']);
    expect(postgresAdmin.dropDatabase).not.toHaveBeenCalled();
  });

  it('[CRITICAL] falla la migración → dropDatabase(dbName) + re-lanza el error ORIGINAL (R18)', async () => {
    const { postgresAdmin, migrationRunner, seeder } = makeMocks();
    const originalError = new Error('P3009: migración falló');
    (migrationRunner.run as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);
    const useCase = new ProvisionarTenantDatabaseUseCase(postgresAdmin, migrationRunner, seeder);

    await expect(useCase.provision('soporte_prov_demo_test')).rejects.toBe(originalError);

    expect(postgresAdmin.dropDatabase).toHaveBeenCalledWith('soporte_prov_demo_test');
    expect(postgresAdmin.dropDatabase).toHaveBeenCalledTimes(1);
    expect(seeder.seed).not.toHaveBeenCalled();
  });

  it('[CRITICAL] falla el seed → dropDatabase(dbName) + re-lanza el error original (R18)', async () => {
    const { postgresAdmin, migrationRunner, seeder } = makeMocks();
    const originalError = new Error('seed falló: constraint violation');
    (seeder.seed as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);
    const useCase = new ProvisionarTenantDatabaseUseCase(postgresAdmin, migrationRunner, seeder);

    await expect(useCase.provision('soporte_prov_demo_test')).rejects.toBe(originalError);

    expect(postgresAdmin.dropDatabase).toHaveBeenCalledWith('soporte_prov_demo_test');
    expect(postgresAdmin.dropDatabase).toHaveBeenCalledTimes(1);
  });

  it('falla createDatabase en sí → NO llama dropDatabase (nada que compensar)', async () => {
    const { postgresAdmin, migrationRunner, seeder } = makeMocks();
    const originalError = new Error('la DB ya existe');
    (postgresAdmin.createDatabase as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);
    const useCase = new ProvisionarTenantDatabaseUseCase(postgresAdmin, migrationRunner, seeder);

    await expect(useCase.provision('soporte_prov_demo_test')).rejects.toBe(originalError);

    expect(postgresAdmin.dropDatabase).not.toHaveBeenCalled();
    expect(migrationRunner.run).not.toHaveBeenCalled();
    expect(seeder.seed).not.toHaveBeenCalled();
  });
});
