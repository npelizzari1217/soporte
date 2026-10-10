import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { ILogger, LOGGER } from '../../../shared/domain/ports/i-logger.port';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';
import {
  IIdentidadSsoRepository,
  IDENTIDAD_SSO_REPOSITORY,
} from '../../domain/ports/identidad-sso-repository.port';
import {
  IMembresiaRepository,
  MEMBRESIA_REPOSITORY,
} from '../../domain/ports/i-membresia.repository';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/ports/i-refresh-token.repository';
import { IUsuarioRepository, USUARIO_REPOSITORY } from '../../domain/ports/i-usuario.repository';
import { puedeResetearAUsuario, PoliticaReseteoInput } from '../politica-reseteo-usuario';

export type ResetearVinculoSsoInput = PoliticaReseteoInput;

/**
 * `DELETE /usuarios/:id/sso` (sdd/login-sso, ADR-8, SV7, SV8). Misma politica que el reseteo de
 * 2FA: toda denegacion devuelve el mismo `MembresiaNoEncontradaError`. Borra los vinculos de TODOS
 * los proveedores y despues revoca los refresh tokens, con log-and-swallow. No toca contrasena,
 * 2FA, dispositivos de confianza ni membresias. Idempotente: sin vinculos tambien es exito.
 */
@Injectable()
export class ResetearVinculoSsoUseCase {
  constructor(
    @Inject(IDENTIDAD_SSO_REPOSITORY)
    private readonly identidades: Pick<IIdentidadSsoRepository, 'eliminarTodasDeUsuario'>,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: Pick<IUsuarioRepository, 'findById'>,
    @Inject(MEMBRESIA_REPOSITORY)
    private readonly membresias: Pick<
      IMembresiaRepository,
      'findActivaByUsuarioYCliente' | 'findClientesDeTodasByUsuario'
    >,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: Pick<IRefreshTokenRepository, 'revokeAllByUsuarioId'>,
    @Inject(LOGGER) private readonly logger: ILogger,
  ) {}

  async execute(input: ResetearVinculoSsoInput): Promise<Result<void, MembresiaNoEncontradaError>> {
    const permitido = await puedeResetearAUsuario(input, {
      usuarios: this.usuarios,
      membresias: this.membresias,
    });
    if (!permitido) return Result.fail(new MembresiaNoEncontradaError());

    await this.identidades.eliminarTodasDeUsuario(input.usuarioId);
    try {
      await this.refreshTokens.revokeAllByUsuarioId(input.usuarioId);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fallo al revocar sesiones tras resetear el vinculo SSO: usuarioId=${input.usuarioId} error=${detalle}`,
      );
    }
    return Result.ok(undefined);
  }
}
