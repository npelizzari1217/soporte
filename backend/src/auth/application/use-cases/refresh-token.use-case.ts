import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ITokenService, JwtPayload, VERSION_PAYLOAD_JWT } from '../../domain/ports/i-token.service';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import {
  TokenExpiradoError,
  TokenRevocadoError,
  TokenInvalidoError,
} from '../../domain/errors/auth.errors';
import { resolverScope } from './resolver-scope';

/** Duración del nuevo refresh token: 7 días (R7/R8). */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** DTO de entrada para RefreshTokenUseCase. */
export interface RefreshTokenDto {
  /** Token crudo recibido del cliente (httpOnly cookie `rt`). */
  rawToken: string;
}

/** DTO de salida cuando la renovación es exitosa. */
export interface RefreshResult {
  /** Nuevo JWT de acceso firmado. */
  accessToken: string;
  /** Nuevo refresh token crudo (reemplaza al anterior en el cliente). */
  refreshToken: string;
}

/**
 * RefreshTokenUseCase — renueva el access token con rotación de refresh
 * token y re-scope revalidado (R8).
 *
 * Opción B (decisión #2025, reemplaza ADR-2 de `sdd/auth-multitenancy/design`):
 * el `clienteId` del scope NO viaja como una "pista" que el BFF deriva
 * decodificando el access token expirado — se lee directamente de
 * `refreshTokenEntity.clienteId`, el scope con el que ese refresh fue
 * emitido (login/rotación previa). Re-scope inequívoco, sin insumos
 * externos al backend.
 *
 * Flujo:
 * 1. Guard: `rawToken` ausente/vacío → `TokenInvalido` (evita crashear en
 *    `crypto.createHash().update(undefined)`).
 * 2. Busca por SHA-256(rawToken). No existe → `TokenInvalido`.
 * 3. Expirado → `TokenExpirado`. Revocado → `TokenRevocado`.
 * 4. Revoca el token anterior (rotación INCONDICIONAL, antes de re-validar
 *    usuario/scope) — el token es de un solo uso; previene replay aunque
 *    la re-validación posterior falle.
 * 5. Recarga el usuario; inactivo/soft-deleted → `TokenInvalido`.
 * 6. Re-valida el `clienteId` embebido vía `resolverScope` — la MISMA
 *    fuente de verdad de autz de tenant que login/switch (root→cualquier
 *    cliente vivo; normal→exige membresía activa en ese cliente; `null`→
 *    solo válido si root). Cliente inactivo/borrado o membresía revocada
 *    desde la emisión → `ClienteNoAutorizado` (propagado de resolverScope).
 * 7. Firma nuevo access token (payload completo, incl. `membresias[]` y
 *    `nombre`/`apellido` de la UsuarioEntity ya recargada en el paso 5, sin
 *    query extra) y emite un nuevo refresh token que persiste el MISMO
 *    `clienteId` resuelto (rotación mantiene el scope).
 */
export class RefreshTokenUseCase {
  constructor(
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly tokenService: ITokenService,
    private readonly permisosRepo: IMatrizPermisosRepository,
  ) {}

  async execute(dto: RefreshTokenDto): Promise<Result<RefreshResult, DomainError>> {
    // 1. Guard: rawToken ausente/vacío (cookie rt faltante) → 401, no 500.
    if (!dto.rawToken) {
      return Result.fail(new TokenInvalidoError());
    }

    // 2. Buscar por hash SHA-256
    const tokenHash = crypto.createHash('sha256').update(dto.rawToken).digest('hex');
    const refreshToken = await this.refreshTokenRepo.findByHash(tokenHash);

    if (!refreshToken) {
      return Result.fail(new TokenInvalidoError());
    }

    // 3. Expiración / revocación (ANTES de rotar — precisión del error)
    if (refreshToken.isExpired()) {
      return Result.fail(new TokenExpiradoError());
    }
    if (refreshToken.isRevoked()) {
      return Result.fail(new TokenRevocadoError());
    }

    // 4. Rotación incondicional: revoca el token presentado. De acá en más
    // es de un solo uso, sin importar si la re-validación posterior falla.
    refreshToken.revoke();
    await this.refreshTokenRepo.save(refreshToken);

    // 5. Recargar usuario
    const usuario = await this.usuarioRepo.findById(refreshToken.usuarioId);
    if (!usuario || !usuario.activo || usuario.isDeleted()) {
      return Result.fail(new TokenInvalidoError());
    }

    // 6. Re-scope: resolverScope reusa el clienteId embebido en el token
    // (Opción B) — única fuente de verdad de autz de tenant.
    const scopeResult = await resolverScope(
      { usuarioId: usuario.id, isGlobalAdmin: usuario.isGlobalAdmin },
      refreshToken.clienteId,
      this.membresiaRepo,
      this.clienteRepo,
      this.permisosRepo,
    );
    if (scopeResult.isFail()) {
      return Result.fail(scopeResult.getError());
    }
    const scope = scopeResult.getValue();

    // 7. membresias[] completo para el payload (alimenta el switcher del front)
    const membresiasActivas = await this.membresiaRepo.findActivasByUsuario(usuario.id);

    const payload: JwtPayload = {
      v: VERSION_PAYLOAD_JWT,
      sub: usuario.id,
      cliente_id: scope.clienteId,
      rol: scope.rol,
      permisos: scope.permisos,
      is_global_admin: usuario.isGlobalAdmin,
      cliente_nombre: scope.clienteNombre,
      membresias: membresiasActivas.map((m) => ({
        cliente_id: m.clienteId,
        nombre: m.clienteNombre,
        rol: m.rolCodigo,
      })),
      modulos: scope.modulos,
      // Identidad global: la UsuarioEntity ya está recargada (paso 5), sin
      // query extra dedicada a esto.
      nombre: usuario.nombre,
      apellido: usuario.apellido,
    };
    const accessToken = this.tokenService.signJwt(payload);

    // Nuevo refresh token: rotación completa, MISMO clienteId (Opción B).
    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

    const newRefreshToken = RefreshTokenEntity.create({
      usuarioId: usuario.id,
      tokenHash: newTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
      clienteId: scope.clienteId,
    });

    await this.refreshTokenRepo.save(newRefreshToken);

    return Result.ok({ accessToken, refreshToken: newRawToken });
  }
}
