import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterContext } from '../src/shared/tenancy/master-context';
import { PostgresAdminService } from '../src/shared/infrastructure/persistence/postgres-admin.service';
import { PostgresAdminAdapter } from '../src/clientes/infrastructure/postgres-admin.adapter';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../src/clientes/infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaRoleRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-role.repository';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { CrearClienteUseCase } from '../src/clientes/application/use-cases/crear-cliente.use-case';

const MASTER_URL = process.env.DATABASE_URL_MASTER!;

async function main() {
  const prisma = new PrismaService(MASTER_URL);
  const mc = new MasterContext();
  const adminService = new PostgresAdminService(MASTER_URL);

  const useCase = new CrearClienteUseCase(
    new PrismaClienteRepository(prisma),
    new PrismaUsuarioRepository(prisma, mc),
    new PrismaRoleRepository(prisma),
    new PostgresAdminAdapter(adminService),
    new TenantMigrationRunnerAdapter(MASTER_URL),
    new TenantSeederAdapter(MASTER_URL),
    new Argon2HashProvider(),
  );

  const result = await useCase.execute({
    nombre: 'E2E Org',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_e2e',
    adminEmail: 'test@example.com',
    adminNombre: 'Test',
    adminApellido: 'Admin',
    adminPasswordPlaintext: 'password123',
  });

  if (result.isOk()) {
    console.log('PROVISION_OK');
  } else {
    console.log('PROVISION_ERR: ' + JSON.stringify(result.getError()));
  }

  await prisma.onModuleDestroy();
  await adminService.onModuleDestroy();
  process.exit(0);
}

main().catch((e) => {
  console.error('PROVISION_THROW', e);
  process.exit(1);
});
