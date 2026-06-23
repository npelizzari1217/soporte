/**
 * ComprasController — endpoints REST para el módulo de compras.
 *
 * Rutas:
 *   POST   /compras                      → CrearTicketCompraUseCase  [ticket:crear]
 *   POST   /compras/:id/enviar-aprobacion → EnviarAAprobacionUseCase (autenticado)
 *   POST   /compras/:id/aprobar           → AprobarCompraUseCase      [compra:aprobar]
 *   POST   /compras/:id/rechazar          → RechazarCompraUseCase     [compra:aprobar]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 * El TenantGuard resuelve la DB tenant y bindea TenantContext antes de que
 * cualquier repositorio tenant intente acceder a la DB.
 *
 * IMPORTANTE: aprobadoPorId se extrae SIEMPRE del JWT (@CurrentUser), NUNCA del body.
 * El gate de permiso 'compra:aprobar' está en el guard (PermissionsGuard); el use case
 * es agnóstico al permiso.
 *
 * Tarea: 4.D.2
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
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

import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import {
  EstadoCatalogoNoEncontradoError,
  SolicitanteInvalidoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
  TicketNoEncontradoError,
  TransicionInvalidaError,
} from '../../../tickets/domain/errors/tickets.errors';

import { CrearTicketCompraUseCase } from '../../application/use-cases/crear-ticket-compra.use-case';
import { EnviarAAprobacionUseCase } from '../../application/use-cases/enviar-a-aprobacion.use-case';
import { AprobarCompraUseCase } from '../../application/use-cases/aprobar-compra.use-case';
import { RechazarCompraUseCase } from '../../application/use-cases/rechazar-compra.use-case';

import {
  MotivoRechazoRequeridoError,
  SinItemsActivosError,
  TicketCompraNoEncontradoError,
  TicketNoEsComprasError,
} from '../../domain/errors/compras.errors';

import {
  CreateTicketCompraHttpDto,
  RechazarCompraHttpDto,
  TicketCompraConTicketResponseDto,
} from '../dtos/compras.dto';

// ─── Mappers ──────────────────────────────────────────────────────────────────

/**
 * Mapper para endpoints que solo retornan el ticket (crear, enviar-aprobacion).
 * El id de ticket_compra no está disponible en esos use cases; se usa ticket.id
 * como placeholder hasta que esos use cases también retornen el satélite.
 */
