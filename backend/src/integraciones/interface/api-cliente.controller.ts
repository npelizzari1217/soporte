import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { CurrentUser } from '../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../auth/infrastructure/guards/global-admin.guard';
import { DomainError } from '../../shared/domain/result';
import {
  ConfigurarApiClienteOutput,
  ConfigurarApiClienteUseCase,
} from '../application/configurar-api-cliente.use-case';
import {
  ClienteApiNoEncontradoError,
  OnlyRootCanConfigurarApiError,
} from '../domain/integraciones.errors';

export class ConfigurarApiClienteDto {
  @IsBoolean()
  habilitada!: boolean;
}

function toHttpException(error: DomainError): Error {
  if (error instanceof OnlyRootCanConfigurarApiError) return new ForbiddenException(error.message);
  if (error instanceof ClienteApiNoEncontradoError) return new NotFoundException(error.message);
  return new InternalServerErrorException(error.message);
}

/** PATCH /clientes/:id/api — habilita o deshabilita la API publica de un cliente. Solo ROOT. */
@UseGuards(JwtAuthGuard, GlobalAdminGuard)
@Controller('clientes')
export class ApiClienteController {
  constructor(private readonly configurarApiClienteUseCase: ConfigurarApiClienteUseCase) {}

  @Patch(':id/api')
  @HttpCode(HttpStatus.OK)
  async configurar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConfigurarApiClienteDto,
  ): Promise<ConfigurarApiClienteOutput> {
    const result = await this.configurarApiClienteUseCase.execute(
      { clienteId: id, habilitada: dto.habilitada },
      { isGlobalAdmin: user.is_global_admin },
    );
    if (result.isFail()) throw toHttpException(result.getError());
    return result.getValue();
  }
}
