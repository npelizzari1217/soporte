import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { ILogger, LOGGER } from '../../../shared/domain/ports/i-logger.port';
import { SegundoPasoRechazadoError, Tfa2faObligatorioError } from '../../domain/errors/tfa.errors';
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
import { esObligado2fa } from '../../domain/tfa/es-obligado-2fa';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

/**
 * `POST /auth/2fa/desactivar` (T8, D6): solo si el usuario NO esta obligado (misma regla que el
 * login) y con un codigo valido. El obligado se rechaza ANTES de reservar cupo del limitador.
 * `eliminarTodo` borra el 2FA y revoca dispositivos en una transaccion; despues se revocan los
 * refresh tokens con log-and-swallow (el 2FA ya se desactivo, un fallo aca no lo deshace).
 */
@Injectable()
export class DesactivarTfaUseCase {
  constructor(
    @Inject(TFA_REPOSITORY) private readonly repo: ITfaRepository,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: IUsuarioRepository,
    @Inject(MEMBRESIA_REPOSITORY) private readonly membresias: IMembresiaRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(LOGGER) private readonly logger: ILogger,
    private readonly verificador: VerificadorCodigoTfa,
  ) {}

  async execute(
    usuarioId: string,
    codigo: string,
  ): Promise<Result<void, SegundoPasoRechazadoError | Tfa2faObligatorioError>> {
    const usuario = await this.usuarios.findById(usuarioId);
    if (!usuario) return Result.fail(new SegundoPasoRechazadoError());
    const activas = await this.membresias.findActivasByUsuario(usuarioId);
    if (esObligado2fa(usuario.isGlobalAdmin, activas)) {
      return Result.fail(new Tfa2faObligatorioError());
    }
    const verificado = await this.verificador.verificar(usuarioId, codigo);
    if (verificado.isFail()) return Result.fail(verificado.getError());
    await this.repo.eliminarTodo(usuarioId);
    try {
      await this.refreshTokens.revokeAllByUsuarioId(usuarioId);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fallo al revocar sesiones tras desactivar el 2FA: usuarioId=${usuarioId} error=${detalle}`,
      );
    }
    return Result.ok(undefined);
  }
}
