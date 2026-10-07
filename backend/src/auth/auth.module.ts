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
 * - Guards: JwtAuthGuard, TenantGuard, AccionesGuard, AdminClienteGuard,
 *   GlobalAdminGuard (WU-7.3, sdd/matriz-permisos-por-usuario — reemplazan
 *   a PermissionsGuard/ModulosGuard) (providers para que `@UseGuards` pueda
 *   inyectarlos por clase en otros módulos, ej. TicketsModule).
 * - Controllers: AuthController.
 *
 * NestJS DI notas:
 * - SharedModule es `@Global()` → PrismaService, TenantContext, MasterContext
 *   y LOGGER (ILogger, wireado en este mismo PR — ver shared.module.ts) ya
 *   están disponibles sin importar SharedModule acá.
 * - JwtModule.register provee JwtService para JwtTokenService (HS256, 15min — R7).
 *
 * OJO al importar este módulo: el secreto sale de `config/entorno`, que valida
 * al evaluarse. Importar `AuthModule` arrastra esa evaluación, así que sin
 * `JWT_SECRET` en el entorno explota en el IMPORT, antes de cualquier
 * `beforeAll`. En la app real no se nota porque `main.ts` ya importó el guard
 * primero; un spec que arme `AuthModule` por su cuenta sí lo siente. Los tests
 * están cubiertos por `test/entorno-test.setup.ts`, que corre como
 * `setupFiles` y por eso llega a tiempo.
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
import { MATRIZ_PERMISOS_REPOSITORY } from './domain/ports/i-matriz-permisos.repository';
import { CLIENTE_REPOSITORY } from '../clientes/domain/ports/i-cliente.repository';
import { PrismaUsuarioRepository } from './infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMembresiaRepository } from './infrastructure/persistence/prisma/prisma-membresia.repository';
import { PrismaMatrizPermisosRepository } from './infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma/prisma-refresh-token.repository';
import { PrismaRoleRepository } from './infrastructure/persistence/prisma/prisma-role.repository';
import { PrismaClienteRepository } from '../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';

// ─── Services ────────────────────────────────────────────────────────────────
import { HASH_PROVIDER } from './domain/ports/i-hash.provider';
import { TOKEN_SERVICE, ITokenService } from './domain/ports/i-token.service';
import { Argon2HashProvider } from './infrastructure/argon2-hash.provider';
import { LIMITADOR_INTENTOS, ILimitadorIntentos } from './domain/ports/limitador-intentos.port';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { PrismaLimitadorIntentos } from './infrastructure/tfa/prisma-limitador-intentos';
import { TFA_REPOSITORY } from './domain/ports/tfa-repository.port';
import { PrismaTfaRepository } from './infrastructure/tfa/prisma-tfa.repository';
import { TOTP_SERVICE } from './domain/ports/totp-service.port';
import { TotpNativoService } from './infrastructure/tfa/totp-nativo.service';
import { SecretoTotpCifrado } from './application/tfa/secreto-totp-cifrado';
import { VerificadorCodigoTfa } from './application/tfa/verificador-codigo-tfa';
import { ConfirmadorSecretoPendiente } from './application/tfa/confirmador-secreto-pendiente';
import {
  ConfirmarSecretoTfa,
  IniciarSecretoTfa,
  ObtenerEstadoTfa,
  RegenerarCodigosTfa,
} from './application/tfa/tfa-cuenta.use-cases';
import { TfaCuentaController } from './interface/controllers/tfa-cuenta.controller';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import { entorno } from '../config/entorno';

