import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  UsuarioNoDisponibleError,
  PasswordActualIncorrectaError,
  PasswordNuevaIgualAActualError,
} from '../../domain/errors/auth.errors';

/** DTO de entrada para CambiarPasswordUseCase. */
export interface CambiarPasswordDto {
  /** ID del usuario autenticado — SIEMPRE de `actor.sub` (JWT), nunca del body (WU2). */
  usuarioId: string;
  /** Contraseña actual en texto plano, para probar posesión. */
  passwordActual: string;
  /** Contraseña nueva en texto plano. */
  passwordNueva: string;
}

/**
 * CambiarPasswordUseCase — cambia la contraseña del propio usuario
 * autenticado, probando posesión de la actual, y revoca todas sus sesiones
 * activas (sdd/cambio-de-contrasena, design #2408, reconciliación #2409).
 *
 * Flujo estricto — el orden importa:
 * 1. Carga el usuario por ID → `UsuarioNoDisponibleError` si no existe o
 *    está inactivo/soft-deleted (D3: `JwtAuthGuard` NUNCA consulta la DB;
 *    una cuenta suspendida sigue llegando al handler hasta que expira su
 *    access token, ~15 min).
 * 2. Verifica `passwordActual` contra el hash almacenado →
 *    `PasswordActualIncorrectaError` si no coincide, SIN tocar
 *    `password_hash`.
 * 3. Rechaza si `passwordNueva === passwordActual` en PLAINTEXT (D2). En
 *    este punto `passwordActual` ya está probada como vigente, así que la
 *    comparación es equivalente a un segundo `verifyPassword` pero sin
 *    pagar otro KDF de ~100ms. Prohibido comparar hashes: Argon2 saltea, dos
 *    hashes de la misma clave difieren siempre.
 * 4. Hashea SOLO vía `usuario.hashPassword()` (D1) — la misma instancia de
 *    `IHashProvider` que usa el login. Prohibido invocar `argon2` directo:
 *    ver el bug real de `scripts/reset-password.ts` que este camino hace
 *    estructuralmente imposible.
 * 5. Persiste con `usuarioRepo.save()` (upsert) — punto de no retorno.
 * 6. Revoca todas las sesiones. Si falla, NO propaga el error: la
 *    contraseña ya cambió, que es lo que el usuario pidió; solo deja
 *    rastro con `logger.error` (D5) — devolver un fallo acá le mentiría al
 *    usuario sobre el estado de su credencial.
 */
export class CambiarPasswordUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly hashProvider: IHashProvider,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(dto: CambiarPasswordDto): Promise<Result<void, DomainError>> {
    const usuario = await this.usuarioRepo.findById(dto.usuarioId);
    if (!usuario || !usuario.activo || usuario.isDeleted()) {
      return Result.fail(new UsuarioNoDisponibleError());
    }

    const actualOk = await usuario.verifyPassword(dto.passwordActual, this.hashProvider);
    if (!actualOk) {
      return Result.fail(new PasswordActualIncorrectaError());
    }

    if (dto.passwordNueva === dto.passwordActual) {
      return Result.fail(new PasswordNuevaIgualAActualError());
    }

    await usuario.hashPassword(dto.passwordNueva, this.hashProvider);
    await this.usuarioRepo.save(usuario);

    try {
      await this.refreshTokenRepo.revokeAllByUsuarioId(dto.usuarioId);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fallo al revocar sesiones tras cambio de contraseña: usuarioId=${dto.usuarioId} error=${detalle}`,
      );
    }

    return Result.ok(undefined as unknown as void);
  }
}
