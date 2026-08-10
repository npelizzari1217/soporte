/**
 * AuthModule — módulo NestJS del dominio "auth".
 *
 * Autenticación JWT (access + refresh), RBAC (roles/permisos vía membresías)
 * y guards de tenant/global-admin.
 *
 * Wires:
 * - Repositories: USUARIO_REPOSITORY, MEMBRESIA_REPOSITORY,
 *   REFRESH_TOKEN_REPOSITORY, ROLE_REPOSITORY + CLIENTE_REPOSITORY
 *   (cross-feature: LoginUseCase/resolverScope necesitan verificar cliente
 *   vivo — ClientesModule no exporta este token, se declara acá igual que
 *   en soporte1).
 * - Services: HASH_PROVIDER (Argon2HashProvider), TOKEN_SERVICE
 *   (JwtTokenService).
 * - Use Cases: LoginUseCase, RefreshTokenUseCase, LogoutUseCase,
 *   LogoutAllUseCase, SwitchTenantUseCase (plain classes, instanciadas vía
 *   useFactory).
 * - Guards: JwtAuthGuard, TenantGuard, PermissionsGuard, GlobalAdminGuard
 *   (providers para que `@UseGuards` pueda inyectarlos por clase en otros
 *   módulos, ej. TicketsModule).
 * - Controllers: AuthController.
 *
 * NestJS DI notas:
 * - SharedModule es `@Global()` → PrismaService, TenantContext, MasterContext
 *   y LOGGER (ILogger, wireado en este mismo PR — ver shared.module.ts) ya
 *   están disponibles sin importar SharedModule acá.
 * - JwtModule.register provee JwtService para JwtTokenService (HS256, 15min — R7).
 *
 * Tarea: T6.6 (PR6 — Guards + AuthController + AuthModule)
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

// ─── Repositories ───────────────────────────────────────────────────────────
import { USUARIO_REPOSITORY } from './domain/ports/i-usuario.repository';
import { MEMBRESIA_REPOSITORY } from './domain/ports/i-membresia.repository';
import { REFRESH_TOKEN_REPOSITORY } from './domain/ports/i-refresh-token.repository';
import { ROLE_REPOSITORY } from './domain/ports/i-role.repository';
import { USUARIO_CLIENTE_MODULO_REPOSITORY } from './domain/ports/i-usuario-cliente-modulo.repository';
import { CLIENTE_REPOSITORY } from '../clientes/domain/ports/i-cliente.repository';
import { PrismaUsuarioRepository } from './infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMembresiaRepository } from './infrastructure/persistence/prisma/prisma-membresia.repository';
import { PrismaUsuarioClienteModuloRepository } from './infrastructure/persistence/prisma/prisma-usuario-cliente-modulo.repository';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma/prisma-refresh-token.repository';
import { PrismaRoleRepository } from './infrastructure/persistence/prisma/prisma-role.repository';
import { PrismaClienteRepository } from '../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';

// ─── Services ────────────────────────────────────────────────────────────────
import { HASH_PROVIDER } from './domain/ports/i-hash.provider';
import { TOKEN_SERVICE, ITokenService } from './domain/ports/i-token.service';
import { Argon2HashProvider } from './infrastructure/argon2-hash.provider';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';

// ─── Use Cases ───────────────────────────────────────────────────────────────
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { LogoutAllUseCase } from './application/use-cases/logout-all.use-case';
import { SwitchTenantUseCase } from './application/use-cases/switch-tenant.use-case';
import { ListarUsuariosTenantUseCase } from './application/use-cases/listar-usuarios-tenant.use-case';
import { CrearUsuarioTenantUseCase } from './application/use-cases/crear-usuario-tenant.use-case';
import { CambiarRolUsuarioTenantUseCase } from './application/use-cases/cambiar-rol-usuario-tenant.use-case';
import { EditarUsuarioTenantUseCase } from './application/use-cases/editar-usuario-tenant.use-case';
import { DesactivarMembresiaUsuarioTenantUseCase } from './application/use-cases/desactivar-membresia-usuario-tenant.use-case';
import { AsignarModulosUsuarioTenantUseCase } from './application/use-cases/asignar-modulos-usuario-tenant.use-case';
import { ObtenerModulosUsuarioTenantUseCase } from './application/use-cases/obtener-modulos-usuario-tenant.use-case';
import { ListarRolesUseCase } from './application/use-cases/listar-roles.use-case';
import { IUsuarioRepository } from './domain/ports/i-usuario.repository';
import { IMembresiaRepository } from './domain/ports/i-membresia.repository';
import { IUsuarioClienteModuloRepository } from './domain/ports/i-usuario-cliente-modulo.repository';
import { IRefreshTokenRepository } from './domain/ports/i-refresh-token.repository';
import { IClienteRepository } from '../clientes/domain/ports/i-cliente.repository';
import { IHashProvider } from './domain/ports/i-hash.provider';
import { IRoleRepository } from './domain/ports/i-role.repository';

// ─── Guards ──────────────────────────────────────────────────────────────────
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from './infrastructure/guards/tenant.guard';
import { PermissionsGuard } from './infrastructure/guards/permissions.guard';
import { GlobalAdminGuard } from './infrastructure/guards/global-admin.guard';

// ─── Controllers ─────────────────────────────────────────────────────────────
import { AuthController } from './interface/controllers/auth.controller';
import { UsuariosController } from './interface/controllers/usuarios.controller';
import { RolesController } from './interface/controllers/roles.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'soporte-dev-secret-change-in-prod',
      signOptions: { expiresIn: '15m', algorithm: 'HS256' },
    }),
  ],
  controllers: [AuthController, UsuariosController, RolesController],
  providers: [
    // ─── Repositories ──────────────────────────────────────────────────────
    { provide: USUARIO_REPOSITORY, useClass: PrismaUsuarioRepository },
    { provide: MEMBRESIA_REPOSITORY, useClass: PrismaMembresiaRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    {
      provide: USUARIO_CLIENTE_MODULO_REPOSITORY,
      useClass: PrismaUsuarioClienteModuloRepository,
    },
    // CLIENTE_REPOSITORY: cross-feature. resolverScope/TenantGuard verifican
    // cliente activo. ClientesModule NO exporta este token todavía.
    { provide: CLIENTE_REPOSITORY, useClass: PrismaClienteRepository },

    // ─── Services ───────────────────────────────────────────────────────────
    { provide: HASH_PROVIDER, useClass: Argon2HashProvider },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    // LOGGER: provisto globalmente por SharedModule (@Global) — no se
    // redeclara acá, solo se inyecta vía el token en el factory de abajo.

    // ─── Use Cases (plain classes — instanciadas vía useFactory) ────────────
    {
      provide: LoginUseCase,
      useFactory: (
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        clienteRepo: IClienteRepository,
        hashProvider: IHashProvider,
        tokenService: ITokenService,
        refreshTokenRepo: IRefreshTokenRepository,
        modulosRepo: IUsuarioClienteModuloRepository,
      ) =>
        new LoginUseCase(
          usuarioRepo,
          membresiaRepo,
          clienteRepo,
          hashProvider,
          tokenService,
          refreshTokenRepo,
          modulosRepo,
        ),
      inject: [
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        CLIENTE_REPOSITORY,
        HASH_PROVIDER,
        TOKEN_SERVICE,
        REFRESH_TOKEN_REPOSITORY,
        USUARIO_CLIENTE_MODULO_REPOSITORY,
      ],
    },
    {
      provide: RefreshTokenUseCase,
      useFactory: (
        refreshTokenRepo: IRefreshTokenRepository,
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        clienteRepo: IClienteRepository,
        tokenService: ITokenService,
        modulosRepo: IUsuarioClienteModuloRepository,
      ) =>
        new RefreshTokenUseCase(
          refreshTokenRepo,
          usuarioRepo,
          membresiaRepo,
          clienteRepo,
          tokenService,
          modulosRepo,
        ),
      inject: [
        REFRESH_TOKEN_REPOSITORY,
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        CLIENTE_REPOSITORY,
        TOKEN_SERVICE,
        USUARIO_CLIENTE_MODULO_REPOSITORY,
      ],
    },
    {
      provide: LogoutUseCase,
      useFactory: (refreshTokenRepo: IRefreshTokenRepository) =>
        new LogoutUseCase(refreshTokenRepo),
      inject: [REFRESH_TOKEN_REPOSITORY],
    },
    {
      provide: LogoutAllUseCase,
      useFactory: (refreshTokenRepo: IRefreshTokenRepository) =>
        new LogoutAllUseCase(refreshTokenRepo),
      inject: [REFRESH_TOKEN_REPOSITORY],
    },
    {
      provide: SwitchTenantUseCase,
      useFactory: (
        membresiaRepo: IMembresiaRepository,
        clienteRepo: IClienteRepository,
        tokenService: ITokenService,
        logger: ILogger,
        modulosRepo: IUsuarioClienteModuloRepository,
      ) => new SwitchTenantUseCase(membresiaRepo, clienteRepo, tokenService, logger, modulosRepo),
      inject: [
        MEMBRESIA_REPOSITORY,
        CLIENTE_REPOSITORY,
        TOKEN_SERVICE,
        LOGGER,
        USUARIO_CLIENTE_MODULO_REPOSITORY,
      ],
    },
    // ─── Gestión mínima de usuarios (sdd/beta-frontend/spec §5) ──────────────
    {
      provide: ListarUsuariosTenantUseCase,
      useFactory: (membresiaRepo: IMembresiaRepository) =>
        new ListarUsuariosTenantUseCase(membresiaRepo),
      inject: [MEMBRESIA_REPOSITORY],
    },
    {
      provide: CrearUsuarioTenantUseCase,
      useFactory: (
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        roleRepo: IRoleRepository,
        hashProvider: IHashProvider,
      ) => new CrearUsuarioTenantUseCase(usuarioRepo, membresiaRepo, roleRepo, hashProvider),
      inject: [USUARIO_REPOSITORY, MEMBRESIA_REPOSITORY, ROLE_REPOSITORY, HASH_PROVIDER],
    },
    {
      provide: CambiarRolUsuarioTenantUseCase,
      useFactory: (membresiaRepo: IMembresiaRepository, roleRepo: IRoleRepository) =>
        new CambiarRolUsuarioTenantUseCase(membresiaRepo, roleRepo),
      inject: [MEMBRESIA_REPOSITORY, ROLE_REPOSITORY],
    },
    {
      provide: EditarUsuarioTenantUseCase,
      useFactory: (usuarioRepo: IUsuarioRepository, membresiaRepo: IMembresiaRepository) =>
        new EditarUsuarioTenantUseCase(usuarioRepo, membresiaRepo),
      inject: [USUARIO_REPOSITORY, MEMBRESIA_REPOSITORY],
    },
    {
      provide: DesactivarMembresiaUsuarioTenantUseCase,
      useFactory: (membresiaRepo: IMembresiaRepository) =>
        new DesactivarMembresiaUsuarioTenantUseCase(membresiaRepo),
      inject: [MEMBRESIA_REPOSITORY],
    },
    // ─── Asignación de módulos (feature 5.2 CAPA 4) ─────────────────────────
    {
      provide: ObtenerModulosUsuarioTenantUseCase,
      useFactory: (modulosRepo: IUsuarioClienteModuloRepository) =>
        new ObtenerModulosUsuarioTenantUseCase(modulosRepo),
      inject: [USUARIO_CLIENTE_MODULO_REPOSITORY],
    },
    {
      provide: AsignarModulosUsuarioTenantUseCase,
      useFactory: (
        modulosRepo: IUsuarioClienteModuloRepository,
        membresiaRepo: IMembresiaRepository,
      ) => new AsignarModulosUsuarioTenantUseCase(modulosRepo, membresiaRepo),
      inject: [USUARIO_CLIENTE_MODULO_REPOSITORY, MEMBRESIA_REPOSITORY],
    },
    {
      provide: ListarRolesUseCase,
      useFactory: (roleRepo: IRoleRepository) => new ListarRolesUseCase(roleRepo),
      inject: [ROLE_REPOSITORY],
    },

    // ─── Guards (Injectable — providers para inyección de clase vía UseGuards) ─
    JwtAuthGuard,
    TenantGuard,
    PermissionsGuard,
    GlobalAdminGuard,
  ],
  exports: [
    // TOKEN_SERVICE y los guards se exportan para que otros módulos que
    // importen AuthModule puedan inyectarlos por clase (ej. TicketsModule).
    TOKEN_SERVICE,
    JwtAuthGuard,
    TenantGuard,
    PermissionsGuard,
    GlobalAdminGuard,
    // CLIENTE_REPOSITORY: dependencia de TenantGuard (exportado arriba). Nest
    // resuelve las dependencias de un provider exportado usando el
    // contenedor del módulo CONSUMIDOR, no el de AuthModule — sin exportar
    // también este token, cualquier módulo que use `TenantGuard` vía
    // `@UseGuards` (ej. TicketsModule, futuros PRs) fallaría en runtime con
    // "Nest can't resolve dependencies... CLIENTE_REPOSITORY". Encontrado y
    // corregido en el e2e de este mismo PR (T6.5/T6.6).
    CLIENTE_REPOSITORY,
    // USUARIO_REPOSITORY/MEMBRESIA_REPOSITORY/ROLE_REPOSITORY/HASH_PROVIDER:
    // consumidos por CrearClienteUseCase (PR8, ClientesModule) para crear el
    // admin inicial + su membresía ADMINISTRADOR al provisionar un cliente
    // nuevo (R16). Mismo criterio que CLIENTE_REPOSITORY arriba — sin
    // exportarlos, ClientesModule (que importa AuthModule) no podría
    // inyectarlos en el factory de CrearClienteUseCase.
    USUARIO_REPOSITORY,
    MEMBRESIA_REPOSITORY,
    ROLE_REPOSITORY,
    HASH_PROVIDER,
  ],
})
export class AuthModule {}
