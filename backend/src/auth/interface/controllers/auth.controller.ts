/**
 * AuthController — endpoints de autenticación REST.
 *
 * Rutas:
 *   POST /auth/login       → LoginUseCase (R3–R6)
 *   POST /auth/refresh     → RefreshTokenUseCase (R8)
 *   POST /auth/logout      → LogoutUseCase (R9)
 *   POST /auth/logout-all  → LogoutAllUseCase (R9, usuario autenticado)
 *   POST /auth/switch           → SwitchTenantUseCase (R10, usuario autenticado)
 *   POST /auth/change-password → CambiarPasswordUseCase (sdd/cambio-de-contrasena, usuario autenticado)
 *   GET  /auth/me               → payload del JWT actual (usuario autenticado)
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use cases.
 * El mapeo de errores de dominio a HttpException se hace acá (presentación).
 *
 * Guards:
 * - /login y /refresh: sin guard (públicos — son el punto de entrada).
 * - /logout: sin guard (el refresh token crudo en el body ya es la prueba
 *   de posesión; no requiere un access token vigente).
 * - /logout-all, /switch, /change-password, /me: JwtAuthGuard (necesitan el
 *   actor autenticado). `/change-password` NO usa TenantGuard ni permiso de
 *   módulo: es una acción sobre la cuenta propia, no sobre un tenant.
 *
 * Tarea: T6.5 (PR6 — Guards + AuthController + AuthModule) · WU2
 * (sdd/cambio-de-contrasena) para `/change-password`.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { LogoutAllUseCase } from '../../application/use-cases/logout-all.use-case';
import { SwitchTenantUseCase } from '../../application/use-cases/switch-tenant.use-case';
import { CambiarPasswordUseCase } from '../../application/use-cases/cambiar-password.use-case';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../infrastructure/guards/decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';
import {
  CambiarPasswordRequestDto,
  LoginRequestDto,
  LogoutRequestDto,
  RefreshRequestDto,
  LoginResponseDto,
  SwitchTenantRequestDto,
  SwitchTenantResponseDto,
  TokensResponseDto,
} from '../dtos/auth.dto';
import {
  ClienteNoAutorizadoError,
  CredencialesInvalidasError,
  PasswordActualIncorrectaError,
  PasswordNuevaIgualAActualError,
  SinMembresiaActivaError,
  TokenExpiradoError,
  TokenInvalidoError,
  TokenRevocadoError,
  UsuarioNoDisponibleError,
} from '../../domain/errors/auth.errors';
import { ipDelNavegador, RequestConIp } from '../ip-del-navegador';
import { DomainError } from '../../../shared/domain/result';
import { ILogger, LOGGER } from '../../../shared/domain/ports/i-logger.port';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly logoutAllUseCase: LogoutAllUseCase,
    private readonly switchTenantUseCase: SwitchTenantUseCase,
    private readonly cambiarPasswordUseCase: CambiarPasswordUseCase,
    @Inject(LOGGER) private readonly logger: ILogger,
  ) {}

  /**
   * Mapea un `DomainError` de auth a la `HttpException` correspondiente.
   * Centraliza la traducción dominio → HTTP para los endpoints que la
   * necesitan. Pasó de función top-level a método del controller
   * (sdd/cambio-de-contrasena, design D4) para poder inyectar `ILogger` y
   * dejar de tragarse en silencio los `DomainError` que caen al default.
   *
   * LÍMITE DURO (reconciliación #2409): esta tabla CONGELA el 401 de HOY
   * para los 7 errores que hoy caen al fallback y en rigor no les
   * corresponde (`ClienteInactivoError` → debería ser 403;
   * `RolNoEncontradoError`/`MembresiaNoEncontradaError` → 404;
   * `MembresiaYaActivaError` → 409; `PermisoCodigoInvalidoError`/
   * `CeldaPermisoInvalidaError`/`PresetRolNoDefinidoError` → 422). NO se
   * corrigen acá: alterar el status de endpoints ajenos a este cambio puede
   * modificar flujos del frontend de formas no obvias — queda anotado como
   * hallazgo para un trabajo aparte. Los únicos códigos que estrenan mapeo
   * explícito son los tres nuevos de `cambio-de-contrasena`.
   */
  private toHttpException(
    error: DomainError,
  ): UnauthorizedException | ForbiddenException | UnprocessableEntityException {
    if (
      error instanceof CredencialesInvalidasError ||
      error instanceof TokenInvalidoError ||
      error instanceof TokenExpiradoError ||
      error instanceof TokenRevocadoError
    ) {
      return new UnauthorizedException(error.message);
    }
    if (
      error instanceof SinMembresiaActivaError ||
      error instanceof ClienteNoAutorizadoError ||
      error instanceof UsuarioNoDisponibleError
    ) {
      return new ForbiddenException(error.message);
    }
    if (
      error instanceof PasswordActualIncorrectaError ||
      error instanceof PasswordNuevaIgualAActualError
    ) {
      return new UnprocessableEntityException({
        statusCode: 422,
        message: error.message,
        error: error.code,
      });
    }
    // Fallback ruidoso (D4): cualquier DomainError no mapeado explícitamente
    // sigue cayendo en 401 (mismo criterio conservador de siempre — nunca
    // 500 silencioso por un error de dominio), pero ahora deja rastro en
    // vez de tragárselo en silencio.
    this.logger.error(`DomainError no mapeado en AuthController.toHttpException: ${error.code}`);
    return new UnauthorizedException(error.message);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginRequestDto, @Req() req: RequestConIp): Promise<LoginResponseDto> {
    const result = await this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
      ip: ipDelNavegador(req),
      ...(dto.clienteId !== undefined ? { clienteId: dto.clienteId } : {}),
    });

    if (result.isFail()) {
      throw this.toHttpException(result.getError());
    }

    const value = result.getValue();
    if (value.kind === 'selection') {
      return { needsClienteSelection: true, membresias: value.membresias, ticket: value.ticket };
    }
    if (value.kind === 'needs2fa') {
      return {
        needs2fa: true,
        desafio: value.desafio,
        recordarDisponible: value.recordarDisponible,
      };
    }
    if (value.kind === 'needsEnrolamiento2fa') {
      return { needsEnrolamiento2fa: true, desafio: value.desafio };
    }
    return { accessToken: value.accessToken, refreshToken: value.refreshToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshRequestDto): Promise<TokensResponseDto> {
    const result = await this.refreshTokenUseCase.execute({ rawToken: dto.refreshToken });

    if (result.isFail()) {
      throw this.toHttpException(result.getError());
    }
    return result.getValue();
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutRequestDto): Promise<void> {
    const result = await this.logoutUseCase.execute({ rawToken: dto.refreshToken });

    if (result.isFail()) {
      throw this.toHttpException(result.getError());
    }
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.logoutAllUseCase.execute({ usuarioId: user.sub });
  }

  @Post('switch')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async switchTenant(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchTenantRequestDto,
  ): Promise<SwitchTenantResponseDto> {
    const result = await this.switchTenantUseCase.execute({
      actor: user,
      clienteId: dto.clienteId,
      ...(dto.refreshToken !== undefined ? { refreshToken: dto.refreshToken } : {}),
    });

    if (result.isFail()) {
      throw this.toHttpException(result.getError());
    }
    return result.getValue();
  }

  /**
   * POST /auth/change-password
   * Cambia la contraseña del propio usuario autenticado (sdd/cambio-de-contrasena).
   * `usuarioId` sale SIEMPRE de `user.sub` (JWT) — nunca del body: un
   * `usuarioId` ajeno en el payload no tiene ningún efecto (spec, requisito
   * "El sujeto del cambio sale del token").
   * @throws 422 `passwordActual` incorrecta, o `passwordNueva` igual a la actual
   * @throws 403 el usuario del token no está disponible (inexistente/inactivo)
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CambiarPasswordRequestDto,
  ): Promise<void> {
    const result = await this.cambiarPasswordUseCase.execute({
      usuarioId: user.sub,
      passwordActual: dto.passwordActual,
      passwordNueva: dto.passwordNueva,
    });

    if (result.isFail()) {
      throw this.toHttpException(result.getError());
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
