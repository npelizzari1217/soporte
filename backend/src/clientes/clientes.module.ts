import { Module, forwardRef } from '@nestjs/common';

// ─── Ports (tokens DI) ─────────────────────────────────────────────────────────
import { CLIENTE_REPOSITORY } from './domain/ports/i-cliente.repository';
import { CICLO_VIGENTE_REPOSITORY } from './domain/ports/i-ciclo-vigente.repository';
import { POSTGRES_ADMIN } from './application/ports/i-postgres-admin.port';
import { TENANT_MIGRATION_RUNNER } from './application/ports/i-tenant-migration-runner';
import { TENANT_SEEDER } from './application/ports/i-tenant-seeder';

// ─── Ports interfaces (para useFactory typing) ───────────────────────────────
import { IClienteRepository } from './domain/ports/i-cliente.repository';
import { ICicloVigenteRepository } from './domain/ports/i-ciclo-vigente.repository';
import { IPostgresAdminPort } from './application/ports/i-postgres-admin.port';
import { ITenantMigrationRunner } from './application/ports/i-tenant-migration-runner';
import { ITenantSeeder } from './application/ports/i-tenant-seeder';
import { IUsuarioRepository } from '../auth/domain/ports/i-usuario.repository';
import { IRoleRepository } from '../auth/domain/ports/i-role.repository';
import { IHashProvider } from '../auth/domain/ports/i-hash.provider';
import { USUARIO_REPOSITORY } from '../auth/domain/ports/i-usuario.repository';
import { ROLE_REPOSITORY } from '../auth/domain/ports/i-role.repository';
import { HASH_PROVIDER } from '../auth/domain/ports/i-hash.provider';

// ─── Infrastructure (repositorios concretos) ──────────────────────────────────
import { PrismaClienteRepository } from './infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaCicloVigenteRepository } from './infrastructure/persistence/prisma/prisma-ciclo-vigente.repository';
import { PrismaUsuarioRepository } from '../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaRoleRepository } from '../auth/infrastructure/persistence/prisma/prisma-role.repository';
import { Argon2HashProvider } from '../auth/infrastructure/argon2-hash.provider';
import { MasterContext } from '../shared/tenancy/master-context';

// ─── Infrastructure (adapters de integración — Batch 4) ──────────────────────
import { PostgresAdminService } from '../shared/infrastructure/persistence/postgres-admin.service';
import { PostgresAdminAdapter } from './infrastructure/postgres-admin.adapter';
import { TenantMigrationRunnerAdapter } from './infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from './infrastructure/tenant-seeder.adapter';

// ─── Use Cases ────────────────────────────────────────────────────────────────
import { RegistrarClienteUseCase } from './application/use-cases/registrar-cliente.use-case';
import { SuspenderClienteUseCase } from './application/use-cases/suspender-cliente.use-case';
import { ReactivarClienteUseCase } from './application/use-cases/reactivar-cliente.use-case';
import { CrearCicloVigenteUseCase } from './application/use-cases/crear-ciclo-vigente.use-case';
import { CrearClienteUseCase } from './application/use-cases/crear-cliente.use-case';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { ClientesController } from './interface/controllers/clientes.controller';
import { CiclosVigentesController } from './interface/controllers/ciclos-vigentes.controller';

// ─── AuthModule (para JwtAuthGuard + TOKEN_SERVICE) ───────────────────────────
import { AuthModule } from '../auth/auth.module';

/**
 * ClientesModule — wiring NestJS del módulo de clientes + provisioning tenant.
 *
 * A partir de Batch 4 (Fase 7) este módulo también provee:
 *   - PostgresAdminService: operaciones DDL de DB (CREATE/DROP/EXISTS).
 *   - PostgresAdminAdapter: adapter de IPostgresAdminPort (delega al servicio).
 *   - TenantMigrationRunnerAdapter: adapter de ITenantMigrationRunner (exec prisma migrate).
 *   - TenantSeederAdapter: adapter de ITenantSeeder (INSERT catálogos vía pg.Pool).
 *   - CrearClienteUseCase: provisioning completo (usa los 3 adapters anteriores).
 *
 * Nota DI:
 *   SharedModule es @Global() → PrismaService, TenantContext, MasterContext disponibles.
 *   AuthModule se importa (T1.4/T1.6, PR1 admin-general) para resolver JwtAuthGuard
 *   y TOKEN_SERVICE requeridos por los guards en ClientesController/CiclosVigentesController.
 *   AuthModule NO importa ClientesModule → sin circularidad.
 *   Los repos de auth (USUARIO_REPOSITORY, ROLE_REPOSITORY, HASH_PROVIDER) se siguen
 *   re-registrando localmente para CrearClienteUseCase (evita conflicto con los providers
 *   ya exportados por AuthModule con el mismo token).
 *
 *   IMPORTANTE: PrismaService NO se declara aquí (es @Global desde SharedModule).
 *   Re-declararlo como useClass: PrismaService lanzaría UnknownDependenciesException.
 *
 * Tarea: 1.D.2 (base) + Batch 4 Parte B (wiring provisioning) + T1.4/T1.6 (guards)
 */
