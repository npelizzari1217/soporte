import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { ILogger, LOGGER } from '../../../shared/domain/ports/i-logger.port';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';
import {
  IMembresiaRepository,
  MEMBRESIA_REPOSITORY,
} from '../../domain/ports/i-membresia.repository';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/ports/i-refresh-token.repository';
import { IUsuarioRepository, USUARIO_REPOSITORY } from '../../domain/ports/i-usuario.repository';
import { ITfaRepository, TFA_REPOSITORY } from '../../domain/ports/tfa-repository.port';

export interface ResetearTfaUsuarioInput {
  /** Del JWT del actor, nunca de la request. */
  actorEsRoot: boolean;
  clienteId: string;
  usuarioId: string;
}

/**
 * `DELETE /usuarios/:id/2fa` (ADR-8, S1-S4, S8). ROOT resetea a cualquiera (incluido otro ROOT).
 * ADMINISTRADOR solo a un NO ROOT con membresia activa en su cliente cuyas membresias, TODAS
 * (inactivas, de clientes suspendidos y soft-deleted incluidas), son de ese cliente. Cualquier
 * incumplimiento devuelve el mismo `MembresiaNoEncontradaError` que un id inexistente.
 * Efectos: `eliminarTodo` (2FA, codigos, dispositivos y desafios en una transaccion) y despues
 * los refresh tokens, con log-and-swallow.
 */
@Injectable()
export class ResetearTfaUsuarioUseCase {
  constructor(
    @Inject(TFA_REPOSITORY) private readonly tfa: Pick<ITfaRepository, 'eliminarTodo'>,
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

  async execute(input: ResetearTfaUsuarioInput): Promise<Result<void, MembresiaNoEncontradaError>> {
    const permitido = await this.puedeResetear(input);
    if (!permitido) return Result.fail(new MembresiaNoEncontradaError());

    await this.tfa.eliminarTodo(input.usuarioId);
    try {
      await this.refreshTokens.revokeAllByUsuarioId(input.usuarioId);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fallo al revocar sesiones tras resetear el 2FA: usuarioId=${input.usuarioId} error=${detalle}`,
      );
    }
    return Result.ok(undefined);
  }

  private async puedeResetear(input: ResetearTfaUsuarioInput): Promise<boolean> {
    const destino = await this.usuarios.findById(input.usuarioId);
    if (!destino) return false;
    if (input.actorEsRoot) return true;
    if (destino.isGlobalAdmin) return false;
    const activa = await this.membresias.findActivaByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!activa) return false;
    const clientes = await this.membresias.findClientesDeTodasByUsuario(input.usuarioId);
    return clientes.every((id) => id === input.clienteId);
  }
}
