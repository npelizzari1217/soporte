/**
 * TfaCuentaController — autogestion del 2FA del usuario autenticado (WU-4c).
 * `usuarioId` sale SIEMPRE de `user.sub`. Los errores de codigo responden 422 y no 401 para no
 * disparar el refresh del cliente (design, "Autogestion").
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  ConfirmarSecretoTfa,
  EstadoTfaCuenta,
  IniciarSecretoTfa,
  ObtenerEstadoTfa,
  RegenerarCodigosTfa,
  SecretoPendienteDto,
} from '../../application/tfa/tfa-cuenta.use-cases';
import { TfaNoDisponibleError } from '../../domain/errors/tfa.errors';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { CurrentUser } from '../../infrastructure/guards/decorators';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CodigoTfaDto, IniciarSecretoTfaDto } from '../dtos/tfa-cuenta.dto';

@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
export class TfaCuentaController {
  constructor(
    private readonly obtenerEstado: ObtenerEstadoTfa,
    private readonly iniciarSecreto: IniciarSecretoTfa,
    private readonly confirmarSecreto: ConfirmarSecretoTfa,
    private readonly regenerarCodigos: RegenerarCodigosTfa,
  ) {}

  @Get()
  estado(@CurrentUser() user: JwtPayload): Promise<EstadoTfaCuenta> {
    return this.obtenerEstado.execute(user.sub);
  }

  @Post('secreto/iniciar')
  @HttpCode(HttpStatus.OK)
  async iniciar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: IniciarSecretoTfaDto,
  ): Promise<SecretoPendienteDto> {
    return desenvolver(await this.iniciarSecreto.execute(user.sub, dto.codigo));
  }

  @Post('secreto/confirmar')
  @HttpCode(HttpStatus.OK)
  async confirmar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CodigoTfaDto,
  ): Promise<{ codigosRecuperacion?: string[] }> {
    return desenvolver(await this.confirmarSecreto.execute(user.sub, dto.codigo));
  }

  @Post('codigos')
  @HttpCode(HttpStatus.OK)
  async regenerar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CodigoTfaDto,
  ): Promise<{ codigosRecuperacion: string[] }> {
    return desenvolver(await this.regenerarCodigos.execute(user.sub, dto.codigo));
  }
}

function desenvolver<T>(result: Result<T, DomainError>): T {
  if (result.isOk()) return result.getValue();
  const error = result.getError();
  if (error instanceof TfaNoDisponibleError) throw new ServiceUnavailableException(error.message);
  throw new UnprocessableEntityException(error.message);
}
