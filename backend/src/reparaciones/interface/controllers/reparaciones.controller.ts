/**
 * ReparacionesController — entry point HTTP del módulo `reparaciones/`
 * (F3-E1, F3-E3, F3-E4, F3-E5).
 *
 * Rutas:
 *   POST   /reparaciones                                    → CrearTicketEdilicioUseCase [ticket:crear]
 *   GET    /reparaciones                                    → ListarReparacionesUseCase  (autenticado)
 *   POST   /reparaciones/:reparacionId/subtareas             → CrearSubtareaUseCase       [subtarea:actualizar]
 *   POST   /reparaciones/subtareas/:subtareaId/completar     → CompletarSubtareaUseCase   [subtarea:actualizar]
 *   DELETE /reparaciones/subtareas/:subtareaId               → EliminarSubtareaUseCase    [subtarea:actualizar]
 *
 * `:reparacionId` = id del satélite `ticket_edilicia` (mismo criterio que
 * `:compraId` en `ComprasController`). Las rutas de subtareas usan
 * `:subtareaId` directamente (sin anidar bajo `:reparacionId`) porque
 * `CompletarSubtareaUseCase`/`EliminarSubtareaUseCase` resuelven el
 * `ticket_edilicia` internamente a partir de la subtarea.
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario — reemplaza a
 * `PermissionsGuard`+`ModulosGuard`+`@RequireModulo('EDILICIA')` de clase).
 * `GET /reparaciones` declara `@RequiereAcciones('EDILICIA:LECTURA')`
 * (reemplaza el gate de módulo puro de hoy, R7).
 *
 * Tarea: T8.6, T9.6.
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
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
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';
import {
  SolicitanteInvalidoError,
  SinCicloActivoError,
  SecuenciaAgotadaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';

import { CrearTicketEdilicioUseCase } from '../../application/use-cases/crear-ticket-edilicio.use-case';
import { ListarReparacionesUseCase } from '../../application/use-cases/listar-reparaciones.use-case';
import { CrearSubtareaUseCase } from '../../application/use-cases/crear-subtarea.use-case';
import { CompletarSubtareaUseCase } from '../../application/use-cases/completar-subtarea.use-case';
import { EliminarSubtareaUseCase } from '../../application/use-cases/eliminar-subtarea.use-case';

import {
  TicketEdiliciaNoEncontradoError,
  SubtareaNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';

import {
  CreateSubtareaHttpDto,
  CreateTicketEdilicioHttpDto,
  ReparacionListItemResponseDto,
  SubtareaEdiliciaResponseDto,
  TicketEdiliciaConTicketResponseDto,
  toReparacionListItemResponseDto,
  toSubtareaEdiliciaResponseDto,
  toTicketEdiliciaResponseDto,
} from '../dtos/reparaciones.dto';

/** Mapea un `DomainError` de los use cases de reparaciones a la `HttpException` correspondiente. */
function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (
    error instanceof TicketNoEncontradoError ||
    error instanceof TicketEdiliciaNoEncontradoError ||
    error instanceof SubtareaNoEncontradaError
  ) {
    return new NotFoundException(error.message);
  }
  if (error instanceof SinCicloActivoError || error instanceof SecuenciaAgotadaError) {
    return new ConflictException(error.message);
  }
  if (error instanceof SolicitanteInvalidoError) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo esperado).
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('reparaciones')
export class ReparacionesController {
  constructor(
    private readonly crearTicketEdilicioUseCase: CrearTicketEdilicioUseCase,
    private readonly listarReparacionesUseCase: ListarReparacionesUseCase,
    private readonly crearSubtareaUseCase: CrearSubtareaUseCase,
    private readonly completarSubtareaUseCase: CompletarSubtareaUseCase,
    private readonly eliminarSubtareaUseCase: EliminarSubtareaUseCase,
  ) {}

  /**
   * POST /reparaciones
   * Crea un ticket edilicio (ticket base + satélite `ticket_edilicia`, ADR-3).
   * `solicitanteId`/`autorId` = JWT.sub; `anio` lo resuelve el servidor.
   * @throws 409 sin ciclo activo
   * @throws 422 solicitante inválido
   */
  @Post()
  @RequiereAcciones('EDILICIA:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CreateTicketEdilicioHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketEdiliciaConTicketResponseDto> {
    const result = await this.crearTicketEdilicioUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      prioridadId: dto.prioridadId,
      ubicacion: dto.ubicacion ?? null,
      solicitanteId: user.sub,
      clienteId: user.cliente_id as string,
      autorId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketEdilicia } = result.getValue();
    return toTicketEdiliciaResponseDto(ticket, ticketEdilicia);
  }

  /**
   * GET /reparaciones
   * Lista los tickets edilicios del tenant (ticket base + satélite + ubicación).
   */
  @Get()
  @RequiereAcciones('EDILICIA:LECTURA')
  async listar(): Promise<ReparacionListItemResponseDto[]> {
    const result = await this.listarReparacionesUseCase.execute();
    return result.getValue().map(toReparacionListItemResponseDto);
  }

  /**
   * POST /reparaciones/:reparacionId/subtareas
   * Agrega una subtarea al checklist de avance (F3-E3).
   * @throws 404 ticket_edilicia inexistente
   */
  @Post(':reparacionId/subtareas')
  @RequiereAcciones('EDILICIA:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crearSubtarea(
    @Param('reparacionId') reparacionId: string,
    @Body() dto: CreateSubtareaHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubtareaEdiliciaResponseDto> {
    const result = await this.crearSubtareaUseCase.execute({
      ticketEdiliciaId: reparacionId,
      descripcion: dto.descripcion,
      orden: dto.orden,
      autorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSubtareaEdiliciaResponseDto(result.getValue());
  }

  /**
   * POST /reparaciones/subtareas/:subtareaId/completar
   * Marca la subtarea como completada (F3-E4). `completadaPorId` viene del JWT.
   * @throws 404 subtarea inexistente
   */
  @Post('subtareas/:subtareaId/completar')
  @RequiereAcciones('EDILICIA:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async completarSubtarea(
    @Param('subtareaId') subtareaId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubtareaEdiliciaResponseDto> {
    const result = await this.completarSubtareaUseCase.execute({
      subtareaId,
      completadaPorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSubtareaEdiliciaResponseDto(result.getValue());
  }

  /**
   * DELETE /reparaciones/subtareas/:subtareaId
   * Baja lógica (soft delete) de una subtarea (F3-E5).
   * @throws 404 subtarea inexistente
   */
  @Delete('subtareas/:subtareaId')
  @RequiereAcciones('EDILICIA:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarSubtarea(
    @Param('subtareaId') subtareaId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const result = await this.eliminarSubtareaUseCase.execute({ subtareaId, autorId: user.sub });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
