/**
 * TicketComprasController — compras vinculadas de cualquier ticket (odd/ticket-unificado, S1, S4).
 *
 * Rutas (entre corchetes, lo que exige el caso de uso sobre el tipo del ticket):
 *   GET    /tickets/:ticketId/compras             → ListarComprasDeTicketUseCase         [LECTURA] + ruta COMPRAS:LECTURA
 *   POST   /tickets/:ticketId/compras             → VincularCompraAReparacionUseCase     [MODIFICACION] + ruta COMPRAS:LECTURA
 *   DELETE /tickets/:ticketId/compras/:compraId   → DesvincularCompraDeReparacionUseCase [MODIFICACION] + ruta COMPRAS:LECTURA
 *
 * Vive en `ReparacionesModule` y no en `TicketsModule` porque el vínculo usa el repositorio de
 * compras (`ComprasModule`) y el criterio de bloqueo de reparaciones, que ya importa este módulo;
 * el prefijo `tickets/` no choca con `TicketsController`, que no declara `:id/compras`.
 *
 * Una compra activa vinculada bloquea el ticket (S5): sus tareas quedan congeladas
 * (`VerificadorTicketEditable`), y no se puede borrar mientras tenga compras.
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` + `AccionesGuard`; los permisos por tipo los carga
 * `CargadorAlcanceTicket` por request.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { ListarComprasDeTicketUseCase } from '../../application/use-cases/listar-compras-de-ticket.use-case';
import { VincularCompraAReparacionUseCase } from '../../application/use-cases/vincular-compra-a-reparacion.use-case';
import { DesvincularCompraDeReparacionUseCase } from '../../application/use-cases/desvincular-compra-de-reparacion.use-case';
import {
  CompraDeTicketResponseDto,
  VincularCompraHttpDto,
  toCompraDeTicketResponseDto,
} from '../dtos/reparaciones.dto';
import { toHttpException } from './reparaciones.controller';

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('tickets/:ticketId/compras')
export class TicketComprasController {
  constructor(
    private readonly listarComprasUseCase: ListarComprasDeTicketUseCase,
    private readonly vincularCompraUseCase: VincularCompraAReparacionUseCase,
    private readonly desvincularCompraUseCase: DesvincularCompraDeReparacionUseCase,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /**
   * GET /tickets/:ticketId/compras
   * Las compras vinculadas al ticket, por número, con su grupo de estado y si lo bloquean. Exige
   * `COMPRAS:LECTURA` además de ver el ticket (decisión del dueño, odd/ticket-unificado L19): quien
   * no lo tiene solo sabe si el ticket está bloqueado, por la fila de `GET /reparaciones`.
   * @throws 403 sin `COMPRAS:LECTURA`
   * @throws 404 ticket inexistente o que el actor no ve
   */
  @Get()
  @RequiereAcciones('COMPRAS:LECTURA')
  async listar(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompraDeTicketResponseDto[]> {
    const result = await this.listarComprasUseCase.execute(
      ticketId,
      await this.alcances.cargar(user),
    );
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toCompraDeTicketResponseDto);
  }

  /**
   * POST /tickets/:ticketId/compras
   * Vincula una compra existente del tenant al ticket. IDEMPOTENTE (D4): vincular el mismo par dos
   * veces no crea una segunda fila ni falla. `COMPRAS:LECTURA` en la ruta (el selector consume
   * `GET /compras`, decisión de producto #2435) y `MODIFICACION` sobre el tipo en el caso de uso.
   * @throws 403 sin `COMPRAS:LECTURA`, o sin `MODIFICACION` sobre el tipo
   * @throws 404 ticket o compra inexistente, o ticket que el actor no ve
   */
  @Post()
  @RequiereAcciones('COMPRAS:LECTURA')
  @HttpCode(HttpStatus.CREATED)
  async vincular(
    @Param('ticketId') ticketId: string,
    @Body() dto: VincularCompraHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const result = await this.vincularCompraUseCase.execute({
      ticketId,
      compraId: dto.compraId,
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * DELETE /tickets/:ticketId/compras/:compraId
   * Desvincula (HARD DELETE real, D5) una compra del ticket. Mismos permisos que vincular (S4).
   * @throws 403 sin `COMPRAS:LECTURA`, o sin `MODIFICACION` sobre el tipo
   * @throws 404 vínculo inexistente, o ticket que el actor no ve
   */
  @Delete(':compraId')
  @RequiereAcciones('COMPRAS:LECTURA')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desvincular(
    @Param('ticketId') ticketId: string,
    @Param('compraId') compraId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const result = await this.desvincularCompraUseCase.execute({
      ticketId,
      compraId,
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
