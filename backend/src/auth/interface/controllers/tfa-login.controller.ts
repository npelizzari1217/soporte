/**
 * TfaLoginController — rutas PUBLICAS del segundo paso del login (WU-5b). El desafio o el ticket
 * es la autorizacion: sin guards, como `/auth/login`. Todo rechazo del segundo paso es 401.
 * Todavia no esta enganchado a `LoginUseCase` (WU-5c).
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  ContinuarLoginResult,
  ContinuarLoginUseCase,
  SeleccionarClienteLoginUseCase,
} from '../../application/tfa/continuar-login.use-cases';
import {
  ConfirmarEnrolamientoLoginUseCase,
  IniciarEnrolamientoLoginUseCase,
  VerificarDesafioUseCase,
} from '../../application/tfa/desafio-login.use-cases';
import { SecretoPendienteDto } from '../../application/tfa/tfa-cuenta.use-cases';
import { SinMembresiaActivaError } from '../../domain/errors/auth.errors';
import { TfaNoDisponibleError } from '../../domain/errors/tfa.errors';
import {
  DesafioDto,
  SeleccionarClienteDto,
  TicketDto,
  VerificarConRecordarDto,
  VerificarDesafioDto,
} from '../dtos/tfa-login.dto';

@Controller('auth')
export class TfaLoginController {
  constructor(
    private readonly verificarDesafio: VerificarDesafioUseCase,
    private readonly iniciarEnrolamiento: IniciarEnrolamientoLoginUseCase,
    private readonly confirmarEnrolamiento: ConfirmarEnrolamientoLoginUseCase,
    private readonly continuarLogin: ContinuarLoginUseCase,
    private readonly seleccionarCliente: SeleccionarClienteLoginUseCase,
  ) {}

  @Post('2fa/verificar')
  @HttpCode(HttpStatus.OK)
  async verificar(
    @Body() dto: VerificarConRecordarDto,
  ): Promise<{ ticket: string; dispositivoConfiable?: string }> {
    const { ticket, dispositivoConfiable } = desenvolver(
      await this.verificarDesafio.execute(dto.desafio, dto.codigo, dto.recordar === true),
    );
    return { ticket, ...(dispositivoConfiable ? { dispositivoConfiable } : {}) };
  }

  @Post('2fa/enrolamiento/iniciar')
  @HttpCode(HttpStatus.OK)
  async iniciar(@Body() dto: DesafioDto): Promise<SecretoPendienteDto> {
    return desenvolver(await this.iniciarEnrolamiento.execute(dto.desafio));
  }

  @Post('2fa/enrolamiento/confirmar')
  @HttpCode(HttpStatus.OK)
  async confirmar(
    @Body() dto: VerificarDesafioDto,
  ): Promise<{ codigosRecuperacion: string[]; ticket: string }> {
    return desenvolver(await this.confirmarEnrolamiento.execute(dto.desafio, dto.codigo));
  }

  @Post('login/continuar')
  @HttpCode(HttpStatus.OK)
  async continuar(@Body() dto: TicketDto): Promise<unknown> {
    return respuestaSesion(desenvolver(await this.continuarLogin.execute(dto.ticket)));
  }

  @Post('login/seleccionar')
  @HttpCode(HttpStatus.OK)
  async seleccionar(
    @Body() dto: SeleccionarClienteDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return desenvolver(await this.seleccionarCliente.execute(dto.ticket, dto.clienteId));
  }
}

function respuestaSesion(r: ContinuarLoginResult): unknown {
  if (r.kind === 'selection') {
    return { needsClienteSelection: true, membresias: r.membresias, ticket: r.ticket };
  }
  return { accessToken: r.accessToken, refreshToken: r.refreshToken };
}

function desenvolver<T>(result: Result<T, DomainError>): T {
  if (result.isOk()) return result.getValue();
  const error = result.getError();
  if (error instanceof TfaNoDisponibleError) throw new ServiceUnavailableException(error.message);
  if (error instanceof SinMembresiaActivaError) throw new ForbiddenException(error.message);
  throw new UnauthorizedException(error.message);
}
