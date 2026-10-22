/**
 * SoporteController — entry point HTTP del flujo de tickets de soporte IT
 * (F3-Q4, F3-Q5).
 *
 * Rutas (entre corchetes, lo que exige el caso de uso sobre el tipo, D5 c):
 *   POST /soporte                  → CrearTicketSoporteUseCase       [ALTAS sobre SOPORTE]
 *   POST /soporte/:id/solucion     → RegistrarSolucionUseCase        [MODIFICACION sobre su tipo]
 *   GET  /soporte/qr?c=&e=         → ResolverQrAutenticadoUseCase    [ALTAS sobre SOPORTE]
 *                                    (DEBE declararse antes de `:ticketId`)
 *   GET  /soporte/:ticketId        → ObtenerEquipoDeTicketUseCase    [ver el ticket base, igual
 *                                    criterio que `TicketsController.findOne`]
 *
 * `:id` = id del `Ticket` BASE (mismo criterio que las rutas de aprobar/
 * rechazar de `ComprasController`: los use cases de este módulo reciben
 * `ticketId`, no el id del satélite).
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario). Ninguna ruta
 * declara `@RequiereAcciones` (odd/permisos-por-tipo-ticket, D5 d): las celdas
 * `TICKETS:*` ya no deciden; lo hacen los casos de uso con los permisos por
 * tipo que carga `CargadorAlcanceTicket` (403 sin la acción, 404 si no ve el
 * ticket).
 *
 * Tarea: T13.4.
 */
import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { DomainError } from '../../../shared/domain/result';
import {
  AccionSobreTipoNoPermitidaError,
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
  QrAutenticadoResult,
  ResolverQrAutenticadoUseCase,
} from '../../application/use-cases/resolver-qr-autenticado.use-case';

import {
  EquipoInvalidoError,
  QrDeOtraOrganizacionError,
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
): NotFoundException | UnprocessableEntityException | ConflictException | ForbiddenException {
  if (error instanceof AccionSobreTipoNoPermitidaError) {
    return new ForbiddenException(error.message);
  }
  if (
    error instanceof TicketNoEncontradoError ||
    error instanceof TicketSoporteNoEncontradoError ||
    error instanceof QrDeOtraOrganizacionError
  ) {
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

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('soporte')
export class SoporteController {
  constructor(
    private readonly crearTicketSoporteUseCase: CrearTicketSoporteUseCase,
    private readonly registrarSolucionUseCase: RegistrarSolucionUseCase,
    private readonly obtenerEquipoDeTicketUseCase: ObtenerEquipoDeTicketUseCase,
    private readonly resolverQrAutenticadoUseCase: ResolverQrAutenticadoUseCase,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /**
   * POST /soporte
   * Crea un ticket de soporte (ticket base + satélite `ticket_soporte`,
   * ADR-3). `equipoId` es OPCIONAL. `solicitanteId`/`autorId` = JWT.sub;
   * `anio` lo resuelve el servidor.
   * @throws 403 sin `ALTAS` sobre el tipo SOPORTE (odd/permisos-por-tipo-ticket, D5 c)
   * @throws 409 sin ciclo activo
   * @throws 422 solicitante/equipo inválido
   */
  @Post()
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
      alcance: await this.alcances.cargar(user),
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
   * @throws 403 ve el ticket sin `MODIFICACION` sobre su tipo (odd/permisos-por-tipo-ticket D5 c)
   * @throws 404 ticket inexistente o que el actor no ve (`LECTURA` sobre el tipo o fila,
   *   odd/permisos-por-tipo-ticket S3), o ticket_soporte inexistente
   */
  @Post(':id/solucion')
  @HttpCode(HttpStatus.OK)
  async registrarSolucion(
    @Param('id') id: string,
    @Body() dto: RegistrarSolucionHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketSoporteResponseDto> {
    const result = await this.registrarSolucionUseCase.execute({
      ticketId: id,
      solucion: dto.solucion,
      ...(await this.alcances.cargar(user)),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toTicketSoporteOnlyResponseDto(result.getValue());
  }

  /**
   * GET /soporte/qr?c=<slug>&e=<token>
   * Camino autenticado del QR de un equipo (sdd/formulario-publico-qr, WU-17; ADR-9). El slug
   * debe ser el del cliente de la sesión (404 si no). Devuelve `{ equipo: {id, nombre} | null }`.
   *
   * IMPORTANTE: va ANTES de `@Get(':ticketId')`; si no, Express matchea `/soporte/qr` como
   * `ticketId = 'qr'`.
   * @throws 403 sin `ALTAS` sobre el tipo SOPORTE: el escaneo es el primer paso de esa alta
   * @throws 404 el slug no es el del cliente de la sesión
   */
  @Get('qr')
  async resolverQr(
    @Query('c') slug: unknown,
    @Query('e') token: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<QrAutenticadoResult> {
    const result = await this.resolverQrAutenticadoUseCase.execute({
      clienteId: user.cliente_id as string,
      slug,
      token,
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue();
  }

  /**
   * GET /soporte/:ticketId
   * Resuelve el equipo vinculado al ticket de soporte (`equipo: null` si no
   * tiene satélite `ticket_soporte` o no tiene equipo asociado — nunca 404).
   * Usado por el frontend para resaltar el "equipo en mantenimiento" en el
   * detalle del ticket.
   * @throws 404 ticket inexistente o no accesible para el actor (`LECTURA` sobre el tipo o
   *   visibilidad de fila, odd/permisos-por-tipo-ticket S3)
   */
  @Get(':ticketId')
  async obtenerEquipoDeTicket(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EquipoDeTicketResponseDto> {
    const result = await this.obtenerEquipoDeTicketUseCase.execute({
      ticketId,
      ...(await this.alcances.cargar(user)),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoDeTicketResponseDto(result.getValue());
  }
}
