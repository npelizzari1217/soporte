import { Module, forwardRef } from '@nestjs/common';

// ─── Ports (tokens DI) ─────────────────────────────────────────────────────────
import { CLIENTE_REPOSITORY } from './domain/ports/i-cliente.repository';
import { CICLO_VIGENTE_REPOSITORY } from './domain/ports/i-ciclo-vigente.repository';
import { CICLO_CLIENTE_ADMIN_REPOSITORY } from './domain/ports/i-ciclo-cliente.repository';
import { POSTGRES_ADMIN } from './application/ports/i-postgres-admin.port';
import { TENANT_MIGRATION_RUNNER } from './application/ports/i-tenant-migration-runner';
import { TENANT_SEEDER } from './application/ports/i-tenant-seeder';

// ─── Ports interfaces (para useFactory typing) ───────────────────────────────
import { IClienteRepository } from './domain/ports/i-cliente.repository';
import { ICicloVigenteRepository } from './domain/ports/i-ciclo-vigente.repository';
import { ICicloClienteRepository } from './domain/ports/i-ciclo-cliente.repository';
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
import { PrismaCicloClienteRepository } from './infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
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
import { ListarClientesUseCase } from './application/use-cases/listar-clientes.use-case';
import { RegistrarClienteUseCase } from './application/use-cases/registrar-cliente.use-case';
import { SuspenderClienteUseCase } from './application/use-cases/suspender-cliente.use-case';
import { ReactivarClienteUseCase } from './application/use-cases/reactivar-cliente.use-case';
import { CrearCicloVigenteUseCase } from './application/use-cases/crear-ciclo-vigente.use-case';
import { ListarCiclosVigentesUseCase } from './application/use-cases/listar-ciclos-vigentes.use-case';
import { EditarCicloVigenteUseCase } from './application/use-cases/editar-ciclo-vigente.use-case';
import { DesactivarCicloVigenteUseCase } from './application/use-cases/desactivar-ciclo-vigente.use-case';
import { CrearClienteUseCase } from './application/use-cases/crear-cliente.use-case';
import { ListarCiclosUseCase } from './application/use-cases/listar-ciclos.use-case';
import { ElegirCicloTenantUseCase } from './application/use-cases/elegir-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from './application/use-cases/activar-ciclo.use-case';
import { ObtenerCicloActivoUseCase } from './application/use-cases/obtener-ciclo-activo.use-case';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { ClientesController } from './interface/controllers/clientes.controller';
import { CiclosVigentesController } from './interface/controllers/ciclos-vigentes.controller';
import { CiclosController } from './interface/controllers/ciclos.controller';

// ─── AuthModule (para JwtAuthGuard + TOKEN_SERVICE + TenantGuard + PermissionsGuard) ──────
import { AuthModule } from '../auth/auth.module';

/**
 * ClientesModule — wiring NestJS del módulo de clientes + provisioning tenant.
 *
 * A partir de PR2 (admin-general T2.16) este módulo también provee:
 *   - ListarClientesUseCase: GET /clientes (solo operador global).
 *   - PrismaCicloClienteRepository: repositorio tenant-scoped para ciclos de gestión.
 *   - ListarCiclosUseCase: GET /ciclos (ciclos del tenant activo).
 *   - ElegirCicloTenantUseCase: POST /ciclos (elige un ciclo del catálogo master, ADR-3).
 *   - ActivarCicloUseCase: PATCH /ciclos/:id/activar (activa un ciclo atómicamente).
 *   - ObtenerCicloActivoUseCase: GET /ciclos/activo (lectura del activo, ADR-8).
 *   - CiclosController: endpoints /ciclos (tenant-level, ciclos_cliente).
 *
 * Guards disponibles via AuthModule (forwardRef):
 *   - JwtAuthGuard, GlobalAdminGuard: exportados desde PR1.
 *   - TenantGuard, PermissionsGuard: exportados desde PR2 (T2.16).
 *   - PermissionsOrGlobalAdminGuard: exportado desde AuthModule (T3.2, Fase 3) —
 *     usado en POST /ciclos y PATCH /ciclos/:id/activar (ciclo:gestionar O global admin).
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
 * Tarea: 1.D.2 (base) + Batch 4 Parte B (wiring provisioning) + T1.4/T1.6 (guards) + T2.16 (PR2)
 */
@Module({
  imports: [
    // AuthModule exporta TOKEN_SERVICE + JwtAuthGuard + GlobalAdminGuard + TenantGuard + PermissionsGuard
    // → necesarios para los guards aplicados en los controllers de este módulo.
    // AuthModule NO importa ClientesModule → sin circularidad.
    forwardRef(() => AuthModule),
  ],
  controllers: [ClientesController, CiclosVigentesController, CiclosController],
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
    // PrismaCicloClienteRepository (PR2): repositorio tenant-scoped para ciclos de gestión.
    // Usa TenantContext (disponible via SharedModule @Global) para el client de la DB del tenant.
    {
      provide: CICLO_CLIENTE_ADMIN_REPOSITORY,
      useClass: PrismaCicloClienteRepository,
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

    // PR2: ListarClientesUseCase (GET /clientes — solo operador global)
    {
      provide: ListarClientesUseCase,
      useFactory: (repo: IClienteRepository) => new ListarClientesUseCase(repo),
      inject: [CLIENTE_REPOSITORY],
    },
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
    // T2.8: Use cases del CRUD del catálogo master (GET/PATCH/DELETE /ciclos-vigentes)
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
      provide: DesactivarCicloVigenteUseCase,
      useFactory: (repo: ICicloVigenteRepository) => new DesactivarCicloVigenteUseCase(repo),
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

    // PR2: Use cases de ciclos tenant-level (GET/POST /ciclos, PATCH /ciclos/:id/activar)
    {
      provide: ListarCiclosUseCase,
      useFactory: (repo: ICicloClienteRepository) => new ListarCiclosUseCase(repo),
      inject: [CICLO_CLIENTE_ADMIN_REPOSITORY],
    },
    {
      provide: ElegirCicloTenantUseCase,
      useFactory: (vigenteRepo: ICicloVigenteRepository, clienteRepo: ICicloClienteRepository) =>
        new ElegirCicloTenantUseCase(vigenteRepo, clienteRepo),
      inject: [CICLO_VIGENTE_REPOSITORY, CICLO_CLIENTE_ADMIN_REPOSITORY],
    },
    {
      provide: ActivarCicloUseCase,
      useFactory: (repo: ICicloClienteRepository) => new ActivarCicloUseCase(repo),
      inject: [CICLO_CLIENTE_ADMIN_REPOSITORY],
    },
    {
      provide: ObtenerCicloActivoUseCase,
      useFactory: (repo: ICicloClienteRepository) => new ObtenerCicloActivoUseCase(repo),
      inject: [CICLO_CLIENTE_ADMIN_REPOSITORY],
    },
  ],
  exports: [
    ListarClientesUseCase,
    RegistrarClienteUseCase,
    SuspenderClienteUseCase,
    ReactivarClienteUseCase,
    CrearCicloVigenteUseCase,
    CrearClienteUseCase,
    ListarCiclosUseCase,
    ElegirCicloTenantUseCase,
    ActivarCicloUseCase,
    ObtenerCicloActivoUseCase,
    CLIENTE_REPOSITORY,
  ],
})
export class ClientesModule {}
