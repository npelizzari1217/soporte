/**
 * SubtareasController — endpoints REST para subtareas edilicias.
 *
 * Rutas:
 *   POST /tickets-edilicio/:id/subtareas → CrearSubtareaUseCase    [ticket:crear]
 *   POST /subtareas/:id/completar        → CompletarSubtareaUseCase [subtarea:actualizar]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * IMPORTANTE: completarSubtarea requiere el permiso 'subtarea:actualizar'
 * (verificado por PermissionsGuard vía @RequirePermissions). El permiso
 * 'subtarea:actualizar' existe en el catálogo RBAC sembrado en PR-07
 * (b0000000-0000-4000-b000-000000000007 — código: subtarea:actualizar).
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

import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import {
  SubtareaEdiliciaNoEncontradaError,
  SubtareaYaCompletadaError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { TipoOperacionNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';

import { CrearSubtareaUseCase } from '../../application/use-cases/crear-subtarea.use-case';
import { CompletarSubtareaUseCase } from '../../application/use-cases/completar-subtarea.use-case';

import { CreateSubtareaHttpDto, SubtareaEdiliciaResponseDto } from '../dtos/reparaciones.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toSubtareaResponse(subtarea: SubtareaEdiliciaEntity): SubtareaEdiliciaResponseDto {
  return {
    id: subtarea.id,
    ticketEdiliciaId: subtarea.ticketEdiliciaId,
    descripcion: subtarea.descripcion,
    completada: subtarea.completada,
    completadaEn: subtarea.completadaEn?.toISOString() ?? null,
    completadaPorId: subtarea.completadaPorId,
    orden: subtarea.orden,
    createdAt: subtarea.createdAt.toISOString(),
    updatedAt: subtarea.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class SubtareasController {
  constructor(
    private readonly crearSubtareaUseCase: CrearSubtareaUseCase,
    private readonly completarSubtareaUseCase: CompletarSubtareaUseCase,
  ) {}

  /**
   * POST /tickets-edilicio/:id/subtareas
   * Agrega una subtarea a un ticket edilicio existente.
   * Recalcula el porcentaje de avance automáticamente.
   *
   * @param id UUID del ticket_edilicia al que pertenece la subtarea.
   * @returns 201 Created + SubtareaEdiliciaResponseDto
   * @throws 404 si el ticket_edilicia no existe
   * @throws 500 si el catálogo tenant no está sembrado (AVANCE_EDILICIO)
   */
  @Post('tickets-edilicio/:id/subtareas')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:crear')
  async crearSubtarea(
    @Param('id') ticketEdiliciaId: string,
    @Body() dto: CreateSubtareaHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubtareaEdiliciaResponseDto> {
    const result = await this.crearSubtareaUseCase.execute({
      ticketEdiliciaId,
      descripcion: dto.descripcion,
      orden: dto.orden,
      autorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TicketEdiliciaNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TipoOperacionNoEncontradoError) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo crear la subtarea');
    }

    return toSubtareaResponse(result.getValue());
  }

  /**
   * POST /subtareas/:id/completar
   * Marca una subtarea edilicia como completada.
   * Requiere el permiso 'subtarea:actualizar' (verificado por PermissionsGuard).
   * completadaPorId y autorId se extraen del JWT.
   *
   * @param id UUID de la subtarea a completar.
   * @returns 200 OK + SubtareaEdiliciaResponseDto
   * @throws 404 si la subtarea no existe
   * @throws 422 si la subtarea ya está completada
   * @throws 500 si el catálogo tenant no está sembrado (AVANCE_EDILICIO)
   */
  @Post('subtareas/:id/completar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('subtarea:actualizar')
  async completarSubtarea(
    @Param('id') subtareaId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubtareaEdiliciaResponseDto> {
    const result = await this.completarSubtareaUseCase.execute({
      subtareaId,
      completadaPorId: user.sub,
      autorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof SubtareaEdiliciaNoEncontradaError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof SubtareaYaCompletadaError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof TipoOperacionNoEncontradoError) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo completar la subtarea');
    }

    return toSubtareaResponse(result.getValue());
  }
}
