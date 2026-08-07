/**
 * AuthController — endpoints de autenticación REST.
 *
 * Rutas:
 *   POST /auth/login       → LoginUseCase (R3–R6)
 *   POST /auth/refresh     → RefreshTokenUseCase (R8)
 *   POST /auth/logout      → LogoutUseCase (R9)
 *   POST /auth/logout-all  → LogoutAllUseCase (R9, usuario autenticado)
 *   POST /auth/switch      → SwitchTenantUseCase (R10, usuario autenticado)
 *   GET  /auth/me          → payload del JWT actual (usuario autenticado)
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use cases.
 * El mapeo de errores de dominio a HttpException se hace acá (presentación).
 *
 * Guards:
 * - /login y /refresh: sin guard (públicos — son el punto de entrada).
 * - /logout: sin guard (el refresh token crudo en el body ya es la prueba
 *   de posesión; no requiere un access token vigente).
 * - /logout-all, /switch, /me: JwtAuthGuard (necesitan el actor autenticado).
 *
 * Tarea: T6.5 (PR6 — Guards + AuthController + AuthModule)
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { LogoutAllUseCase } from '../../application/use-cases/logout-all.use-case';
import { SwitchTenantUseCase } from '../../application/use-cases/switch-tenant.use-case';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../infrastructure/guards/decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';
import {
  LoginRequestDto,
  LogoutRequestDto,
  RefreshRequestDto,
  SelectionResponseDto,
  SwitchTenantRequestDto,
  SwitchTenantResponseDto,
  TokensResponseDto,
} from '../dtos/auth.dto';
import {
  ClienteNoAutorizadoError,
  CredencialesInvalidasError,
  SinMembresiaActivaError,
  TokenExpiradoError,
  TokenInvalidoError,
  TokenRevocadoError,
} from '../../domain/errors/auth.errors';
import { DomainError } from '../../../shared/domain/result';

/**
 * Mapea un `DomainError` de auth a la `HttpException` correspondiente.
 * Centraliza la traducción dominio → HTTP para los 3 endpoints que la
 * necesitan (login/refresh/logout), evitando duplicar el switch.
 */
function toHttpException(error: DomainError): UnauthorizedException | ForbiddenException {
  if (
    error instanceof CredencialesInvalidasError ||
    error instanceof TokenInvalidoError ||
    error instanceof TokenExpiradoError ||
    error instanceof TokenRevocadoError
  ) {
    return new UnauthorizedException(error.message);
  }
  if (error instanceof SinMembresiaActivaError || error instanceof ClienteNoAutorizadoError) {
    return new ForbiddenException(error.message);
  }
  // Cualquier otro DomainError no mapeado explícitamente: 401 genérico
  // (mismo criterio conservador que soporte1 — nunca 500 por un error de dominio).
  return new UnauthorizedException(error.message);
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly logoutAllUseCase: LogoutAllUseCase,
    private readonly switchTenantUseCase: SwitchTenantUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginRequestDto): Promise<TokensResponseDto | SelectionResponseDto> {
    const result = await this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
      ...(dto.clienteId !== undefined ? { clienteId: dto.clienteId } : {}),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    const value = result.getValue();
    if (value.kind === 'selection') {
      return { needsClienteSelection: true, membresias: value.membresias };
    }
    return { accessToken: value.accessToken, refreshToken: value.refreshToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshRequestDto): Promise<TokensResponseDto> {
    const result = await this.refreshTokenUseCase.execute({ rawToken: dto.refreshToken });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue();
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutRequestDto): Promise<void> {
    const result = await this.logoutUseCase.execute({ rawToken: dto.refreshToken });

    if (result.isFail()) {
      throw toHttpException(result.getError());
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
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