@Module({
  imports: [
    // AuthModule exporta TOKEN_SERVICE + JwtAuthGuard → necesarios para los guards
    // aplicados en ClientesController y CiclosVigentesController (T1.4/T1.6).
    // AuthModule NO importa ClientesModule → sin circularidad.
    forwardRef(() => AuthModule),
  ],
  controllers: [ClientesController, CiclosVigentesController],
  providers: [
    // ─── Repositorios CLIENTES (adaptadores de infraestructura) ──────────────
    {
      provide: CLIENTE_REPOSITORY,
      useClass: PrismaClienteRepository,
    },
    {
      provide: CICLO_VIGENTE_REPOSITORY,
      useClass: PrismaCicloVigenteRepository,
    },

    // ─── Repositorios AUTH necesarios para CrearClienteUseCase ───────────────
    // PrismaUsuarioRepository y PrismaRoleRepository son @Injectable() con deps
    // del SharedModule (@Global) → se pueden proveer localmente sin conflicto.
    {
      provide: USUARIO_REPOSITORY,
      useClass: PrismaUsuarioRepository,
    },
    {
      provide: ROLE_REPOSITORY,
      useClass: PrismaRoleRepository,
    },
    {
      provide: HASH_PROVIDER,
      useClass: Argon2HashProvider,
    },

    // MasterContext: disponible via SharedModule @Global, pero lo re-declaramos
    // para que PrismaUsuarioRepository (que lo inyecta por clase) lo reciba aquí.
    MasterContext,

    // ─── PostgresAdminService (infra concreta para el adapter) ───────────────
    // Se instancia aquí (no en SharedModule) porque solo lo necesita ClientesModule.
    // masterUrl viene de DATABASE_URL_MASTER (misma var que PrismaService).
    {
      provide: PostgresAdminService,
      useFactory: () => new PostgresAdminService(process.env.DATABASE_URL_MASTER ?? ''),
    },

    // ─── Adapters de integración (Batch 4 — Parte A) ─────────────────────────

    // IPostgresAdminPort → PostgresAdminAdapter (delega a PostgresAdminService)
    {
      provide: POSTGRES_ADMIN,
      useClass: PostgresAdminAdapter,
    },

    // ITenantMigrationRunner → TenantMigrationRunnerAdapter (exec prisma migrate)
    {
      provide: TENANT_MIGRATION_RUNNER,
      useFactory: () => new TenantMigrationRunnerAdapter(process.env.DATABASE_URL_MASTER ?? ''),
    },

    // ITenantSeeder → TenantSeederAdapter (INSERT catálogos vía pg.Pool)
    {
      provide: TENANT_SEEDER,
      useFactory: () => new TenantSeederAdapter(process.env.DATABASE_URL_MASTER ?? ''),
    },

    // ─── Use Cases (application — plain classes, no @Injectable) ─────────────
    {
      provide: RegistrarClienteUseCase,
      useFactory: (repo: IClienteRepository) => new RegistrarClienteUseCase(repo),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: SuspenderClienteUseCase,
      useFactory: (repo: IClienteRepository) => new SuspenderClienteUseCase(repo),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: ReactivarClienteUseCase,
      useFactory: (repo: IClienteRepository) => new ReactivarClienteUseCase(repo),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: CrearCicloVigenteUseCase,
      useFactory: (repo: ICicloVigenteRepository) => new CrearCicloVigenteUseCase(repo),
      inject: [CICLO_VIGENTE_REPOSITORY],
    },

    // CrearClienteUseCase — provisioning completo (Fase 7 Batch 4)
    {
      provide: CrearClienteUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        usuarioRepo: IUsuarioRepository,
        roleRepo: IRoleRepository,
        adminPort: IPostgresAdminPort,
        migrationRunner: ITenantMigrationRunner,
        seeder: ITenantSeeder,
        hashProvider: IHashProvider,
      ) =>
        new CrearClienteUseCase(
          clienteRepo,
          usuarioRepo,
          roleRepo,
          adminPort,
          migrationRunner,
          seeder,
          hashProvider,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        USUARIO_REPOSITORY,
        ROLE_REPOSITORY,
        POSTGRES_ADMIN,
        TENANT_MIGRATION_RUNNER,
        TENANT_SEEDER,
        HASH_PROVIDER,
      ],
    },
  ],
  exports: [
    RegistrarClienteUseCase,
    SuspenderClienteUseCase,
    ReactivarClienteUseCase,
    CrearCicloVigenteUseCase,
    CrearClienteUseCase,
    CLIENTE_REPOSITORY,
  ],
})
export class ClientesModule {}
