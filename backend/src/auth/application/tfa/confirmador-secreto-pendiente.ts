import { Inject, Injectable, Logger } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { SegundoPasoRechazadoError } from '../../domain/errors/tfa.errors';
import { ILimitadorIntentos, LIMITADOR_INTENTOS } from '../../domain/ports/limitador-intentos.port';
import { ITfaRepository, TFA_REPOSITORY } from '../../domain/ports/tfa-repository.port';
import { ITotpService, TOTP_SERVICE } from '../../domain/ports/totp-service.port';
import { clasificarCodigo } from '../../domain/tfa/formato-codigo';
import { claveLimiteCodigo } from '../../domain/tfa/tfa.constants';
import { ResultadoSegundoPaso } from './resultado-segundo-paso';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';

/**
 * Confirma un secreto PENDIENTE: acepta solo un TOTP de ese secreto (ni recuperacion ni el
 * secreto activo, T4/T10) y lo promueve con el CAS fijando `ultimo_paso` = paso confirmado
 * (T2). Comparte el limitador `cod:{usuarioId}` con `VerificadorCodigoTfa` (I6).
 */
@Injectable()
export class ConfirmadorSecretoPendiente {
  private readonly logger = new Logger(ConfirmadorSecretoPendiente.name);

  constructor(
    @Inject(TFA_REPOSITORY) private readonly repo: ITfaRepository,
    @Inject(TOTP_SERVICE) private readonly totp: ITotpService,
    @Inject(LIMITADOR_INTENTOS) private readonly limitador: ILimitadorIntentos,
    private readonly secretos: SecretoTotpCifrado,
  ) {}

  async confirmar(
    usuarioId: string,
    codigo: string,
    ahora = new Date(),
  ): Promise<ResultadoSegundoPaso> {
    const reserva = await this.limitador.reservar(claveLimiteCodigo(usuarioId));
    if (reserva === null || clasificarCodigo(codigo) !== 'totp') return rechazo();

    const estado = await this.repo.obtener(usuarioId);
    if (!estado?.secretoPendienteCifrado) return rechazo();
    const secreto = this.secretos.descifrar(usuarioId, estado.secretoPendienteCifrado);
    if (secreto.isFail()) {
      this.logger.error(`TFA_SECRETO_INDESCIFRABLE | usuarioId=${usuarioId}`);
      try {
        await this.limitador.devolver(reserva);
      } catch (error) {
        this.logger.error(
          `TFA_LIMITADOR_DEVOLVER_FALLO | clave=${reserva.clave} | ${error instanceof Error ? error.message : 'error'}`,
        );
      }
      return rechazo();
    }
    const paso = this.totp.verificar(secreto.getValue(), codigo.trim(), ahora);
    if (paso === null) return rechazo();
    if (!(await this.repo.promoverPendiente(usuarioId, estado.secretoPendienteCifrado, paso))) {
      return rechazo();
    }
    await this.limitador.liberar(reserva.clave);
    return Result.ok(undefined);
  }
}

const rechazo = (): ResultadoSegundoPaso => Result.fail(new SegundoPasoRechazadoError());
