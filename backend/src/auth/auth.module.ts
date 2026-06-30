/**
 * AuthModule — módulo NestJS de autenticación y autorización.
 *
 * Wires:
 * - Repositories: USUARIO_REPOSITORY, REFRESH_TOKEN_REPOSITORY, ROLE_REPOSITORY
 *   + CLIENTE_REPOSITORY (cross-feature: LoginUseCase necesita verificar cliente activo)
 * - Services: HASH_PROVIDER (Argon2HashProvider), TOKEN_SERVICE (JwtTokenService)
 * - Use Cases: LoginUseCase, RefreshTokenUseCase, RevocarTokenUseCase,
 *              RevocarTodosTokensUsuarioUseCase, BajaUsuarioUseCase, AsignarRolUseCase
 * - Guards: JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard
 *   (providers aquí para que UseGuards pueda inyectarlos por clase en los controllers)
 * - Controllers: AuthController, UsuariosController
 *
 * NestJS DI notas:
 * - SharedModule es @Global → PrismaService, MasterContext, MASTER_TRANSACTION_RUNNER
 *   ya están disponibles sin importar SharedModule aquí.
 * - JwtModule.register provee JwtService para JwtTokenService.
 * - Use cases son plain classes (no @Injectable), instanciados via useFactory.
 * - Guards son @Injectable, declarados como providers para que NestJS los resuelva
 *   cuando se usan con UseGuards en UsuariosController (class-level guard injection).
 *
 * Tarea: 2.D.4
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

// ─── Repositories ─────────────────────────────────────────────────────────────
import { USUARIO_REPOSITORY } from './domain/ports/i-usuario.repository';
import { REFRESH_TOKEN_REPOSITORY } from './domain/ports/i-refresh-token.repository';
import { ROLE_REPOSITORY } from './domain/ports/i-role.repository';
import { CLIENTE_REPOSITORY } from '../clientes/domain/ports/i-cliente.repository';
import { PrismaUsuarioRepository } from './infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma/prisma-refresh-token.repository';
import { PrismaRoleRepository } from './infrastructure/persistence/prisma/prisma-role.repository';
import { PrismaClienteRepository } from '../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';

// ─── Services ─────────────────────────────────────────────────────────────────
import { HASH_PROVIDER } from './domain/ports/i-hash.provider';
import { TOKEN_SERVICE } from './domain/ports/i-token.service';
import { Argon2HashProvider } from './infrastructure/argon2-hash.provider';
import { JwtTokenService } from './infrastructure/jwt-token.service';

// ─── Use Cases ────────────────────────────────────────────────────────────────
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { RevocarTokenUseCase } from './application/use-cases/revocar-token.use-case';
import { RevocarTodosTokensUsuarioUseCase } from './application/use-cases/revocar-todos-tokens.use-case';
import { BajaUsuarioUseCase } from './application/use-cases/baja-usuario.use-case';
import { AsignarRolUseCase } from './application/use-cases/asignar-rol.use-case';
import { MASTER_TRANSACTION_RUNNER } from '../shared/domain/ports/i-master-transaction-runner';
import { IMasterTransactionRunner } from '../shared/domain/ports/i-master-transaction-runner';
import { IUsuarioRepository } from './domain/ports/i-usuario.repository';
import { IRefreshTokenRepository } from './domain/ports/i-refresh-token.repository';
import { IRoleRepository } from './domain/ports/i-role.repository';
import { IClienteRepository } from '../clientes/domain/ports/i-cliente.repository';
import { IHashProvider } from './domain/ports/i-hash.provider';
import { ITokenService } from './domain/ports/i-token.service';

// ─── Guards ───────────────────────────────────────────────────────────────────
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { PermissionsGuard } from './infrastructure/guards/permissions.guard';
import { TenantGuard } from './infrastructure/guards/tenant.guard';
import { GlobalAdminGuard } from './infrastructure/guards/global-admin.guard';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { AuthController } from './interface/controllers/auth.controller';
import { UsuariosController } from './interface/controllers/usuarios.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'soporte-dev-secret-change-in-prod',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController, UsuariosController],
  providers: [
    // ─── Repositories ────────────────────────────────────────────────────────
    {
      provide: USUARIO_REPOSITORY,
      useClass: PrismaUsuarioRepository,
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    {
      provide: ROLE_REPOSITORY,
      useClass: PrismaRoleRepository,
    },
    // CLIENTE_REPOSITORY: cross-feature. LoginUseCase verifica cliente activo.
    // SharedModule NO exporta este token, por eso lo declaramos aquí.
    {
      provide: CLIENTE_REPOSITORY,
      useClass: PrismaClienteRepository,
    },

    // ─── Services ─────────────────────────────────────────────────────────────
    {
      provide: HASH_PROVIDER,
      useClass: Argon2HashProvider,
    },
    {
      provide: TOKEN_SERVICE,
      useClass: JwtTokenService,
    },

    // ─── Use Cases (plain classes — instanciados via useFactory) ─────────────
    {
      provide: LoginUseCase,
      useFactory: (
        usuarioRepo: IUsuarioRepository,
        clienteRepo: IClienteRepository,
        hashProvider: IHashProvider,
        tokenService: ITokenService,
        refreshTokenRepo: IRefreshTokenRepository,
      ) => new LoginUseCase(usuarioRepo, clienteRepo, hashProvider, tokenService, refreshTokenRepo),
      inject: [
        USUARIO_REPOSITORY,
        CLIENTE_REPOSITORY,
        HASH_PROVIDER,
        TOKEN_SERVICE,
        REFRESH_TOKEN_REPOSITORY,
      ],
    },
    {
      provide: RefreshTokenUseCase,
      useFactory: (
        refreshTokenRepo: IRefreshTokenRepository,
        usuarioRepo: IUsuarioRepository,
        tokenService: ITokenService,
        clienteRepo: IClienteRepository,
      ) => new RefreshTokenUseCase(refreshTokenRepo, usuarioRepo, tokenService, clienteRepo),
      inject: [REFRESH_TOKEN_REPOSITORY, USUARIO_REPOSITORY, TOKEN_SERVICE, CLIENTE_REPOSITORY],
    },
    {
      provide: RevocarTokenUseCase,
      useFactory: (refreshTokenRepo: IRefreshTokenRepository) =>
        new RevocarTokenUseCase(refreshTokenRepo),
      inject: [REFRESH_TOKEN_REPOSITORY],
    },
    {
      provide: RevocarTodosTokensUsuarioUseCase,
      useFactory: (refreshTokenRepo: IRefreshTokenRepository) =>
        new RevocarTodosTokensUsuarioUseCase(refreshTokenRepo),
      inject: [REFRESH_TOKEN_REPOSITORY],
    },
    {
      provide: BajaUsuarioUseCase,
      useFactory: (
        usuarioRepo: IUsuarioRepository,
        refreshTokenRepo: IRefreshTokenRepository,
        masterTxRunner: IMasterTransactionRunner,
      ) => new BajaUsuarioUseCase(usuarioRepo, refreshTokenRepo, masterTxRunner),
      inject: [USUARIO_REPOSITORY, REFRESH_TOKEN_REPOSITORY, MASTER_TRANSACTION_RUNNER],
    },
    {
      provide: AsignarRolUseCase,
      useFactory: (usuarioRepo: IUsuarioRepository, roleRepo: IRoleRepository) =>
        new AsignarRolUseCase(usuarioRepo, roleRepo),
      inject: [USUARIO_REPOSITORY, ROLE_REPOSITORY],
    },

    // ─── Guards (Injectable — necesitan ser providers para inyección de clase) ─
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    TenantGuard,
    GlobalAdminGuard,
  ],
  exports: [
    // Exportamos TOKEN_SERVICE y guards para que otros módulos que importen
    // AuthModule puedan inyectarlos por clase (ej. ClientesModule, ReportesModule).
    TOKEN_SERVICE,
    JwtAuthGuard,
    GlobalAdminGuard,
    // TenantGuard y PermissionsGuard: usados por CiclosController (PR2) y
    // futuros módulos de rutas tenant-scoped (PR3-PR4).
    TenantGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