function toResponseFromTicket(ticket: TicketEntity): TicketCompraConTicketResponseDto {
  return {
    id: ticket.id,
    ticketId: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    estadoId: ticket.estadoId,
    aprobadoPorId: null,
    aprobadoEn: null,
    motivoRechazo: null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/**
 * Mapper para endpoints que retornan ticket + ticketCompra (aprobar, rechazar).
 * Usa el id real del ticket_compra y mapea los campos de aprobación del satélite.
 */
function toResponseWithSatelite(
  ticket: TicketEntity,
  ticketCompra: TicketCompraEntity,
): TicketCompraConTicketResponseDto {
  return {
    id: ticketCompra.id,
    ticketId: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    estadoId: ticket.estadoId,
    aprobadoPorId: ticketCompra.aprobadoPorId,
    aprobadoEn: ticketCompra.aprobadoEn?.toISOString() ?? null,
    motivoRechazo: ticketCompra.motivoRechazo,
    createdAt: ticketCompra.createdAt.toISOString(),
    updatedAt: ticketCompra.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ComprasController {
  constructor(
    private readonly crearTicketCompraUseCase: CrearTicketCompraUseCase,
    private readonly enviarAAprobacionUseCase: EnviarAAprobacionUseCase,
    private readonly aprobarCompraUseCase: AprobarCompraUseCase,
    private readonly rechazarCompraUseCase: RechazarCompraUseCase,
  ) {}

  /**
   * POST /compras
   * Crea un nuevo ticket de compra (ticket base + satélite ticket_compra en una tx).
   *
   * @returns 201 Created + TicketCompraConTicketResponseDto
   * @throws 422 si solicitante inválido o tipo no es COMPRAS
   * @throws 404 si tipo de ticket no existe en catálogo
   * @throws 500 si el catálogo tenant no está sembrado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:crear')
  async crearTicketCompra(
    @Body() dto: CreateTicketCompraHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketCompraConTicketResponseDto> {
    const result = await this.crearTicketCompraUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      prioridadId: dto.prioridadId,
      cicloId: dto.cicloId ?? null,
      solicitanteId: dto.solicitanteId,
      fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
      clienteId: user.cliente_id,
      autorId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof SolicitanteInvalidoError || error instanceof TicketNoEsComprasError) {
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
      throw new UnprocessableEntityException('No se pudo crear el ticket de compra');
    }

    return toResponseFromTicket(result.getValue());
  }

  /**
   * POST /compras/:id/enviar-aprobacion
   * Transiciona el ticket de ABIERTO a PENDIENTE_APROBACION.
   * Requiere al menos un ítem activo en el ticket_compra.
   *
   * @returns 200 OK + TicketCompraConTicketResponseDto
   * @throws 404 si el ticket no existe
   * @throws 422 si no hay ítems o la transición es inválida
   */
  @Post(':id/enviar-aprobacion')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ticket:crear')
  async enviarAAprobacion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketCompraConTicketResponseDto> {
    const result = await this.enviarAAprobacionUseCase.execute({
      ticketId: id,
      autorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (
        error instanceof TicketNoEncontradoError ||
        error instanceof TicketCompraNoEncontradoError
      ) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof SinItemsActivosError || error instanceof TransicionInvalidaError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (
        error instanceof EstadoCatalogoNoEncontradoError ||
        error instanceof TipoOperacionNoEncontradoError ||
        error instanceof TipoTicketNoEncontradoError
      ) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo enviar el ticket a aprobación');
    }

    return toResponseFromTicket(result.getValue());
  }

  /**
   * POST /compras/:id/aprobar
   * Aprueba un ticket de compra en estado PENDIENTE_APROBACION.
   * Requiere permiso compra:aprobar (verificado por PermissionsGuard).
   * El aprobadoPorId viene del JWT, no del body.
   *
   * @returns 200 OK + TicketCompraConTicketResponseDto
   * @throws 404 si el ticket o ticket_compra no existen
   * @throws 422 si la transición es inválida
   */
  @Post(':id/aprobar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('compra:aprobar')
  async aprobarCompra(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketCompraConTicketResponseDto> {
    const result = await this.aprobarCompraUseCase.execute({
      ticketId: id,
      aprobadoPorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (
        error instanceof TicketNoEncontradoError ||
        error instanceof TicketCompraNoEncontradoError
      ) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TransicionInvalidaError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (
        error instanceof EstadoCatalogoNoEncontradoError ||
        error instanceof TipoOperacionNoEncontradoError ||
        error instanceof TipoTicketNoEncontradoError
      ) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo aprobar el ticket de compra');
    }

    const { ticket, ticketCompra } = result.getValue();
    return toResponseWithSatelite(ticket, ticketCompra);
  }

  /**
   * POST /compras/:id/rechazar
   * Rechaza un ticket de compra: PENDIENTE_APROBACION → RECHAZADO → CERRADO (doble tx).
   * Requiere permiso compra:aprobar (verificado por PermissionsGuard).
   * El aprobadoPorId viene del JWT, no del body.
   *
   * @returns 200 OK + TicketCompraConTicketResponseDto (estadoId = CERRADO)
   * @throws 404 si el ticket o ticket_compra no existen
   * @throws 422 si motivo vacío o transición inválida
   */
  @Post(':id/rechazar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('compra:aprobar')
  async rechazarCompra(
    @Param('id') id: string,
    @Body() dto: RechazarCompraHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketCompraConTicketResponseDto> {
    const result = await this.rechazarCompraUseCase.execute({
      ticketId: id,
      aprobadoPorId: user.sub,
      motivoRechazo: dto.motivoRechazo,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (
        error instanceof TicketNoEncontradoError ||
        error instanceof TicketCompraNoEncontradoError
      ) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof MotivoRechazoRequeridoError ||
        error instanceof TransicionInvalidaError
      ) {
        throw new UnprocessableEntityException(error.message);
      }
      if (
        error instanceof EstadoCatalogoNoEncontradoError ||
        error instanceof TipoOperacionNoEncontradoError ||
        error instanceof TipoTicketNoEncontradoError
      ) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo rechazar el ticket de compra');
    }

    const { ticket, ticketCompra } = result.getValue();
    return toResponseWithSatelite(ticket, ticketCompra);
  }
}
