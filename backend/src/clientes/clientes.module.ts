/**
 * ClientesModule — módulo NestJS del dominio "clientes".
 *
 * Gestión de clientes (tenants, PR8: alta completa con provisioning físico)
 * y ciclos vigentes (catálogo global creado por ROOT + adopción/activación
 * por tenant, PR9).
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 *
 * Importa `AuthModule` para poder usar `JwtAuthGuard`/`TenantGuard`/
 * `PermissionsGuard`/`GlobalAdminGuard` vía `@UseGuards` en los controllers
 * de este módulo, Y para inyectar `CLIENTE_REPOSITORY`/`USUARIO_REPOSITORY`/
 * `MEMBRESIA_REPOSITORY`/`ROLE_REPOSITORY`/`HASH_PROVIDER` (exportados por
 * `AuthModule`) en el factory de `CrearClienteUseCase` (PR8) — Nest resuelve
 * las dependencias de un provider exportado usando el contenedor del módulo
 * CONSUMIDOR (ver nota en `AuthModule`).
 *
 * `POSTGRES_ADMIN_PORT`/`TENANT_MIGRATION_RUNNER`/`TENANT_SEEDER` (PR7) se
 * wirean acá con `masterUrl` inyectado desde `DATABASE_URL_MASTER` — mismo
 * patrón que `PrismaService` en `SharedModule` (constructor plano, no
 * `@Injectable` con DI de NestJS para la URL).
 *
 * Tarea: T9.6 (repos) + T9.3/T9.7 (controllers) PR9 — Ciclos;
 *        T8.3/T8.4 (CrearClienteUseCase + ClientesController) PR8
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

// ─── Repositories (clientes) ─────────────────────────────────────────────────
import { CICLO_VIGENTE_REPOSITORY } from './domain/ports/i-ciclo-vigente.repository';
import { CICLO_CLIENTE_REPOSITORY } from './domain/ports/i-ciclo-cliente.repository';
import { CLIENTE_REPOSITORY, IClienteRepository } from './domain/ports/i-cliente.repository';
import { PrismaCicloVigenteRepository } from './infrastructure/persistence/prisma/prisma-ciclo-vigente.repository';
import { PrismaCicloClienteRepository } from './infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { ICicloVigenteRepository } from './domain/ports/i-ciclo-vigente.repository';
import { ICicloClienteRepository } from './domain/ports/i-ciclo-cliente.repository';
import {
  CLIENTE_EMAIL_CONFIG_REPOSITORY,
  IClienteEmailConfigRepository,
} from './domain/ports/i-cliente-email-config.repository';
import { PrismaClienteEmailConfigRepository } from './infrastructure/persistence/prisma/prisma-cliente-email-config.repository';

// ─── Repositories/Services (auth, cross-feature — exportados por AuthModule) ─
import { USUARIO_REPOSITORY } from '../auth/domain/ports/i-usuario.repository';
import { IUsuarioRepository } from '../auth/domain/ports/i-usuario.repository';
import { MEMBRESIA_REPOSITORY } from '../auth/domain/ports/i-membresia.repository';
import { IMembresiaRepository } from '../auth/domain/ports/i-membresia.repository';
import { ROLE_REPOSITORY } from '../auth/domain/ports/i-role.repository';
import { IRoleRepository } from '../auth/domain/ports/i-role.repository';
import { HASH_PROVIDER } from '../auth/domain/ports/i-hash.provider';
import { IHashProvider } from '../auth/domain/ports/i-hash.provider';

// ─── Provisioning: ports + adapters (PR7) ────────────────────────────────────
import { POSTGRES_ADMIN_PORT } from './domain/ports/i-postgres-admin.port';
import { IPostgresAdminPort } from './domain/ports/i-postgres-admin.port';
import { TENANT_MIGRATION_RUNNER } from './domain/ports/i-tenant-migration-runner.port';
import { ITenantMigrationRunner } from './domain/ports/i-tenant-migration-runner.port';
import { TENANT_SEEDER } from './domain/ports/i-tenant-seeder.port';
import { ITenantSeeder } from './domain/ports/i-tenant-seeder.port';
import { PostgresAdminService } from './infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from './infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from './infrastructure/tenant-seeder.adapter';

// ─── Verificación de conexión SMTP (adelantado de WU5, ver
// i-email-connection-verifier.port.ts) ────────────────────────────────────
import {
  EMAIL_CONNECTION_VERIFIER,
  IEmailConnectionVerifier,
} from '../shared/domain/ports/i-email-connection-verifier.port';
import { SmtpConnectionVerifier } from '../notificaciones/infrastructure/email/smtp-connection-verifier';

// ─── Use Cases (plain classes — instanciadas vía useFactory) ─────────────────
import { CrearCicloVigenteUseCase } from './application/use-cases/crear-ciclo-vigente.use-case';
import { ListarCiclosVigentesUseCase } from './application/use-cases/listar-ciclos-vigentes.use-case';
import { EditarCicloVigenteUseCase } from './application/use-cases/editar-ciclo-vigente.use-case';
import { EliminarCicloVigenteUseCase } from './application/use-cases/eliminar-ciclo-vigente.use-case';
import { ListarCiclosVigentesAdminUseCase } from './application/use-cases/listar-ciclos-vigentes-admin.use-case';
import { ElegirCicloTenantUseCase } from './application/use-cases/elegir-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from './application/use-cases/activar-ciclo.use-case';
import { DesactivarCicloUseCase } from './application/use-cases/desactivar-ciclo.use-case';
import { ListarCiclosUseCase } from './application/use-cases/listar-ciclos.use-case';
import { ProvisionarTenantDatabaseUseCase } from './application/use-cases/provisionar-tenant-database.use-case';
import { CrearClienteUseCase } from './application/use-cases/crear-cliente.use-case';
import { ListarClientesUseCase } from './application/use-cases/listar-clientes.use-case';
import { EditarClienteUseCase } from './application/use-cases/editar-cliente.use-case';
import { DesactivarClienteUseCase } from './application/use-cases/desactivar-cliente.use-case';
import { ReactivarClienteUseCase } from './application/use-cases/reactivar-cliente.use-case';
import { ConfigurarCorreoClienteUseCase } from './application/use-cases/configurar-correo-cliente.use-case';
import { QuitarCorreoClienteUseCase } from './application/use-cases/quitar-correo-cliente.use-case';
import { ProbarCorreoClienteUseCase } from './application/use-cases/probar-correo-cliente.use-case';
import { VerCorreoClienteUseCase } from './application/use-cases/ver-correo-cliente.use-case';

// ─── Controllers ─────────────────────────────────────────────────────────────
import { CicloVigenteController } from './interface/controllers/ciclos-vigentes.controller';
import { CiclosController } from './interface/controllers/ciclos.controller';
import { ClientesController } from './interface/controllers/clientes.controller';

@Module({
  imports: [AuthModule],
  controllers: [CicloVigenteController, CiclosController, ClientesController],
  providers: [
    { provide: CICLO_VIGENTE_REPOSITORY, useClass: PrismaCicloVigenteRepository },
    { provide: CICLO_CLIENTE_REPOSITORY, useClass: PrismaCicloClienteRepository },
    { provide: CLIENTE_EMAIL_CONFIG_REPOSITORY, useClass: PrismaClienteEmailConfigRepository },
    { provide: EMAIL_CONNECTION_VERIFIER, useClass: SmtpConnectionVerifier },

    // ─── Provisioning: ports + adapters (PR7) — masterUrl desde env, mismo
    // patrón que PrismaService (SharedModule). ─────────────────────────────
    {
      provide: POSTGRES_ADMIN_PORT,
      useFactory: () => new PostgresAdminService(process.env.DATABASE_URL_MASTER ?? ''),
    },
    {
      provide: TENANT_MIGRATION_RUNNER,
      useFactory: () => new TenantMigrationRunnerAdapter(process.env.DATABASE_URL_MASTER ?? ''),
    },
    {
      provide: TENANT_SEEDER,
      useFactory: () => new TenantSeederAdapter(process.env.DATABASE_URL_MASTER ?? ''),
    },
    {
      provide: ProvisionarTenantDatabaseUseCase,
      useFactory: (
        postgresAdmin: IPostgresAdminPort,
        migrationRunner: ITenantMigrationRunner,
        seeder: ITenantSeeder,
      ) => new ProvisionarTenantDatabaseUseCase(postgresAdmin, migrationRunner, seeder),
      inject: [POSTGRES_ADMIN_PORT, TENANT_MIGRATION_RUNNER, TENANT_SEEDER],
    },

    {
      provide: CrearCicloVigenteUseCase,
      useFactory: (repo: ICicloVigenteRepository) => new CrearCicloVigenteUseCase(repo),
      inject: [CICLO_VIGENTE_REPOSITORY],
    },
    {
      provide: ListarCiclosVigentesUseCase,
      useFactory: (repo: ICicloVigenteRepository) => new ListarCiclosVigentesUseCase(repo),
      inject: [CICLO_VIGENTE_REPOSITORY],
    },
    {
      provide: EditarCicloVigenteUseCase,
      useFactory: (repo: ICicloVigenteRepository) => new EditarCicloVigenteUseCase(repo),
      inject: [CICLO_VIGENTE_REPOSITORY],
    },
    {
      provide: EliminarCicloVigenteUseCase,
      useFactory: (repo: ICicloVigenteRepository) => new EliminarCicloVigenteUseCase(repo),
      inject: [CICLO_VIGENTE_REPOSITORY],
    },
    {
      provide: ListarCiclosVigentesAdminUseCase,
      useFactory: (repo: ICicloVigenteRepository) => new ListarCiclosVigentesAdminUseCase(repo),
      inject: [CICLO_VIGENTE_REPOSITORY],
    },
    {
      provide: ElegirCicloTenantUseCase,
      useFactory: (
        cicloVigenteRepo: ICicloVigenteRepository,
        cicloClienteRepo: ICicloClienteRepository,
      ) => new ElegirCicloTenantUseCase(cicloVigenteRepo, cicloClienteRepo),
      inject: [CICLO_VIGENTE_REPOSITORY, CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: ActivarCicloUseCase,
      useFactory: (repo: ICicloClienteRepository) => new ActivarCicloUseCase(repo),
      inject: [CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: DesactivarCicloUseCase,
      useFactory: (repo: ICicloClienteRepository) => new DesactivarCicloUseCase(repo),
      inject: [CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: ListarCiclosUseCase,
      useFactory: (repo: ICicloClienteRepository) => new ListarCiclosUseCase(repo),
      inject: [CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: ListarClientesUseCase,
      useFactory: (repo: IClienteRepository, emailConfigRepo: IClienteEmailConfigRepository) =>
        new ListarClientesUseCase(repo, emailConfigRepo),
      inject: [CLIENTE_REPOSITORY, CLIENTE_EMAIL_CONFIG_REPOSITORY],
    },
    {
      provide: EditarClienteUseCase,
      useFactory: (repo: IClienteRepository) => new EditarClienteUseCase(repo),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: DesactivarClienteUseCase,
      useFactory: (repo: IClienteRepository) => new DesactivarClienteUseCase(repo),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: ReactivarClienteUseCase,
      useFactory: (repo: IClienteRepository, migrationRunner: ITenantMigrationRunner) =>
        new ReactivarClienteUseCase(repo, migrationRunner),
      inject: [CLIENTE_REPOSITORY, TENANT_MIGRATION_RUNNER],
    },
    {
      provide: ConfigurarCorreoClienteUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        emailConfigRepo: IClienteEmailConfigRepository,
        connectionVerifier: IEmailConnectionVerifier,
      ) => new ConfigurarCorreoClienteUseCase(clienteRepo, emailConfigRepo, connectionVerifier),
      inject: [CLIENTE_REPOSITORY, CLIENTE_EMAIL_CONFIG_REPOSITORY, EMAIL_CONNECTION_VERIFIER],
    },
    {
      provide: QuitarCorreoClienteUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        emailConfigRepo: IClienteEmailConfigRepository,
      ) => new QuitarCorreoClienteUseCase(clienteRepo, emailConfigRepo),
      inject: [CLIENTE_REPOSITORY, CLIENTE_EMAIL_CONFIG_REPOSITORY],
    },
    {
      provide: ProbarCorreoClienteUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        emailConfigRepo: IClienteEmailConfigRepository,
        connectionVerifier: IEmailConnectionVerifier,
      ) => new ProbarCorreoClienteUseCase(clienteRepo, emailConfigRepo, connectionVerifier),
      inject: [CLIENTE_REPOSITORY, CLIENTE_EMAIL_CONFIG_REPOSITORY, EMAIL_CONNECTION_VERIFIER],
    },
    {
      provide: VerCorreoClienteUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        emailConfigRepo: IClienteEmailConfigRepository,
      ) => new VerCorreoClienteUseCase(clienteRepo, emailConfigRepo),
      inject: [CLIENTE_REPOSITORY, CLIENTE_EMAIL_CONFIG_REPOSITORY],
    },
    {
      provide: CrearClienteUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        roleRepo: IRoleRepository,
        hashProvider: IHashProvider,
        postgresAdmin: IPostgresAdminPort,
        provisionarTenantDatabase: ProvisionarTenantDatabaseUseCase,
      ) =>
        new CrearClienteUseCase(
          clienteRepo,
          usuarioRepo,
          membresiaRepo,
          roleRepo,
          hashProvider,
          postgresAdmin,
          provisionarTenantDatabase,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        ROLE_REPOSITORY,
        HASH_PROVIDER,
        POSTGRES_ADMIN_PORT,
        ProvisionarTenantDatabaseUseCase,
      ],
    },
  ],
  exports: [],
})
export class ClientesModule {}
