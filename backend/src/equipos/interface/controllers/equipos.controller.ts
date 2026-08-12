/**
 * EquiposController — entry point HTTP del inventario de equipos IT
 * (F3-Q1..Q3).
 *
 * Rutas:
 *   POST   /equipos                              → CrearEquipoUseCase              [equipo:gestionar]
 *   GET    /equipos                              → ListarEquiposUseCase            (autenticado)
 *   GET    /equipos/tipos-componente              → ListarTiposComponenteUseCase    (autenticado, SIN escritura)
 *   GET    /equipos/:id                           → ObtenerEquipoUseCase            (autenticado)
 *   PATCH  /equipos/:id                           → EditarEquipoUseCase             [equipo:gestionar]
 *   DELETE /equipos/:id                           → EliminarEquipoUseCase           [equipo:gestionar]
 *   POST   /equipos/:id/componentes                          → AgregarComponenteUseCase     [equipo:gestionar]
 *   DELETE /equipos/:id/componentes/:componenteId             → EliminarComponenteUseCase    [equipo:gestionar]
 *   PATCH  /equipos/:id/componentes/:componenteId             → EditarComponenteUseCase      [equipo:gestionar]
 *   PATCH  /equipos/:id/componentes/:componenteId/reactivar   → ReactivarComponenteUseCase   [equipo:gestionar]
 *
 * `GET /equipos/tipos-componente` se declara ANTES de `GET /equipos/:id` en
 * la clase para que Nest lo matchee como ruta estática y NO como
 * `id="tipos-componente"` (mismo criterio de orden que cualquier router
 * Express-like). El catálogo de tipos de componente es READ-ONLY en Fase 3
 * (F3-Q3): NO declara `@RequirePermissions` — cualquier usuario autenticado
 * del tenant puede listarlo (necesario para poblar el selector al agregar
 * componentes).
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `PermissionsGuard` (mismo patrón que `ComprasController`/
 * `ReparacionesController`).
 *
 * Tarea: T12.6.
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
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { ModulosGuard } from '../../../auth/infrastructure/guards/modulos.guard';
import { RequireModulo, RequirePermissions } from '../../../auth/infrastructure/guards/decorators';
import { DomainError } from '../../../shared/domain/result';

import { CrearEquipoUseCase } from '../../application/use-cases/crear-equipo.use-case';
import { EditarEquipoUseCase } from '../../application/use-cases/editar-equipo.use-case';
import { ObtenerEquipoUseCase } from '../../application/use-cases/obtener-equipo.use-case';
import { ListarEquiposUseCase } from '../../application/use-cases/listar-equipos.use-case';
import { EliminarEquipoUseCase } from '../../application/use-cases/eliminar-equipo.use-case';
import { AgregarComponenteUseCase } from '../../application/use-cases/agregar-componente.use-case';
import { EliminarComponenteUseCase } from '../../application/use-cases/eliminar-componente.use-case';
import { EditarComponenteUseCase } from '../../application/use-cases/editar-componente.use-case';
import { ReactivarComponenteUseCase } from '../../application/use-cases/reactivar-componente.use-case';
import { ListarTiposComponenteUseCase } from '../../application/use-cases/listar-tipos-componente.use-case';

import {
  EquipoNoEncontradoError,
  EquipoInvalidoError,
  NumeroSerieDuplicadoError,
  TipoComponenteCodigoRequeridoError,
  TipoComponenteInactivoError,
  ComponenteNoEncontradoError,
  ComponenteDadoDeBajaError,
  ComponenteYaActivoError,
} from '../../domain/errors/equipos.errors';

import {
  ComponenteResponseDto,
  CreateComponenteHttpDto,
  CreateEquipoHttpDto,
  EditarComponenteHttpDto,
  EditarEquipoHttpDto,
  EquipoDetalleResponseDto,
  EquipoResponseDto,
  TipoComponenteResponseDto,
  toComponenteResponseDto,
  toEquipoDetalleResponseDto,
  toEquipoResponseDto,
  toTipoComponenteResponseDto,
} from '../dtos/equipos.dto';

/** Mapea un `DomainError` de los use cases de equipos a la `HttpException` correspondiente. */
function toHttpException(error: DomainError): NotFoundException | UnprocessableEntityException {
  if (error instanceof EquipoNoEncontradoError || error instanceof ComponenteNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof EquipoInvalidoError ||
    error instanceof NumeroSerieDuplicadoError ||
    error instanceof TipoComponenteCodigoRequeridoError ||
    error instanceof TipoComponenteInactivoError ||
    error instanceof ComponenteDadoDeBajaError ||
    error instanceof ComponenteYaActivoError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo esperado).
  return new UnprocessableEntityException(error.message);
}

