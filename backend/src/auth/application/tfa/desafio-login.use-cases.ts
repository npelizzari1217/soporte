import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { SegundoPasoRechazadoError, TfaNoDisponibleError } from '../../domain/errors/tfa.errors';
import {
  DESAFIO_LOGIN_REPOSITORY,
  IDesafioLoginRepository,
} from '../../domain/ports/desafio-login-repository.port';
import {
  ConfirmarSecretoTfa,
  IniciarSecretoTfa,
  SecretoPendienteDto,
} from './tfa-cuenta.use-cases';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const rechazo = (): Result<never, SegundoPasoRechazadoError> =>
  Result.fail(new SegundoPasoRechazadoError());

/**
 * `POST /auth/2fa/verificar`: el desafio `VERIFICAR` se valida ANTES de reservar cupo del
 * limitador (un desafio basura no gasta intentos); desafio, ticket, codigo erroneo y bloqueo dan
 * el mismo rechazo (L2, L6, L11). Un `ENROLAR` no sirve aca (L5). Al verificar el token rota a un
 * ticket para `continuar`.
 */
@Injectable()
export class VerificarDesafioUseCase {
  constructor(
    @Inject(DESAFIO_LOGIN_REPOSITORY) private readonly desafios: IDesafioLoginRepository,
    private readonly verificador: VerificadorCodigoTfa,
  ) {}

  async execute(
    desafio: string,
    codigo: string,
  ): Promise<Result<{ usuarioId: string; ticket: string }, SegundoPasoRechazadoError>> {
    const vigente = await this.desafios.buscarSinVerificar(desafio, 'VERIFICAR');
    if (!vigente) return rechazo();
    const verificado = await this.verificador.verificar(vigente.usuarioId, codigo);
    if (verificado.isFail()) return rechazo();
    const ticket = await this.desafios.verificar(desafio, 'VERIFICAR', vigente.usuarioId);
    return ticket ? Result.ok({ usuarioId: vigente.usuarioId, ticket }) : rechazo();
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