// ─── Use Cases ───────────────────────────────────────────────────────────────
import {
  DESAFIO_LOGIN_REPOSITORY,
  IDesafioLoginRepository,
} from './domain/ports/desafio-login-repository.port';
import { PrismaDesafioLoginRepository } from './infrastructure/tfa/prisma-desafio-login.repository';
import {
  ConfirmarEnrolamientoLoginUseCase,
  IniciarEnrolamientoLoginUseCase,
  VerificarDesafioUseCase,
} from './application/tfa/desafio-login.use-cases';
import {
  ContinuarLoginUseCase,
  SeleccionarClienteLoginUseCase,
} from './application/tfa/continuar-login.use-cases';
import { EmitirSesionService } from './application/emitir-sesion.service';
import { TfaLoginController } from './interface/controllers/tfa-login.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { LogoutAllUseCase } from './application/use-cases/logout-all.use-case';
import { SwitchTenantUseCase } from './application/use-cases/switch-tenant.use-case';
import { CambiarPasswordUseCase } from './application/use-cases/cambiar-password.use-case';
import { ListarUsuariosTenantUseCase } from './application/use-cases/listar-usuarios-tenant.use-case';
import { CrearUsuarioTenantUseCase } from './application/use-cases/crear-usuario-tenant.use-case';
import { CambiarRolUsuarioTenantUseCase } from './application/use-cases/cambiar-rol-usuario-tenant.use-case';
import { EditarUsuarioTenantUseCase } from './application/use-cases/editar-usuario-tenant.use-case';
import { ResetearPasswordUsuarioTenantUseCase } from './application/use-cases/resetear-password-usuario-tenant.use-case';
import { DesactivarMembresiaUsuarioTenantUseCase } from './application/use-cases/desactivar-membresia-usuario-tenant.use-case';
import { ObtenerPermisosUsuarioTenantUseCase } from './application/use-cases/obtener-permisos-usuario-tenant.use-case';
import { AsignarPermisosUsuarioTenantUseCase } from './application/use-cases/asignar-permisos-usuario-tenant.use-case';
import { AplicarPresetPermisosUseCase } from './application/use-cases/aplicar-preset-permisos.use-case';
import { ListarRolesUseCase } from './application/use-cases/listar-roles.use-case';
import { IUsuarioRepository } from './domain/ports/i-usuario.repository';
import { IMembresiaRepository } from './domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from './domain/ports/i-matriz-permisos.repository';
import { IRefreshTokenRepository } from './domain/ports/i-refresh-token.repository';
import { IClienteRepository } from '../clientes/domain/ports/i-cliente.repository';
import { IHashProvider } from './domain/ports/i-hash.provider';
import { IRoleRepository } from './domain/ports/i-role.repository';

// ─── Guards ──────────────────────────────────────────────────────────────────
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from './infrastructure/guards/tenant.guard';
import { AccionesGuard } from './infrastructure/guards/acciones.guard';
import { AdminClienteGuard } from './infrastructure/guards/admin-cliente.guard';
import { GlobalAdminGuard } from './infrastructure/guards/global-admin.guard';

