import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import {
  TokenExpiradoError,
  TokenRevocadoError,
  TokenInvalidoError,
  ClienteInactivoError,
} from '../../domain/errors/auth.errors';

/** Duración del nuevo refresh token: 7 días. */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** DTO de entrada para RefreshTokenUseCase. */
export interface RefreshTokenDto {
  /** Token crudo recibido del cliente (httpOnly cookie o body). */
  rawToken: string;
}

/** DTO de salida cuando la renovación es exitosa. */
export interface RefreshResult {
  /** Nuevo JWT de acceso firmado. */
  accessToken: string;
  /** Nuevo refresh token crudo (para reemplazar el anterior en el cliente). */
  refreshToken: string;
}

/**
 * RefreshTokenUseCase — renueva el JWT de acceso con rotación de refresh token.
 *
 * Flujo (rotación):
 * 1. Computa SHA-256(rawToken) y busca en refresh_tokens.
 * 2. Verifica que no esté expirado → TokenExpiradoError.
 * 3. Verifica que no esté revocado → TokenRevocadoError.
 * 4. Revoca el token anterior (refreshToken.revoke() + save).
 * 5. Carga el usuario por id (para re-construir el payload del JWT).
 * 5b. Re-valida cliente activo → ClienteInactivoError (espeja el check de login).
 * 6. Firma nuevo JWT con payload actualizado (incluye cliente_nombre).
 * 7. Genera nuevo rawToken + SHA-256 + guarda en refresh_tokens.
 * 8. Retorna { accessToken, refreshToken: newRawToken }.
 *
 * Tarea: 2.B.4
 */
export class RefreshTokenUseCase {
  constructor(
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly tokenService: ITokenService,
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async execute(dto: RefreshTokenDto): Promise<Result<RefreshResult, DomainError>> {
    // 0. Guard: refresh sin token (cookie rt ausente → el frontend manda body {}).
    //    Sin este check, crypto.createHash().update(undefined) lanza TypeError → 500.
    //    Un token ausente es semánticamente un token inválido → 401 (contrato del BFF:
    //    el frontend limpia cookies y redirige a /login ante un 401).
    if (!dto.rawToken) {
      return Result.fail(new TokenInvalidoError());
    }

    // 1. Buscar token por hash SHA-256 del token crudo
    const tokenHash = crypto.createHash('sha256').update(dto.rawToken).digest('hex');
    const refreshToken = await this.refreshTokenRepo.findByHash(tokenHash);

    if (!refreshToken) {
      return Result.fail(new TokenInvalidoError());
    }

    // 2. Verificar expiración (ANTES de revocación para dar mensaje preciso)
    if (refreshToken.isExpired()) {
      return Result.fail(new TokenExpiradoError());
    }

    // 3. Verificar que no esté revocado
    if (refreshToken.isRevoked()) {
      return Result.fail(new TokenRevocadoError());
    }

    // 4. Revocar el token anterior (rotación)
    refreshToken.revoke();
    await this.refreshTokenRepo.save(refreshToken);

    // 5. Cargar usuario para re-construir el payload del JWT
    const usuario = await this.usuarioRepo.findById(refreshToken.usuarioId);
    // Si el usuario fue eliminado/suspendido entre el login y el refresh, no emitir
    if (!usuario || !usuario.activo || usuario.isDeleted()) {
      return Result.fail(new TokenInvalidoError());
    }

    // 5b. Verificar que el cliente (tenant) siga activo (espeja el check de login).
    // Sin este check, un tenant suspendido podría renovar tokens por hasta 7 días.
    const cliente = await this.clienteRepo.findById(usuario.clienteId);
    if (!cliente || !cliente.activo) {
      return Result.fail(new ClienteInactivoError());
    }

    // 6. Calcular permisos efectivos y firmar nuevo JWT
    const allPermisos = usuario.roles.flatMap((r) => r.permisos.map((p) => p.codigo));
    const permisos = [...new Set(allPermisos)];
    const roles = usuario.roles.map((r) => r.codigo);

    const payload: JwtPayload = {
      sub: usuario.id,
      cliente_id: usuario.clienteId,
      email: usuario.email,
      roles,
      permisos,
      cliente_nombre: cliente.nombre,
      is_global_admin: usuario.isGlobalAdmin,
    };
    const accessToken = this.tokenService.signJwt(payload);

    // 7. Generar nuevo refresh token (rotación completa)
    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

    const newRefreshToken = RefreshTokenEntity.create({
      usuarioId: usuario.id,
      tokenHash: newTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    });

    await this.refreshTokenRepo.save(newRefreshToken);

    return Result.ok({ accessToken, refreshToken: newRawToken });
  }
}
