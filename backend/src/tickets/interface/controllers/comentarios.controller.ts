/**
 * ComentariosController — endpoint REST para crear comentarios sobre tickets.
 *
 * Rutas:
 *   POST /tickets/:id/comentarios → CrearComentarioUseCase [ticket:comentar]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 * Permiso requerido: ticket:comentar (b0..019) — disponible para USUARIO, COLABORADOR,
 * TECNICO y ADMINISTRADOR.
 *
 * DIFERENCIA CLAVE vs. POST /tickets/:id/observaciones:
 *   - observaciones requiere ticket:observar (exclusivo de TECNICO+) y dispara auto-transición.
 *   - comentarios requiere ticket:comentar (disponible desde USUARIO) y NO cambia estado.
 *
 * Ref spec: specs/tickets-core/spec.md §POST /tickets/:id/comentarios
 * Ref design: ADR-2
 * Change: tickets-rbac-4-roles / PR4b — T4B.8
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { CurrentUser, RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

import { CrearComentarioUseCase } from '../../application/use-cases/crear-comentario.use-case';
import {
  ComentarioNoPermitidoError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { CrearComentarioRequestDto, OperacionTicketResponseDto } from '../dtos/tickets.dto';

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
export class ComentariosController {
  constructor(private readonly crearComentarioUseCase: CrearComentarioUseCase) {}

  /**
   * POST /tickets/:id/comentarios
   * Registra un comentario aclaratorio sobre el ticket.
   *
   * No cambia el estado del ticket (a diferencia de POST /tickets/:id/observaciones).
   * Bloqueado en estados terminales (RESUELTO, SIN_SOLUCION, RECHAZADO) y
   * congelados (CERRADO, CANCELADO, PENDIENTE_APROBACION).
   *
   * @returns 201 Created + OperacionTicketResponseDto del comentario
   * @throws 422 UnprocessableEntityException si contenido vacío o ticket en estado bloqueado
   * @throws 404 NotFoundException si el ticket no existe o no pertenece al tenant
   */
  @Post(':id/comentarios')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:comentar')
  async crearComentario(
    @Param('id') ticketId: string,
    @Body() dto: CrearComentarioRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OperacionTicketResponseDto> {
    // Validar contenido no vacío (guard de presentación — antes de invocar el use case)
    if (!dto.contenido || dto.contenido.trim() === '') {
      throw new UnprocessableEntityException('contenido no puede estar vacío.');
    }

    const result = await this.crearComentarioUseCase.execute({
      ticketId,
      texto: dto.contenido,
      autorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ComentarioNoPermitidoError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo crear el comentario');
    }

    return toOperacionResponse(result.getValue());
  }
}
