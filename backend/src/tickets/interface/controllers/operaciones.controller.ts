/**
 * OperacionesController — endpoint REST para el timeline de un ticket.
 *
 * Rutas:
 *   GET /tickets/:id/operaciones → ListarOperacionesUseCase (autenticado + tenant)
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 * Ningún permiso específico requerido: cualquier usuario autenticado en el tenant
 * puede ver el timeline.
 *
 * CRITICAL-2 fix: el use case ahora retorna Result para propagar 404 cuando el ticket
 * no existe. El controller mapea el fail a NotFoundException.
 *
 * Tarea: 3.E.2 + fix CRITICAL-2 verify PR-11
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';

import { ListarOperacionesUseCase } from '../../application/use-cases/listar-operaciones.use-case';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { OperacionTicketResponseDto } from '../dtos/tickets.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toOperacionResponse(op: OperacionTicketEntity): OperacionTicketResponseDto {
  return {
    id: op.id,
    ticketId: op.ticketId,
    tipoOperacionId: op.tipoOperacionId,
    descripcion: op.descripcion,
    estadoAnteriorId: op.estadoAnteriorId,
    estadoNuevoId: op.estadoNuevoId,
    autorId: op.autorId,
    metadata: op.metadata,
    createdAt: op.createdAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class OperacionesController {
  constructor(private readonly listarOperacionesUseCase: ListarOperacionesUseCase) {}

  /**
   * GET /tickets/:id/operaciones
   * Retorna el timeline completo de operaciones del ticket, ordenado por created_at ASC.
   *
   * @returns 200 OK + OperacionTicketResponseDto[]
   * @throws 404 NotFoundException si el ticket no existe
   */
  @Get(':id/operaciones')
  @HttpCode(HttpStatus.OK)
  async obtenerTimeline(@Param('id') ticketId: string): Promise<OperacionTicketResponseDto[]> {
    const result = await this.listarOperacionesUseCase.execute(ticketId);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Ticket no encontrado');
    }

    return result.getValue().map(toOperacionResponse);
  }
}
