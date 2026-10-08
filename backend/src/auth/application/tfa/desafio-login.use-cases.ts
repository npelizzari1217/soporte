import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { SegundoPasoRechazadoError, TfaNoDisponibleError } from '../../domain/errors/tfa.errors';
import {
  DESAFIO_LOGIN_REPOSITORY,
  IDesafioLoginRepository,
} from '../../domain/ports/desafio-login-repository.port';
import {
  DISPOSITIVO_CONFIABLE_REPOSITORY,
  IDispositivoConfiableRepository,
} from '../../domain/ports/dispositivo-confiable-repository.port';
import { IUsuarioRepository, USUARIO_REPOSITORY } from '../../domain/ports/i-usuario.repository';
import { DISPOSITIVO_CONFIABLE_DURACION_MS } from '../../domain/tfa/tfa.constants';
import {
  ConfirmarSecretoTfa,
  IniciarSecretoTfa,
  SecretoPendienteDto,
} from './tfa-cuenta.use-cases';
import { hashTokenDispositivo, nuevoTokenDispositivo } from './token-dispositivo';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const rechazo = (): Result<never, SegundoPasoRechazadoError> =>
  Result.fail(new SegundoPasoRechazadoError());

/**
 * `POST /auth/2fa/verificar`: el desafio `VERIFICAR` se valida ANTES de reservar cupo del
 * limitador (un desafio basura no gasta intentos); desafio, ticket, codigo erroneo y bloqueo dan
 * el mismo rechazo (L2, L6, L11). Un `ENROLAR` no sirve aca (L5). Al verificar el token rota a un
 * ticket para `continuar`. Todo segundo paso exitoso (codigo TOTP o de recuperacion) de un usuario
 * que no es ROOT emite ademas un dispositivo confiable, sin casilla (decision del dueno,
 * 2026-10-08; D4): el token crudo sale una sola vez, en esta respuesta.
 */
@Injectable()
export class VerificarDesafioUseCase {
  constructor(
    @Inject(DESAFIO_LOGIN_REPOSITORY) private readonly desafios: IDesafioLoginRepository,
    private readonly verificador: VerificadorCodigoTfa,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: IUsuarioRepository,
    @Inject(DISPOSITIVO_CONFIABLE_REPOSITORY)
    private readonly dispositivos: IDispositivoConfiableRepository,
  ) {}

  async execute(
    desafio: string,
    codigo: string,
  ): Promise<
    Result<
      { usuarioId: string; ticket: string; dispositivoConfiable?: string },
      SegundoPasoRechazadoError
    >
  > {
    const vigente = await this.desafios.buscarSinVerificar(desafio, 'VERIFICAR');
    if (!vigente) return rechazo();
    const verificado = await this.verificador.verificar(vigente.usuarioId, codigo);
    if (verificado.isFail()) return rechazo();
    const ticket = await this.desafios.verificar(desafio, 'VERIFICAR', vigente.usuarioId);
    if (!ticket) return rechazo();
    const dispositivoConfiable = await this.emitirDispositivo(vigente.usuarioId);
    return Result.ok({
      usuarioId: vigente.usuarioId,
      ticket,
      ...(dispositivoConfiable ? { dispositivoConfiable } : {}),
    });
  }

  /** ROOT nunca recibe dispositivo: el codigo se le pide siempre (D4). */
  private async emitirDispositivo(usuarioId: string): Promise<string | null> {
    const usuario = await this.usuarios.findById(usuarioId);
    if (!usuario || usuario.isGlobalAdmin) return null;
    const token = nuevoTokenDispositivo();
    const expiraAt = new Date(Date.now() + DISPOSITIVO_CONFIABLE_DURACION_MS);
    await this.dispositivos.crear(usuarioId, hashTokenDispositivo(token), expiraAt);
    return token;
  }
}

/** `POST /auth/2fa/enrolamiento/iniciar`: un `ENROLAR` sin verificar genera el secreto pendiente. */
@Injectable()
export class IniciarEnrolamientoLoginUseCase {
  constructor(
    @Inject(DESAFIO_LOGIN_REPOSITORY) private readonly desafios: IDesafioLoginRepository,
    private readonly iniciar: IniciarSecretoTfa,
  ) {}

  async execute(
    desafio: string,
  ): Promise<Result<SecretoPendienteDto, TfaNoDisponibleError | SegundoPasoRechazadoError>> {
    const vigente = await this.desafios.buscarSinVerificar(desafio, 'ENROLAR');
    if (!vigente) return rechazo();
    return this.iniciar.execute(vigente.usuarioId);
  }
}

/**
 * `POST /auth/2fa/enrolamiento/confirmar`: solo un TOTP del pendiente; activa el 2FA, emite los
 * 10 codigos y rota el desafio a un ticket (L5, T4, T5). La sesion se completa recien en
 * `continuar`, cuando el usuario confirma que guardo los codigos.
 */
@Injectable()
export class ConfirmarEnrolamientoLoginUseCase {
  constructor(
    @Inject(DESAFIO_LOGIN_REPOSITORY) private readonly desafios: IDesafioLoginRepository,
    private readonly confirmar: ConfirmarSecretoTfa,
  ) {}

  async execute(
    desafio: string,
    codigo: string,
  ): Promise<Result<{ codigosRecuperacion: string[]; ticket: string }, SegundoPasoRechazadoError>> {
    const vigente = await this.desafios.buscarSinVerificar(desafio, 'ENROLAR');
    if (!vigente) return rechazo();
    const confirmado = await this.confirmar.execute(vigente.usuarioId, codigo);
    if (confirmado.isFail()) return rechazo();
    const ticket = await this.desafios.verificar(desafio, 'ENROLAR', vigente.usuarioId);
    if (!ticket) return rechazo();
    return Result.ok({
      codigosRecuperacion: confirmado.getValue().codigosRecuperacion ?? [],
      ticket,
    });
  }
}
