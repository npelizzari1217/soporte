/**
 * PreventivoController — entry point HTTP del ABM de planes de
 * mantenimiento preventivo (WU-4).
 *
 * Rutas:
 *   POST   /preventivo/planes                    → CrearPlanUseCase              [PREVENTIVO:ALTAS]
 *   GET    /preventivo/planes                     → ListarPlanesUseCase           [PREVENTIVO:LECTURA]
 *   GET    /preventivo/planes/:id/generaciones     → ListarGeneracionesPlanUseCase [PREVENTIVO:LECTURA]
 *   PATCH  /preventivo/planes/:id                  → EditarPlanUseCase             [PREVENTIVO:MODIFICACION]
 *   DELETE /preventivo/planes/:id                  → DarDeBajaPlanUseCase          [PREVENTIVO:BORRADO]
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (mismo patrón que `EquiposController`/`ReparacionesController`).
 *
 * NO implementa la generación automática (cron, transacción del ciclo,
 * `RESERVADO`) — eso es WU-5.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Objetivo excluyente del
 * plan", "Permiso propio del módulo PREVENTIVO", "Baja de plan frena
 * generación sin borrar historial". Tarea: 4.4.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { DomainError } from '../../../shared/domain/result';

import { CrearPlanUseCase } from '../../application/use-cases/crear-plan.use-case';
import { EditarPlanUseCase } from '../../application/use-cases/editar-plan.use-case';
import { ListarPlanesUseCase } from '../../application/use-cases/listar-planes.use-case';
import { DarDeBajaPlanUseCase } from '../../application/use-cases/dar-de-baja-plan.use-case';
import { ListarGeneracionesPlanUseCase } from '../../application/use-cases/listar-generaciones-plan.use-case';

import {
  ObjetivoInvalidoError,
  IntervaloInvalidoError,
  UnidadIntervaloInvalidaError,
  PlanNoEncontradoError,
} from '../../domain/errors/preventivo.errors';

import {
  CreatePlanPreventivoHttpDto,
  EditarPlanPreventivoHttpDto,
  PlanPreventivoResponseDto,
  PreventivoGeneracionResponseDto,
  toPlanPreventivoResponseDto,
  toPreventivoGeneracionResponseDto,
} from '../dtos/preventivo.dto';

/** Mapea un `DomainError` de los use cases de preventivo a la `HttpException` correspondiente. */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof PlanNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof ObjetivoInvalidoError ||
    error instanceof IntervaloInvalidoError ||
    error instanceof UnidadIntervaloInvalidaError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo esperado).
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('preventivo/planes')
export class PreventivoController {
  constructor(
    private readonly crearPlanUseCase: CrearPlanUseCase,
    private readonly editarPlanUseCase: EditarPlanUseCase,
    private readonly listarPlanesUseCase: ListarPlanesUseCase,
    private readonly darDeBajaPlanUseCase: DarDeBajaPlanUseCase,
    private readonly listarGeneracionesPlanUseCase: ListarGeneracionesPlanUseCase,
  ) {}

  /**
   * POST /preventivo/planes
   * Crea un plan de mantenimiento preventivo.
   * @throws 422 objetivo excluyente violado, o cadencia inválida
   */
  @Post()
  @RequiereAcciones('PREVENTIVO:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreatePlanPreventivoHttpDto): Promise<PlanPreventivoResponseDto> {
    const result = await this.crearPlanUseCase.execute({
      titulo: dto.titulo,
      instrucciones: dto.instrucciones ?? null,
      equipoId: dto.equipoId ?? null,
      ubicacion: dto.ubicacion ?? null,
      prioridadId: dto.prioridadId,
      responsableId: dto.responsableId,
      intervaloValor: dto.intervaloValor,
      intervaloUnidad: dto.intervaloUnidad,
      fechaInicio: new Date(dto.fechaInicio),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPlanPreventivoResponseDto(result.getValue());
  }

  /**
   * GET /preventivo/planes
   * Lista los planes de mantenimiento preventivo del tenant.
   */
  @Get()
  @RequiereAcciones('PREVENTIVO:LECTURA')
  async listar(): Promise<PlanPreventivoResponseDto[]> {
    const result = await this.listarPlanesUseCase.execute();
    return result.getValue().map(toPlanPreventivoResponseDto);
  }

  /**
   * GET /preventivo/planes/:id/generaciones
   * Vista de auditoría: fecha programada, resultado y ticket generado de un plan.
   * @throws 404 plan inexistente
   */
  @Get(':id/generaciones')
  @RequiereAcciones('PREVENTIVO:LECTURA')
  async listarGeneraciones(@Param('id') id: string): Promise<PreventivoGeneracionResponseDto[]> {
    const result = await this.listarGeneracionesPlanUseCase.execute({ planId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toPreventivoGeneracionResponseDto);
  }

  /**
   * PATCH /preventivo/planes/:id
   * Edita un plan (PATCH semántico). [R2] Recalcula `proximaEjecucionEn`
   * hacia adelante desde hoy si la cadencia cambió.
   * @throws 404 plan inexistente
   * @throws 422 objetivo excluyente violado, o cadencia inválida
   */
  @Patch(':id')
  @RequiereAcciones('PREVENTIVO:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: EditarPlanPreventivoHttpDto,
  ): Promise<PlanPreventivoResponseDto> {
    const result = await this.editarPlanUseCase.execute({
      planId: id,
      titulo: dto.titulo,
      instrucciones: dto.instrucciones,
      equipoId: dto.equipoId,
      ubicacion: dto.ubicacion,
      prioridadId: dto.prioridadId,
      responsableId: dto.responsableId,
      intervaloValor: dto.intervaloValor,
      intervaloUnidad: dto.intervaloUnidad,
      activo: dto.activo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPlanPreventivoResponseDto(result.getValue());
  }

  /**
   * DELETE /preventivo/planes/:id
   * Baja lógica del plan [R4] — frena la generación futura, preserva lo ya generado.
   * @throws 404 plan inexistente
   */
  @Delete(':id')
  @RequiereAcciones('PREVENTIVO:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id') id: string): Promise<void> {
    const result = await this.darDeBajaPlanUseCase.execute({ planId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