/**
 * Mapea un campo fecha (string ISO) del PATCH al dominio con semántica de PATCH:
 * `undefined` = no tocar, `null` = limpiar, string → `Date`.
 */
function fechaPatch(valor: string | null | undefined): Date | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  return new Date(valor);
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModulosGuard)
@RequireModulo('EQUIPOS')
@Controller('equipos')
export class EquiposController {
  constructor(
    private readonly crearEquipoUseCase: CrearEquipoUseCase,
    private readonly editarEquipoUseCase: EditarEquipoUseCase,
    private readonly obtenerEquipoUseCase: ObtenerEquipoUseCase,
    private readonly listarEquiposUseCase: ListarEquiposUseCase,
    private readonly eliminarEquipoUseCase: EliminarEquipoUseCase,
    private readonly agregarComponenteUseCase: AgregarComponenteUseCase,
    private readonly eliminarComponenteUseCase: EliminarComponenteUseCase,
    private readonly editarComponenteUseCase: EditarComponenteUseCase,
    private readonly reactivarComponenteUseCase: ReactivarComponenteUseCase,
    private readonly listarTiposComponenteUseCase: ListarTiposComponenteUseCase,
  ) {}

  /**
   * POST /equipos
   * Crea un equipo en el inventario.
   * @throws 422 numeroSerie duplicado
   */
  @Post()
  @RequirePermissions('equipo:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateEquipoHttpDto): Promise<EquipoResponseDto> {
    const result = await this.crearEquipoUseCase.execute({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie ?? null,
      marca: dto.marca ?? null,
      modelo: dto.modelo ?? null,
      fechaAdquisicion: dto.fechaAdquisicion ? new Date(dto.fechaAdquisicion) : null,
      ubicacion: dto.ubicacion ?? null,
      importe: dto.importe ?? null,
      fechaValoracion: dto.fechaValoracion ? new Date(dto.fechaValoracion) : null,
      observaciones: dto.observaciones ?? null,
      valorResidual: dto.valorResidual ?? null,
      fechaValorResidual: dto.fechaValorResidual ? new Date(dto.fechaValorResidual) : null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoResponseDto(result.getValue());
  }

  /**
   * GET /equipos
   * Lista los equipos activos del inventario.
   */
  @Get()
  async listar(): Promise<EquipoResponseDto[]> {
    const result = await this.listarEquiposUseCase.execute();
    return result.getValue().map(toEquipoResponseDto);
  }

  /**
   * GET /equipos/tipos-componente
   * Lista el catálogo READ-ONLY de tipos de componente activos (F3-Q3).
   */
  @Get('tipos-componente')
  async listarTiposComponente(): Promise<TipoComponenteResponseDto[]> {
    const result = await this.listarTiposComponenteUseCase.execute();
    return result.getValue().map(toTipoComponenteResponseDto);
  }

  /**
   * GET /equipos/:id
   * Obtiene el detalle de un equipo, con `componentes` EMBEBIDOS
   * (sdd/beta-frontend item 1 — cierra G7).
   * @throws 404 equipo inexistente
   */
  @Get(':id')
  async obtener(@Param('id') id: string): Promise<EquipoDetalleResponseDto> {
    const result = await this.obtenerEquipoUseCase.execute({ equipoId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoDetalleResponseDto(result.getValue());
  }

  /**
   * PATCH /equipos/:id
   * Edita datos del equipo (PATCH semántico).
   * @throws 404 equipo inexistente
   * @throws 422 numeroSerie duplicado
   */
  @Patch(':id')
  @RequirePermissions('equipo:gestionar')
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: EditarEquipoHttpDto,
  ): Promise<EquipoResponseDto> {
    const result = await this.editarEquipoUseCase.execute({
      equipoId: id,
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: fechaPatch(dto.fechaAdquisicion),
      ubicacion: dto.ubicacion,
      importe: dto.importe,
      fechaValoracion: fechaPatch(dto.fechaValoracion),
      observaciones: dto.observaciones,
      valorResidual: dto.valorResidual,
      fechaValorResidual: fechaPatch(dto.fechaValorResidual),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoResponseDto(result.getValue());
  }

  /**
   * DELETE /equipos/:id
   * Baja lógica (soft delete) del equipo.
   * @throws 404 equipo inexistente
   */
  @Delete(':id')
  @RequirePermissions('equipo:gestionar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarEquipoUseCase.execute({ equipoId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * POST /equipos/:id/componentes
   * Agrega un componente físico al equipo.
   * @throws 404 equipo inexistente
   * @throws 422 tipo de componente inexistente/inactivo
   */
  @Post(':id/componentes')
  @RequirePermissions('equipo:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async agregarComponente(
    @Param('id') id: string,
    @Body() dto: CreateComponenteHttpDto,
  ): Promise<ComponenteResponseDto> {
    const result = await this.agregarComponenteUseCase.execute({
      equipoId: id,
      tipoComponenteCodigo: dto.tipoComponenteCodigo,
      descripcion: dto.descripcion ?? null,
      numeroSerie: dto.numeroSerie ?? null,
      capacidad: dto.capacidad ?? null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }

  /**
   * DELETE /equipos/:id/componentes/:componenteId
   * Baja lógica (soft delete) de un componente.
   * @throws 404 componente inexistente
   */
  @Delete(':id/componentes/:componenteId')
  @RequirePermissions('equipo:gestionar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarComponente(
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
  ): Promise<void> {
    const result = await this.eliminarComponenteUseCase.execute({ equipoId, componenteId });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * PATCH /equipos/:id/componentes/:componenteId
   * Edita un componente ACTIVO (listado enriquecido de componentes).
   * @throws 404 componente inexistente
   * @throws 422 componente dado de baja, o tipo de componente inexistente/inactivo
   */
  @Patch(':id/componentes/:componenteId')
  @RequirePermissions('equipo:gestionar')
  @HttpCode(HttpStatus.OK)
  async editarComponente(
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
    @Body() dto: EditarComponenteHttpDto,
  ): Promise<ComponenteResponseDto> {
    const result = await this.editarComponenteUseCase.execute({
      equipoId,
      componenteId,
      tipoComponenteCodigo: dto.tipoComponenteCodigo,
      descripcion: dto.descripcion,
      numeroSerie: dto.numeroSerie,
      capacidad: dto.capacidad,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }

  /**
   * PATCH /equipos/:id/componentes/:componenteId/reactivar
   * Revierte la baja lógica de un componente (listado enriquecido de componentes).
   * @throws 404 componente inexistente
   * @throws 422 componente ya activo
   */
  @Patch(':id/componentes/:componenteId/reactivar')
  @RequirePermissions('equipo:gestionar')
  @HttpCode(HttpStatus.OK)
  async reactivarComponente(
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
  ): Promise<ComponenteResponseDto> {
    const result = await this.reactivarComponenteUseCase.execute({ equipoId, componenteId });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }
}
