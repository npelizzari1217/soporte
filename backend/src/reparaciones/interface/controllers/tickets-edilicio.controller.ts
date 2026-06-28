/**
 * TicketsEdilicioController — endpoints REST para crear tickets edilicios.
 *
 * Rutas:
 *   POST /tickets-edilicio → CrearTicketEdilicioUseCase [ticket:crear]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * Tarea: 5.D.2
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

import { CrearTicketEdilicioUseCase } from '../../application/use-cases/crear-ticket-edilicio.use-case';
import {
  TicketNoEsEdiliciaError,
  UbicacionInvalidaError,
} from '../../domain/errors/reparaciones.errors';

import { CreateTicketEdilicioHttpDto, TicketEdilicioResponseDto } from '../dtos/reparaciones.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toTicketEdilicioResponse(ticket: TicketEntity): TicketEdilicioResponseDto {
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

@Controller('tickets-edilicio')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class TicketsEdilicioController {
  constructor(private readonly crearTicketEdilicioUseCase: CrearTicketEdilicioUseCase) {}

  /**
   * POST /tickets-edilicio
   * Crea un nuevo ticket de tipo EDILICIA (ticket base + satélite ticket_edilicia en una tx).
   *
   * @returns 201 Created + TicketEdilicioResponseDto
   * @throws 422 si solicitante inválido, ubicacion inválida o tipo no es EDILICIA
   * @throws 404 si tipo de ticket no existe en catálogo
   * @throws 500 si el catálogo tenant no está sembrado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:crear')
  async crearTicketEdilicio(
    @Body() dto: CreateTicketEdilicioHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketEdilicioResponseDto> {
    const result = await this.crearTicketEdilicioUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      prioridadId: dto.prioridadId,
      cicloId: dto.cicloId ?? null,
      solicitanteId: dto.solicitanteId,
      clienteId: user.cliente_id,
      autorId: user.sub,
      anio: new Date().getFullYear(),
      ubicacionId: dto.ubicacionId,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (
        error instanceof SolicitanteInvalidoError ||
        error instanceof UbicacionInvalidaError ||
        error instanceof TicketNoEsEdiliciaError
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
      throw new UnprocessableEntityException('No se pudo crear el ticket edilicio');
    }

    return toTicketEdilicioResponse(result.getValue());
  }
}
