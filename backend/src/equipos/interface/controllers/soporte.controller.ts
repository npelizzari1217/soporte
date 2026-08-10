/**
 * SoporteController — entry point HTTP del flujo de tickets de soporte IT
 * (F3-Q4, F3-Q5).
 *
 * Rutas:
 *   POST /soporte                  → CrearTicketSoporteUseCase       [ticket:crear]
 *   POST /soporte/:id/solucion     → RegistrarSolucionUseCase        [ticket:editar]
 *   GET  /soporte/:ticketId        → ObtenerEquipoDeTicketUseCase    (sin permiso extra,
 *                                    igual criterio que `TicketsController.findOne`)
 *
 * `:id` = id del `Ticket` BASE (mismo criterio que las rutas de aprobar/
 * rechazar de `ComprasController`: los use cases de este módulo reciben
 * `ticketId`, no el id del satélite).
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `PermissionsGuard` (mismo patrón que `EquiposController`).
 *
 * Tarea: T13.4.
 */
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { ModulosGuard } from '../../../auth/infrastructure/guards/modulos.guard';
import {
  CurrentUser,
  RequireModulo,
  RequirePermissions,
} from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';
import {
  TicketNoEncontradoError,
  TipoTicketNoEncontradoError,
  PrioridadNoEncontradaError,
  SolicitanteInvalidoError,
  SinCicloActivoError,
  SecuenciaAgotadaError,
} from '../../../tickets/domain/errors/tickets.errors';

import { CrearTicketSoporteUseCase } from '../../application/use-cases/crear-ticket-soporte.use-case';
import { RegistrarSolucionUseCase } from '../../application/use-cases/registrar-solucion.use-case';
import { ObtenerEquipoDeTicketUseCase } from '../../application/use-cases/obtener-equipo-de-ticket.use-case';

import {
  EquipoInvalidoError,
  TicketSoporteNoEncontradoError,
} from '../../domain/errors/equipos.errors';

import {
  CreateTicketSoporteHttpDto,
  RegistrarSolucionHttpDto,
  TicketSoporteConTicketResponseDto,
  TicketSoporteResponseDto,
  EquipoDeTicketResponseDto,
  toTicketSoporteOnlyResponseDto,
  toTicketSoporteResponseDto,
  toEquipoDeTicketResponseDto,
} from '../dtos/equipos.dto';

/** Mapea un `DomainError` de los use cases de soporte a la `HttpException` correspondiente. */
function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (error instanceof TicketNoEncontradoError || error instanceof TicketSoporteNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof SinCicloActivoError || error instanceof SecuenciaAgotadaError) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof TipoTicketNoEncontradoError ||
    error instanceof PrioridadNoEncontradaError ||
    error instanceof SolicitanteInvalidoError ||
    error instanceof EquipoInvalidoError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo esperado).
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModulosGuard)
@RequireModulo('SOPORTE')
@Controller('soporte')
export class SoporteController {
  constructor(
    private readonly crearTicketSoporteUseCase: CrearTicketSoporteUseCase,
    private readonly registrarSolucionUseCase: RegistrarSolucionUseCase,
    private readonly obtenerEquipoDeTicketUseCase: ObtenerEquipoDeTicketUseCase,
  ) {}

  /**
   * POST /soporte
   * Crea un ticket de soporte (ticket base + satélite `ticket_soporte`,
   * ADR-3). `equipoId` es OPCIONAL. `solicitanteId`/`autorId` = JWT.sub;
   * `anio` lo resuelve el servidor.
   * @throws 409 sin ciclo activo
   * @throws 422 solicitante/equipo inválido
   */
  @Post()
  @RequirePermissions('ticket:crear')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CreateTicketSoporteHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketSoporteConTicketResponseDto> {
    const result = await this.crearTicketSoporteUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      prioridadId: dto.prioridadId,
      equipoId: dto.equipoId ?? null,
      descripcionProblema: dto.descripcionProblema ?? null,
      solicitanteId: user.sub,
      clienteId: user.cliente_id as string,
      autorId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketSoporte } = result.getValue();
    return toTicketSoporteResponseDto(ticket, ticketSoporte);
  }

  /**
   * POST /soporte/:id/solucion
   * Registra la solución aplicada — `:id` = id del `Ticket` base.
   * @throws 404 ticket_soporte inexistente
   */
  @Post(':id/solucion')
  @RequirePermissions('ticket:editar')
  @HttpCode(HttpStatus.OK)
  async registrarSolucion(
    @Param('id') id: string,
    @Body() dto: RegistrarSolucionHttpDto,
  ): Promise<TicketSoporteResponseDto> {
    const result = await this.registrarSolucionUseCase.execute({
      ticketId: id,
      solucion: dto.solucion,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toTicketSoporteOnlyResponseDto(result.getValue());
  }

  /**
   * GET /soporte/:ticketId
   * Resuelve el equipo vinculado al ticket de soporte (`equipo: null` si no
   * tiene satélite `ticket_soporte` o no tiene equipo asociado — nunca 404).
   * Usado por el frontend para resaltar el "equipo en mantenimiento" en el
   * detalle del ticket.
   */
  @Get(':ticketId')
  async obtenerEquipoDeTicket(
    @Param('ticketId') ticketId: string,
  ): Promise<EquipoDeTicketResponseDto> {
    const result = await this.obtenerEquipoDeTicketUseCase.execute({ ticketId });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoDeTicketResponseDto(result.getValue());
  }
}
