/**
 * PoliticaTfaController — politica de 2FA del cliente del actor.
 *
 *   GET /politica-2fa → ADMINISTRADOR/ROOT
 *   PUT /politica-2fa → ADMINISTRADOR/ROOT
 *
 * `JwtAuthGuard, TenantGuard` por clase y `AdminClienteGuard` por metodo (molde
 * `HorarioLaboralController`). El `clienteId` sale de `actor.cliente_id`: no existe
 * en la ruta ni en el body, asi que un cliente no puede ver ni cambiar la de otro.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ConfigurarPoliticaTfaUseCase } from '../../application/use-cases/configurar-politica-tfa.use-case';
import { PoliticaTfaDto } from '../dtos/politica-tfa.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('politica-2fa')
export class PoliticaTfaController {
  constructor(private readonly useCase: ConfigurarPoliticaTfaUseCase) {}

  @Get()
  @UseGuards(AdminClienteGuard)
  async obtener(@CurrentUser() user: JwtPayload): Promise<{ requiere2fa: boolean }> {
    const result = await this.useCase.obtener(user.cliente_id as string);
    if (result.isFail()) throw new NotFoundException(result.getError().message);
    return result.getValue();
  }

  @Put()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.OK)
  async fijar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PoliticaTfaDto,
  ): Promise<{ requiere2fa: boolean }> {
    const result = await this.useCase.execute({
      clienteId: user.cliente_id as string,
      requiere2fa: dto.requiere2fa,
    });
    if (result.isFail()) throw new NotFoundException(result.getError().message);
    return result.getValue();
  }
}