// ─── Controllers ─────────────────────────────────────────────────────────────
import { AuthController } from './interface/controllers/auth.controller';
import { UsuariosController } from './interface/controllers/usuarios.controller';
import { RolesController } from './interface/controllers/roles.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: entorno.JWT_SECRET,
      signOptions: { expiresIn: '15m', algorithm: 'HS256' },
    }),
  ],
  controllers: [
    AuthController,
    UsuariosController,
    RolesController,
    TfaCuentaController,
    TfaLoginController,
  ],
  providers: [
    // ─── Repositories ──────────────────────────────────────────────────────
    { provide: USUARIO_REPOSITORY, useClass: PrismaUsuarioRepository },
    { provide: MEMBRESIA_REPOSITORY, useClass: PrismaMembresiaRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    // MATRIZ_PERMISOS_REPOSITORY (WU-7.1, sdd/matriz-permisos-por-usuario):
    // inyectado en LoginUseCase/RefreshTokenUseCase/SwitchTenantUseCase vía
    // resolverScope (ADR-P6) y en el ABM de permisos (Obtener/Asignar/
    // AplicarPreset). USUARIO_CLIENTE_MODULO_REPOSITORY (ABM viejo de
    // módulos) se retiró en WU-7.6 junto con `GET/PATCH /usuarios/:id/modulos`.
    { provide: MATRIZ_PERMISOS_REPOSITORY, useClass: PrismaMatrizPermisosRepository },
    // CLIENTE_REPOSITORY: cross-feature. resolverScope/TenantGuard verifican
    // cliente activo. ClientesModule NO exporta este token todavía.
    { provide: CLIENTE_REPOSITORY, useClass: PrismaClienteRepository },

    { provide: TFA_REPOSITORY, useClass: PrismaTfaRepository },
    { provide: TOTP_SERVICE, useClass: TotpNativoService },
    // 2FA (sdd/verificacion-dos-pasos): primer consumidor, la autogestion de WU-4c.
    SecretoTotpCifrado,
    VerificadorCodigoTfa,
    ConfirmadorSecretoPendiente,
    ObtenerEstadoTfa,
    IniciarSecretoTfa,
    ConfirmarSecretoTfa,
    RegenerarCodigosTfa,
    // Login con segundo paso (WU-5a): desafios opacos y sus use cases, aun sin rutas (WU-5b).
    {
      provide: DESAFIO_LOGIN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaDesafioLoginRepository(prisma),
      inject: [PrismaService],
    },
    VerificarDesafioUseCase,
    IniciarEnrolamientoLoginUseCase,
    ConfirmarEnrolamientoLoginUseCase,
    // Continuar y seleccionar (WU-5b): unico punto donde el flujo de 2FA emite sesion.
    {
      provide: EmitirSesionService,
      useFactory: (
        membresiaRepo: IMembresiaRepository,
        clienteRepo: IClienteRepository,
        tokenService: ITokenService,
        refreshTokenRepo: IRefreshTokenRepository,
        permisosRepo: IMatrizPermisosRepository,
      ) =>
        new EmitirSesionService(
          membresiaRepo,
          clienteRepo,
          tokenService,
          refreshTokenRepo,
          permisosRepo,
        ),
      inject: [
        MEMBRESIA_REPOSITORY,
        CLIENTE_REPOSITORY,
        TOKEN_SERVICE,
        REFRESH_TOKEN_REPOSITORY,
        MATRIZ_PERMISOS_REPOSITORY,
      ],
    },
    ...[ContinuarLoginUseCase, SeleccionarClienteLoginUseCase].map((UseCase) => ({
      provide: UseCase,
      useFactory: (
        desafios: IDesafioLoginRepository,
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        emitirSesion: EmitirSesionService,
      ) => new UseCase(desafios, usuarioRepo, membresiaRepo, emitirSesion),
      inject: [
        DESAFIO_LOGIN_REPOSITORY,
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        EmitirSesionService,
      ],
    })),

    // ─── Services ───────────────────────────────────────────────────────────
    { provide: HASH_PROVIDER, useClass: Argon2HashProvider },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    {
      provide: LIMITADOR_INTENTOS,
      useFactory: (prisma: PrismaService) => new PrismaLimitadorIntentos(prisma),
      inject: [PrismaService],
    },
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
        permisosRepo: IMatrizPermisosRepository,
        limitador: ILimitadorIntentos,
      ) =>
        new LoginUseCase(
          usuarioRepo,
          membresiaRepo,
          clienteRepo,
          hashProvider,
          tokenService,
          refreshTokenRepo,
          permisosRepo,
          limitador,
        ),
      inject: [
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        CLIENTE_REPOSITORY,
        HASH_PROVIDER,
        TOKEN_SERVICE,
        REFRESH_TOKEN_REPOSITORY,
        MATRIZ_PERMISOS_REPOSITORY,
        LIMITADOR_INTENTOS,
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
        permisosRepo: IMatrizPermisosRepository,
      ) =>
        new RefreshTokenUseCase(
          refreshTokenRepo,
          usuarioRepo,
          membresiaRepo,
          clienteRepo,
          tokenService,
          permisosRepo,
        ),
      inject: [
        REFRESH_TOKEN_REPOSITORY,
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        CLIENTE_REPOSITORY,
        TOKEN_SERVICE,
        MATRIZ_PERMISOS_REPOSITORY,
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
        permisosRepo: IMatrizPermisosRepository,
        refreshTokenRepo: IRefreshTokenRepository,
      ) =>
        new SwitchTenantUseCase(
          membresiaRepo,
          clienteRepo,
          tokenService,
          logger,
          permisosRepo,
          refreshTokenRepo,
        ),
      inject: [
        MEMBRESIA_REPOSITORY,
        CLIENTE_REPOSITORY,
        TOKEN_SERVICE,
        LOGGER,
        MATRIZ_PERMISOS_REPOSITORY,
        // REFRESH_TOKEN_REPOSITORY (fix #168): el switch ahora mantiene al
        // día el scope del refresh token vigente — ver JSDoc de
        // SwitchTenantUseCase, punto 4.
        REFRESH_TOKEN_REPOSITORY,
      ],
    },
    // CambiarPasswordUseCase (sdd/cambio-de-contrasena, WU2): cambia la
    // contraseña del propio usuario autenticado y revoca sus sesiones.
    // `LOGGER`: degradación silenciosa si `revokeAllByUsuarioId` falla (D5).
    {
      provide: CambiarPasswordUseCase,
      useFactory: (
        usuarioRepo: IUsuarioRepository,
        hashProvider: IHashProvider,
        refreshTokenRepo: IRefreshTokenRepository,
        logger: ILogger,
      ) => new CambiarPasswordUseCase(usuarioRepo, hashProvider, refreshTokenRepo, logger),
      inject: [USUARIO_REPOSITORY, HASH_PROVIDER, REFRESH_TOKEN_REPOSITORY, LOGGER],
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
        aplicarPresetPermisosUseCase: AplicarPresetPermisosUseCase,
      ) =>
        new CrearUsuarioTenantUseCase(
          usuarioRepo,
          membresiaRepo,
          roleRepo,
          hashProvider,
          aplicarPresetPermisosUseCase,
        ),
      inject: [
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        ROLE_REPOSITORY,
        HASH_PROVIDER,
        AplicarPresetPermisosUseCase,
      ],
    },
    {
      provide: CambiarRolUsuarioTenantUseCase,
      useFactory: (
        membresiaRepo: IMembresiaRepository,
        roleRepo: IRoleRepository,
        aplicarPresetPermisosUseCase: AplicarPresetPermisosUseCase,
      ) =>
        new CambiarRolUsuarioTenantUseCase(membresiaRepo, roleRepo, aplicarPresetPermisosUseCase),
      inject: [MEMBRESIA_REPOSITORY, ROLE_REPOSITORY, AplicarPresetPermisosUseCase],
    },
    {
      provide: EditarUsuarioTenantUseCase,
      useFactory: (usuarioRepo: IUsuarioRepository, membresiaRepo: IMembresiaRepository) =>
        new EditarUsuarioTenantUseCase(usuarioRepo, membresiaRepo),
      inject: [USUARIO_REPOSITORY, MEMBRESIA_REPOSITORY],
    },
    // ResetearPasswordUsuarioTenantUseCase (sdd/reset-de-contrasena-por-admin,
    // ADR-2): molde exacto del provider de CambiarPasswordUseCase de arriba —
    // mismos 4 tokens de infraestructura más MEMBRESIA_REPOSITORY para el
    // scoping por tenant.
    {
      provide: ResetearPasswordUsuarioTenantUseCase,
      useFactory: (
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        hashProvider: IHashProvider,
        refreshTokenRepo: IRefreshTokenRepository,
        logger: ILogger,
      ) =>
        new ResetearPasswordUsuarioTenantUseCase(
          usuarioRepo,
          membresiaRepo,
          hashProvider,
          refreshTokenRepo,
          logger,
        ),
      inject: [
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        HASH_PROVIDER,
        REFRESH_TOKEN_REPOSITORY,
        LOGGER,
      ],
    },
    {
      provide: DesactivarMembresiaUsuarioTenantUseCase,
      useFactory: (membresiaRepo: IMembresiaRepository) =>
        new DesactivarMembresiaUsuarioTenantUseCase(membresiaRepo),
      inject: [MEMBRESIA_REPOSITORY],
    },
    {
      provide: ListarRolesUseCase,
      useFactory: (roleRepo: IRoleRepository) => new ListarRolesUseCase(roleRepo),
      inject: [ROLE_REPOSITORY],
    },
    // ─── ABM de la matriz de permisos (WU-7.4, sdd/matriz-permisos-por-usuario, ADR-P9/ADR-P10) ─
    {
      provide: AplicarPresetPermisosUseCase,
      useFactory: (permisosRepo: IMatrizPermisosRepository) =>
        new AplicarPresetPermisosUseCase(permisosRepo),
      inject: [MATRIZ_PERMISOS_REPOSITORY],
    },
    {
      provide: ObtenerPermisosUsuarioTenantUseCase,
      useFactory: (membresiaRepo: IMembresiaRepository, permisosRepo: IMatrizPermisosRepository) =>
        new ObtenerPermisosUsuarioTenantUseCase(membresiaRepo, permisosRepo),
      inject: [MEMBRESIA_REPOSITORY, MATRIZ_PERMISOS_REPOSITORY],
    },
    {
      provide: AsignarPermisosUsuarioTenantUseCase,
      useFactory: (permisosRepo: IMatrizPermisosRepository, membresiaRepo: IMembresiaRepository) =>
        new AsignarPermisosUsuarioTenantUseCase(permisosRepo, membresiaRepo),
      inject: [MATRIZ_PERMISOS_REPOSITORY, MEMBRESIA_REPOSITORY],
    },

    // ─── Guards (Injectable — providers para inyección de clase vía UseGuards) ─
    // WU-7.3 (sdd/matriz-permisos-por-usuario): PermissionsGuard/ModulosGuard
    // se retiran — AccionesGuard/AdminClienteGuard los reemplazan en TODOS
    // los controllers que los consumían.
    JwtAuthGuard,
    TenantGuard,
    AccionesGuard,
    AdminClienteGuard,
    GlobalAdminGuard,
  ],
  exports: [
    // TOKEN_SERVICE y los guards se exportan para que otros módulos que
    // importen AuthModule puedan inyectarlos por clase (ej. TicketsModule).
    TOKEN_SERVICE,
    JwtAuthGuard,
    TenantGuard,
    AccionesGuard,
    AdminClienteGuard,
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
    // REFRESH_TOKEN_REPOSITORY: consumido por ConfirmarResetPasswordUseCase
    // (RecuperacionPasswordModule, sdd/reseteo-contrasena-olvidada WU-6) para
    // revocar sesiones tras un reset exitoso — mismo criterio que los
    // tokens de arriba.
    REFRESH_TOKEN_REPOSITORY,
  ],
})
export class AuthModule {}
