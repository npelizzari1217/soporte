import { Inject, Injectable, Logger } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { HASH_PROVIDER, IHashProvider } from '../../domain/ports/i-hash.provider';
import {
  ILimitadorIntentos,
  LIMITADOR_INTENTOS,
  ReservaIntento,
} from '../../domain/ports/limitador-intentos.port';
import { ITfaRepository, TFA_REPOSITORY } from '../../domain/ports/tfa-repository.port';
import { ITotpService, TOTP_SERVICE } from '../../domain/ports/totp-service.port';
import { SegundoPasoRechazadoError } from '../../domain/errors/tfa.errors';
import { clasificarCodigo, normalizarCodigoRecuperacion } from '../../domain/tfa/formato-codigo';
import { claveLimiteCodigo } from '../../domain/tfa/tfa.constants';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';

export type { ResultadoSegundoPaso } from './resultado-segundo-paso';
import { ResultadoSegundoPaso } from './resultado-segundo-paso';

/**
 * Punto unico de verificacion de un codigo de segundo paso: TOTP del secreto activo o codigo de
 * recuperacion, con limitador `cod:{usuarioId}` y antireplay (T2, T5, I6). La reserva ES el
 * fallo provisional: el exito la libera, el fallo la deja, y un secreto indescifrable la
 * devuelve (T12): no es culpa del usuario.
 */
@Injectable()
export class VerificadorCodigoTfa {
  private readonly logger = new Logger(VerificadorCodigoTfa.name);

  constructor(
    @Inject(TFA_REPOSITORY) private readonly repo: ITfaRepository,
    @Inject(TOTP_SERVICE) private readonly totp: ITotpService,
    @Inject(LIMITADOR_INTENTOS) private readonly limitador: ILimitadorIntentos,
    @Inject(HASH_PROVIDER) private readonly hash: IHashProvider,
    private readonly secretos: SecretoTotpCifrado,
  ) {}

  async verificar(
    usuarioId: string,
    codigo: string,
    ahora = new Date(),
  ): Promise<ResultadoSegundoPaso> {
    const reserva = await this.limitador.reservar(claveLimiteCodigo(usuarioId));
    if (reserva === null) return rechazo();

    const clase = clasificarCodigo(codigo);
    const aceptado =
      clase === 'totp'
        ? await this.verificarTotp(usuarioId, codigo.trim(), ahora, reserva)
        : clase === 'recuperacion'
          ? await this.verificarRecuperacion(usuarioId, codigo)
          : false;
    if (aceptado !== true) return rechazo();
    await this.limitador.liberar(reserva.clave);
    return Result.ok(undefined);
  }

  private async verificarTotp(
    usuarioId: string,
    codigo: string,
    ahora: Date,
    reserva: ReservaIntento,
  ): Promise<boolean | 'devuelto'> {
    const estado = await this.repo.obtener(usuarioId);
    if (!estado?.secretoCifrado) return false;
    const secreto = this.secretos.descifrar(usuarioId, estado.secretoCifrado);
    if (secreto.isFail()) {
      this.logger.error(`TFA_SECRETO_INDESCIFRABLE | usuarioId=${usuarioId}`);
      await this.devolver(reserva);
      return 'devuelto';
    }
    const paso = this.totp.verificar(secreto.getValue(), codigo, ahora);
    if (paso === null) return false;
    return this.repo.registrarPaso(usuarioId, paso, estado.secretoCifrado);
  }

  private async verificarRecuperacion(usuarioId: string, codigo: string): Promise<boolean> {
    const normalizado = normalizarCodigoRecuperacion(codigo);
    if (normalizado === null) return false;
    for (const disponible of await this.repo.obtenerCodigosDisponibles(usuarioId)) {
      if (await this.hash.verify(normalizado, disponible.codigoHash)) {
        return this.repo.consumirCodigo(disponible.id);
      }
    }
    return false;
  }

  private async devolver(reserva: ReservaIntento): Promise<void> {
    try {
      await this.limitador.devolver(reserva);
    } catch (error) {
      this.logger.error(
        `TFA_LIMITADOR_DEVOLVER_FALLO | clave=${reserva.clave} | ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }
}

const rechazo = (): ResultadoSegundoPaso => Result.fail(new SegundoPasoRechazadoError());
