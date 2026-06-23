/**
 * ComponentesController — endpoints REST para la gestión de componentes de equipos.
 *
 * Rutas:
 *   POST   /equipos/:id/componentes → AgregarComponenteUseCase           [equipo:gestionar]
 *   DELETE /componentes/:id          → EliminarComponenteUseCase          [equipo:gestionar]
 *   GET    /equipos/:id/componentes  → ObtenerComponentesPorEquipoUseCase
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * Tarea: 6.D.2
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

import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteEquipoNoEncontradoError,
  EquipoInformaticoNoEncontradoError,
  TipoComponenteInactivoError,
  TipoComponenteNoEncontradoError,
} from '../../domain/errors/equipos.errors';

import { AgregarComponenteUseCase } from '../../application/use-cases/agregar-componente.use-case';
import { EliminarComponenteUseCase } from '../../application/use-cases/eliminar-componente.use-case';
import { ObtenerComponentesPorEquipoUseCase } from '../../application/use-cases/obtener-componentes-por-equipo.use-case';

import { ComponenteEquipoResponseDto, CreateComponenteHttpDto } from '../dtos/equipos.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toComponenteResponse(componente: ComponenteEquipoEntity): ComponenteEquipoResponseDto {
  return {
    id: componente.id,
    equipoId: componente.equipoId,
    tipoComponenteId: componente.tipoComponenteId,
    descripcion: componente.descripcion,
    numeroSerie: componente.numeroSerie,
    capacidad: componente.capacidad,
    createdAt: componente.createdAt.toISOString(),
    updatedAt: componente.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ComponentesController {
  constructor(
    private readonly agregarComponenteUseCase: AgregarComponenteUseCase,
    private readonly eliminarComponenteUseCase: EliminarComponenteUseCase,
    private readonly obtenerComponentesPorEquipoUseCase: ObtenerComponentesPorEquipoUseCase,
  ) {}

  /**
   * POST /equipos/:id/componentes
   * Agrega un componente de hardware a un equipo.
   * El tipo de componente debe existir y estar activo.
   * Requiere permiso equipo:gestionar.
   *
   * @returns 201 Created + ComponenteEquipoResponseDto
   * @throws 404 si el equipo no existe o el tipo de componente no existe
   * @throws 422 si el tipo de componente está inactivo
   */
  @Post('equipos/:id/componentes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('equipo:gestionar')
  async agregarComponente(
    @Param('id') equipoId: string,
    @Body() dto: CreateComponenteHttpDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<ComponenteEquipoResponseDto> {
    const result = await this.agregarComponenteUseCase.execute({
      equipoId,
      tipoComponenteId: dto.tipoComponenteId,
      descripcion: dto.descripcion ?? null,
      numeroSerie: dto.numeroSerie ?? null,
      capacidad: dto.capacidad ?? null,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (
        error instanceof EquipoInformaticoNoEncontradoError ||
        error instanceof TipoComponenteNoEncontradoError
      ) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TipoComponenteInactivoError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo agregar el componente');
    }

    return toComponenteResponse(result.getValue());
  }

  /**
   * DELETE /componentes/:id
   * Soft delete de un componente (deleted_at). No afecta el equipo ni otros componentes.
   * Requiere permiso equipo:gestionar.
   *
   * @returns 204 No Content
   * @throws 404 si el componente no existe o ya fue eliminado
   */
  @Delete('componentes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('equipo:gestionar')
  async eliminarComponente(
    @Param('id') id: string,
    @CurrentUser() _user: JwtPayload,
  ): Promise<void> {
    const result = await this.eliminarComponenteUseCase.execute({ componenteId: id });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof ComponenteEquipoNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo eliminar el componente');
    }
  }

  /**
   * GET /equipos/:id/componentes
   * Lista los componentes activos (deleted_at IS NULL) de un equipo.
   *
   * @returns 200 OK + ComponenteEquipoResponseDto[]
   * @throws 404 si el equipo no existe
   */
  @Get('equipos/:id/componentes')
  @HttpCode(HttpStatus.OK)
  async obtenerComponentesPorEquipo(
    @Param('id') equipoId: string,
    @CurrentUser() _user: JwtPayload,
  ): Promise<ComponenteEquipoResponseDto[]> {
    const result = await this.obtenerComponentesPorEquipoUseCase.execute(equipoId);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof EquipoInformaticoNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Equipo no encontrado');
    }

    return result.getValue().map(toComponenteResponse);
  }
}
