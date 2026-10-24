/**
 * PreventivoController — entry point HTTP del ABM de planes de
 * mantenimiento preventivo (WU-4).
 *
 * Rutas (celda del módulo + `LECTURA` sobre el tipo de ticket del plan, odd/preventivo-por-tipo S4):
 *   POST   /preventivo/planes                       → CrearPlanUseCase              [PREVENTIVO:ALTAS + tipo elegido]
 *   GET    /preventivo/planes                       → ListarPlanesUseCase           [PREVENTIVO:LECTURA, tipos visibles]
 *   GET    /preventivo/planes/responsables?tipoId=  → ListarResponsablesPlanUseCase [PREVENTIVO:ALTAS o MODIFICACION + tipo]
 *   GET    /preventivo/planes/:id/generaciones      → ListarGeneracionesPlanUseCase [PREVENTIVO:LECTURA + tipo del plan]
 *   PATCH  /preventivo/planes/:id                   → EditarPlanUseCase             [PREVENTIVO:MODIFICACION + tipo, y el nuevo]
 *   DELETE /preventivo/planes/:id                   → DarDeBajaPlanUseCase          [PREVENTIVO:BORRADO + tipo del plan]
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (mismo patrón que `EquiposController`/`ReparacionesController`).
 * `@RequiereAcciones` exige TODAS las celdas listadas; la lista de responsables pide una de dos
 * (alta o edición, los dos formularios que la usan), así que esa ruta decide inline con
 * `puedeEjecutarAlguna`.
 *
 * El tipo de ticket del plan agrega visibilidad (S4, decisión del dueño L4): cada handler carga el
 * alcance por tipo del actor con `CargadorAlcanceTicket` —el mismo de los tickets— y el caso de uso
 * deja afuera los planes de tipos sin `LECTURA` (404 por id) y rechaza elegir uno de esos tipos
 * (403).
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
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { puedeEjecutarAlguna } from '../../../auth/domain/permisos.util';
import { DomainError } from '../../../shared/domain/result';
import { AgenteAsignable } from '../../../tickets/application/services/elegibilidad-asignado';
import { TipoTicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';

import { CrearPlanUseCase } from '../../application/use-cases/crear-plan.use-case';
import { EditarPlanUseCase } from '../../application/use-cases/editar-plan.use-case';
import { ListarPlanesUseCase } from '../../application/use-cases/listar-planes.use-case';
import { DarDeBajaPlanUseCase } from '../../application/use-cases/dar-de-baja-plan.use-case';
import { ListarGeneracionesPlanUseCase } from '../../application/use-cases/listar-generaciones-plan.use-case';
import { ListarResponsablesPlanUseCase } from '../../application/use-cases/listar-responsables-plan.use-case';

import {
  ObjetivoInvalidoError,
  IntervaloInvalidoError,
  IntervaloExcedeMaximoError,
  UnidadIntervaloInvalidaError,
  TituloDemasiadoLargoError,
  UbicacionDemasiadoLargaError,
  AnticipacionInvalidaError,
  UnidadAnticipacionInvalidaError,
  AnticipacionNoMenorQueCadenciaError,
  PlanNoEncontradoError,
  ResponsableNoElegibleError,
  AccionSobreTipoDelPlanNoPermitidaError,
} from '../../domain/errors/preventivo.errors';

import {
  CreatePlanPreventivoHttpDto,
  EditarPlanPreventivoHttpDto,
  ListarResponsablesPlanQueryDto,
  PlanPreventivoResponseDto,
  PreventivoGeneracionResponseDto,
  toPlanPreventivoResponseDto,
  toPreventivoGeneracionResponseDto,
} from '../dtos/preventivo.dto';

/** Mapea un `DomainError` de los use cases de preventivo a la `HttpException` correspondiente. */
export function toHttpException(
  error: DomainError,
): NotFoundException | ForbiddenException | UnprocessableEntityException {
  if (error instanceof PlanNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof AccionSobreTipoDelPlanNoPermitidaError) {
    return new ForbiddenException(error.message);
  }
  if (
    error instanceof ObjetivoInvalidoError ||
    error instanceof IntervaloInvalidoError ||
    error instanceof IntervaloExcedeMaximoError ||
    error instanceof UnidadIntervaloInvalidaError ||
    error instanceof TituloDemasiadoLargoError ||
    error instanceof UbicacionDemasiadoLargaError ||
    error instanceof AnticipacionInvalidaError ||
    error instanceof UnidadAnticipacionInvalidaError ||
    error instanceof AnticipacionNoMenorQueCadenciaError ||
    error instanceof ResponsableNoElegibleError ||
    // El tipo elegido no admite tickets nuevos: mismo 422 que el alta de un ticket.
    error instanceof TipoTicketNoEncontradoError
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
    private readonly listarResponsablesPlanUseCase: ListarResponsablesPlanUseCase,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /**
   * POST /preventivo/planes
   * Crea un plan de mantenimiento preventivo. `clienteId` = `cliente_id` del JWT.
   * @throws 403 sin `PREVENTIVO:ALTAS`, o sin `LECTURA` sobre el tipo elegido
   * @throws 422 objetivo excluyente violado, cadencia inválida, anticipación inválida o no menor que la cadencia,
   *   tipo que no admite tickets nuevos, o responsable no elegible para el tipo
   */
  @Post()
  @RequiereAcciones('PREVENTIVO:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePlanPreventivoHttpDto,
  ): Promise<PlanPreventivoResponseDto> {
    const result = await this.crearPlanUseCase.execute({
      clienteId: user.cliente_id as string,
      titulo: dto.titulo,
      instrucciones: dto.instrucciones ?? null,
      equipoId: dto.equipoId ?? null,
      ubicacion: dto.ubicacion ?? null,
      prioridadId: dto.prioridadId,
      tipoId: dto.tipoId,
      responsableId: dto.responsableId,
      intervaloValor: dto.intervaloValor,
      intervaloUnidad: dto.intervaloUnidad,
      anticipacionValor: dto.anticipacionValor,
      anticipacionUnidad: dto.anticipacionUnidad,
      fechaInicio: new Date(dto.fechaInicio),
      alcance: await this.alcances.cargar(user),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPlanPreventivoResponseDto(result.getValue());
  }

  /**
   * GET /preventivo/planes
   * Lista los planes de mantenimiento preventivo del tenant de los tipos de ticket con `LECTURA`
   * para el actor (todos para ROOT y ADMINISTRADOR).
   * @throws 403 sin `PREVENTIVO:LECTURA`
   */
  @Get()
  @RequiereAcciones('PREVENTIVO:LECTURA')
  async listar(@CurrentUser() user: JwtPayload): Promise<PlanPreventivoResponseDto[]> {
    const result = await this.listarPlanesUseCase.execute({
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toPlanPreventivoResponseDto);
  }

  /**
   * GET /preventivo/planes/responsables
   * Opciones del selector "Responsable" del alta y la edición: los técnicos (TECNICO o
   * COLABORADOR) con `LECTURA` sobre el tipo de ticket elegido (`?tipoId=`), que es el de los
   * tickets que genera el plan. `clienteId` = `cliente_id` del JWT.
   * @throws 400 sin `tipoId` o con uno que no es UUID
   * @throws 403 sin `PREVENTIVO:ALTAS` ni `PREVENTIVO:MODIFICACION`, o sin `LECTURA` sobre el tipo
   */
  @Get('responsables')
  async listarResponsables(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListarResponsablesPlanQueryDto,
  ): Promise<AgenteAsignable[]> {
    if (!puedeEjecutarAlguna(user, ['PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION'])) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere PREVENTIVO:ALTAS o PREVENTIVO:MODIFICACION',
      );
    }
    const result = await this.listarResponsablesPlanUseCase.execute({
      clienteId: user.cliente_id as string,
      tipoId: query.tipoId,
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue();
  }

  /**
   * GET /preventivo/planes/:id/generaciones
   * Vista de auditoría: fecha programada, resultado y ticket generado de un plan.
   * @throws 404 plan inexistente, dado de baja o de un tipo sin `LECTURA`
   */
  @Get(':id/generaciones')
  @RequiereAcciones('PREVENTIVO:LECTURA')
  async listarGeneraciones(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<PreventivoGeneracionResponseDto[]> {
    const result = await this.listarGeneracionesPlanUseCase.execute({
      planId: id,
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toPreventivoGeneracionResponseDto);
  }

  /**
   * PATCH /preventivo/planes/:id
   * Edita un plan (PATCH semántico). [R2] Recalcula `proximaEjecucionEn`
   * hacia adelante desde hoy si la cadencia o la anticipación cambiaron.
   * @throws 404 plan inexistente, dado de baja o de un tipo sin `LECTURA`
   * @throws 403 sin `PREVENTIVO:MODIFICACION`, o sin `LECTURA` sobre el tipo nuevo
   * @throws 422 objetivo excluyente violado, cadencia inválida, anticipación inválida o no menor que la cadencia,
   *   tipo nuevo que no admite tickets nuevos, o responsable no elegible para el tipo resultante
   */
  @Patch(':id')
  @RequiereAcciones('PREVENTIVO:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async editar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EditarPlanPreventivoHttpDto,
  ): Promise<PlanPreventivoResponseDto> {
    const result = await this.editarPlanUseCase.execute({
      clienteId: user.cliente_id as string,
      planId: id,
      titulo: dto.titulo,
      instrucciones: dto.instrucciones,
      equipoId: dto.equipoId,
      ubicacion: dto.ubicacion,
      prioridadId: dto.prioridadId,
      tipoId: dto.tipoId,
      responsableId: dto.responsableId,
      intervaloValor: dto.intervaloValor,
      intervaloUnidad: dto.intervaloUnidad,
      anticipacionValor: dto.anticipacionValor,
      anticipacionUnidad: dto.anticipacionUnidad,
      activo: dto.activo,
      alcance: await this.alcances.cargar(user),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPlanPreventivoResponseDto(result.getValue());
  }

  /**
   * DELETE /preventivo/planes/:id
   * Baja lógica del plan [R4] — frena la generación futura, preserva lo ya generado.
   * @throws 404 plan inexistente, ya dado de baja o de un tipo sin `LECTURA`
   * @throws 403 sin `PREVENTIVO:BORRADO`
   */
  @Delete(':id')
  @RequiereAcciones('PREVENTIVO:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    const result = await this.darDeBajaPlanUseCase.execute({
      planId: id,
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
