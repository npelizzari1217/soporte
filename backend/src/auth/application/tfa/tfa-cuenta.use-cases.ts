import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { ISecretCipher, SECRET_CIPHER } from '../../../shared/domain/ports/i-secret-cipher.port';
import { SegundoPasoRechazadoError, TfaNoDisponibleError } from '../../domain/errors/tfa.errors';
import { HASH_PROVIDER, IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITfaRepository, TFA_REPOSITORY } from '../../domain/ports/tfa-repository.port';
import { ITotpService, TOTP_SERVICE } from '../../domain/ports/totp-service.port';
import { IUsuarioRepository, USUARIO_REPOSITORY } from '../../domain/ports/i-usuario.repository';
import { esObligado2fa } from '../../domain/tfa/es-obligado-2fa';
import { emitirJuegoCodigos, prepararJuegoCodigos } from './codigos-recuperacion';
import { ConfirmadorSecretoPendiente } from './confirmador-secreto-pendiente';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

export interface EstadoTfaCuenta {
  activo: boolean;
  obligado: boolean;
  codigosRestantes: number;
  pendiente: boolean;
}

/** `GET /auth/2fa`: nunca expone el secreto ni su URI (T3). */
@Injectable()
export class ObtenerEstadoTfa {
  constructor(
    @Inject(TFA_REPOSITORY) private readonly repo: ITfaRepository,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: IUsuarioRepository,
  ) {}

  async execute(usuarioId: string): Promise<EstadoTfaCuenta> {
    const [estado, usuario, codigosRestantes] = await Promise.all([
      this.repo.obtener(usuarioId),
      this.usuarios.findById(usuarioId),
      this.repo.contarCodigosRestantes(usuarioId),
    ]);
    return {
      activo: estado?.secretoCifrado != null,
      // TODO(WU-7): sumar las membresias activas con `requiere2fa` cuando exista la politica.
      obligado: esObligado2fa(usuario?.isGlobalAdmin ?? false, []),
      codigosRestantes,
      pendiente: estado?.secretoPendienteCifrado != null,
    };
  }
}

export interface SecretoPendienteDto {
  otpauthUri: string;
  claveManual: string;
}

/** Inicia la activacion o el cambio de celular; con 2FA activo exige un codigo valido (T10). */
@Injectable()
export class IniciarSecretoTfa {
  constructor(
    @Inject(TFA_REPOSITORY) private readonly repo: ITfaRepository,
    @Inject(TOTP_SERVICE) private readonly totp: ITotpService,
    @Inject(SECRET_CIPHER) private readonly cipher: ISecretCipher,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: IUsuarioRepository,
    private readonly secretos: SecretoTotpCifrado,
    private readonly verificador: VerificadorCodigoTfa,
  ) {}

  async execute(
    usuarioId: string,
    codigo?: string,
  ): Promise<Result<SecretoPendienteDto, TfaNoDisponibleError | SegundoPasoRechazadoError>> {
    if (!this.cipher.isAvailable()) return Result.fail(new TfaNoDisponibleError());
    const usuario = await this.usuarios.findById(usuarioId);
    if (!usuario) return Result.fail(new SegundoPasoRechazadoError());
    const estado = await this.repo.obtener(usuarioId);
    if (estado?.secretoCifrado) {
      const verificado = await this.verificador.verificar(usuarioId, codigo ?? '');
      if (verificado.isFail()) return Result.fail(verificado.getError());
    }
    const secreto = this.totp.generarSecreto();
    await this.repo.guardarPendiente(usuarioId, this.secretos.cifrar(usuarioId, secreto));
    return Result.ok({ otpauthUri: this.totp.uri(secreto, usuario.email), claveManual: secreto });
  }
}

/** Confirma el pendiente; los 10 codigos salen solo en la primera activacion (T4, T10). */
@Injectable()
export class ConfirmarSecretoTfa {
  constructor(
    @Inject(TFA_REPOSITORY) private readonly repo: ITfaRepository,
    @Inject(HASH_PROVIDER) private readonly hash: IHashProvider,
    private readonly confirmador: ConfirmadorSecretoPendiente,
  ) {}

  async execute(
    usuarioId: string,
    codigo: string,
  ): Promise<Result<{ codigosRecuperacion?: string[] }, SegundoPasoRechazadoError>> {
    const primeraActivacion = (await this.repo.obtener(usuarioId))?.secretoCifrado == null;
    // Los codigos se generan y hashean ANTES de promover: si eso falla, el 2FA no queda activo
    // sin codigos. Queda solo el error de base entre las dos escrituras; ahi el usuario regenera
    // los codigos con un TOTP (`POST /auth/2fa/codigos`).
    const juego = primeraActivacion ? await prepararJuegoCodigos(this.hash) : null;
    const confirmado = await this.confirmador.confirmar(usuarioId, codigo);
    if (confirmado.isFail()) return Result.fail(confirmado.getError());
    if (!juego) return Result.ok({});
    await this.repo.reemplazarCodigos(usuarioId, juego.hashes);
    return Result.ok({ codigosRecuperacion: juego.codigos });
  }
}

/** Regenera los codigos de recuperacion con un codigo valido; el juego anterior queda invalido (T9). */
@Injectable()
export class RegenerarCodigosTfa {
  constructor(
    @Inject(TFA_REPOSITORY) private readonly repo: ITfaRepository,
    @Inject(HASH_PROVIDER) private readonly hash: IHashProvider,
    private readonly verificador: VerificadorCodigoTfa,
  ) {}

  async execute(
    usuarioId: string,
    codigo: string,
  ): Promise<Result<{ codigosRecuperacion: string[] }, SegundoPasoRechazadoError>> {
    const verificado = await this.verificador.verificar(usuarioId, codigo);
    if (verificado.isFail()) return Result.fail(verificado.getError());
    return Result.ok({
      codigosRecuperacion: await emitirJuegoCodigos(this.repo, this.hash, usuarioId),
    });
  }
}
