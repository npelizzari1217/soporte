/**
 * TicketSoporteController — endpoints REST para crear tickets de soporte IT.
 *
 * Rutas:
 *   POST /tickets-soporte → CrearTicketSoporteUseCase [ticket:crear]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * Tarea: 6.D.2
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
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

import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import {
  EstadoCatalogoNoEncontradoError,
  SolicitanteInvalidoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';

import { CrearTicketSoporteUseCase } from '../../application/use-cases/crear-ticket-soporte.use-case';
import { EquipoInvalidoError, TicketNoEsSoporteError } from '../../domain/errors/equipos.errors';

import { CreateTicketSoporteHttpDto, TicketSoporteResponseDto } from '../dtos/equipos.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toTicketSoporteResponse(ticket: TicketEntity): TicketSoporteResponseDto {
  return {
    id: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    estadoId: ticket.estadoId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('tickets-soporte')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class TicketSoporteController {
  constructor(private readonly crearTicketSoporteUseCase: CrearTicketSoporteUseCase) {}

  /**
   * POST /tickets-soporte
   * Crea un nuevo ticket de tipo SOPORTE/IT (ticket base + satélite ticket_soporte en una tx).
   * El equipo afectado es opcional: puede ser null si el problema no refiere a un equipo concreto.
   *
   * @returns 201 Created + TicketSoporteResponseDto
   * @throws 422 si solicitante inválido, equipo inactivo/inexistente o tipo no es SOPORTE
   * @throws 404 si tipo de ticket no existe en catálogo
   * @throws 500 si el catálogo tenant no está sembrado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:crear')
  async crearTicketSoporte(
    @Body() dto: CreateTicketSoporteHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketSoporteResponseDto> {
    const result = await this.crearTicketSoporteUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      prioridadId: dto.prioridadId,
      cicloId: dto.cicloId ?? null,
      solicitanteId: dto.solicitanteId,
      clienteId: user.cliente_id,
      autorId: user.sub,
      anio: new Date().getFullYear(),
      equipoId: dto.equipoId ?? null,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (
        error instanceof SolicitanteInvalidoError ||
        error instanceof EquipoInvalidoError ||
        error instanceof TicketNoEsSoporteError
      ) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof TipoTicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof EstadoCatalogoNoEncontradoError ||
        error instanceof TipoOperacionNoEncontradoError
      ) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo crear el ticket de soporte');
    }

    return toTicketSoporteResponse(result.getValue());
  }
}
