/**
 * AuthController — endpoints de autenticación REST.
 *
 * Rutas:
 *   POST /auth/login         → LoginUseCase
 *   POST /auth/refresh       → RefreshTokenUseCase
 *   POST /auth/logout        → RevocarTokenUseCase
 *   POST /auth/logout-all    → RevocarTodosTokensUsuarioUseCase (usuario autenticado)
 *
 * El controlador no tiene lógica de negocio: solo traduce HTTP ↔ use cases.
 * El mapeo de errores de dominio a HttpException se hace aquí (presentación).
 *
 * Guards:
 * - /login y /refresh: sin guard (públicos).
 * - /logout: JwtAuthGuard (necesita userId del token).
 * - /logout-all: JwtAuthGuard (necesita userId del token).
 *
 * Tarea: 2.D.4
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { RevocarTokenUseCase } from '../../application/use-cases/revocar-token.use-case';
import { RevocarTodosTokensUsuarioUseCase } from '../../application/use-cases/revocar-todos-tokens.use-case';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../infrastructure/guards/decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { LoginDto, LogoutDto, RefreshDto } from '../dtos/auth.dto';
import {
  ClienteInactivoError,
  CredencialesInvalidasError,
  TokenExpiradoError,
  TokenInvalidoError,
  TokenRevocadoError,
} from '../../domain/errors/auth.errors';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshTokenUseCase,
    private readonly revocarTokenUseCase: RevocarTokenUseCase,
    private readonly revocarTodosUseCase: RevocarTodosTokensUsuarioUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const result = await this.loginUseCase.execute(dto);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CredencialesInvalidasError) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof ClienteInactivoError) {
        throw new ForbiddenException(error.message);
      }
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return result.getValue();
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
    const result = await this.refreshUseCase.execute({ rawToken: dto.refreshToken });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof ClienteInactivoError) {
        throw new ForbiddenException(error.message);
      }
      if (
        error instanceof TokenExpiradoError ||
        error instanceof TokenRevocadoError ||
        error instanceof TokenInvalidoError
      ) {
        throw new UnauthorizedException(error.message);
      }
      throw new UnauthorizedException('Token inválido');
    }

    return result.getValue();
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    const result = await this.revocarTokenUseCase.execute({ rawToken: dto.refreshToken });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TokenInvalidoError) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException('No se pudo revocar el token');
    }
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.revocarTodosUseCase.execute({ usuarioId: user.sub });
  }
}
