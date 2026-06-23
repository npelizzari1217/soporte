/**
 * EquiposController — endpoints REST para la gestión del inventario de equipos informáticos.
 *
 * Rutas:
 *   POST   /equipos             → CrearEquipoUseCase        [equipo:gestionar]
 *   PATCH  /equipos/:id         → EditarEquipoUseCase       [equipo:gestionar]
 *   DELETE /equipos/:id         → EliminarEquipoUseCase     [equipo:gestionar]
 *   POST   /equipos/:id/asignar → AsignarEquipoUseCase      [equipo:gestionar]
 *   GET    /equipos/:id         → ObtenerEquipoUseCase
 *   GET    /equipos             → ListarEquiposUseCase
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * Tarea: 6.D.2
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
  Patch,
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

import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import {
  AsignadoEquipoInvalidoError,
  EquipoInformaticoNoEncontradoError,
  NumeroSerieEquipoDuplicadoError,
} from '../../domain/errors/equipos.errors';

import { CrearEquipoUseCase } from '../../application/use-cases/crear-equipo.use-case';
import { EditarEquipoUseCase } from '../../application/use-cases/editar-equipo.use-case';
import { EliminarEquipoUseCase } from '../../application/use-cases/eliminar-equipo.use-case';
import { AsignarEquipoUseCase } from '../../application/use-cases/asignar-equipo.use-case';
import { ObtenerEquipoUseCase } from '../../application/use-cases/obtener-equipo.use-case';
import { ListarEquiposUseCase } from '../../application/use-cases/listar-equipos.use-case';

import {
  AsignarEquipoHttpDto,
  CreateEquipoHttpDto,
  EquipoResponseDto,
  UpdateEquipoHttpDto,
} from '../dtos/equipos.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toEquipoResponse(equipo: EquipoInformaticoEntity): EquipoResponseDto {
  return {
    id: equipo.id,
    nombre: equipo.nombre,
    numeroSerie: equipo.numeroSerie,
    marca: equipo.marca,
    modelo: equipo.modelo,
    fechaAdquisicion: equipo.fechaAdquisicion?.toISOString() ?? null,
    ubicacionId: equipo.ubicacionId,
    asignadoAId: equipo.asignadoAId,
    activo: equipo.activo,
    createdAt: equipo.createdAt.toISOString(),
    updatedAt: equipo.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('equipos')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class EquiposController {
  constructor(
    private readonly crearEquipoUseCase: CrearEquipoUseCase,
    private readonly editarEquipoUseCase: EditarEquipoUseCase,
    private readonly eliminarEquipoUseCase: EliminarEquipoUseCase,
    private readonly asignarEquipoUseCase: AsignarEquipoUseCase,
    private readonly obtenerEquipoUseCase: ObtenerEquipoUseCase,
    private readonly listarEquiposUseCase: ListarEquiposUseCase,
  ) {}

  /**
   * POST /equipos
   * Crea un nuevo equipo en el inventario del tenant.
   * Requiere permiso equipo:gestionar.
   *
   * @returns 201 Created + EquipoResponseDto
   * @throws 409 si numero_serie ya existe en otro equipo
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('equipo:gestionar')
  async crearEquipo(
    @Body() dto: CreateEquipoHttpDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<EquipoResponseDto> {
    const result = await this.crearEquipoUseCase.execute({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie ?? null,
      marca: dto.marca ?? null,
      modelo: dto.modelo ?? null,
      fechaAdquisicion: dto.fechaAdquisicion ? new Date(dto.fechaAdquisicion) : null,
      ubicacionId: dto.ubicacionId ?? null,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof NumeroSerieEquipoDuplicadoError) {
        throw new ConflictException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo crear el equipo');
    }

    return toEquipoResponse(result.getValue());
  }

  /**
   * PATCH /equipos/:id
   * Actualiza los datos de un equipo existente.
   * Requiere permiso equipo:gestionar.
   *
   * @returns 200 OK + EquipoResponseDto
   * @throws 404 si el equipo no existe o fue eliminado
   * @throws 409 si el nuevo numero_serie ya lo usa otro equipo
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('equipo:gestionar')
  async editarEquipo(
    @Param('id') id: string,
    @Body() dto: UpdateEquipoHttpDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<EquipoResponseDto> {
    const result = await this.editarEquipoUseCase.execute({
      equipoId: id,
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie ?? null,
      marca: dto.marca ?? null,
      modelo: dto.modelo ?? null,
      fechaAdquisicion: dto.fechaAdquisicion ? new Date(dto.fechaAdquisicion) : null,
      ubicacionId: dto.ubicacionId ?? null,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof EquipoInformaticoNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof NumeroSerieEquipoDuplicadoError) {
        throw new ConflictException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo actualizar el equipo');
    }

    return toEquipoResponse(result.getValue());
  }

  /**
   * DELETE /equipos/:id
   * Soft delete del equipo (activo=FALSE + deleted_at). No afecta tickets existentes.
   * Requiere permiso equipo:gestionar.
   *
   * @returns 204 No Content
   * @throws 404 si el equipo no existe o ya fue eliminado
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('equipo:gestionar')
  async eliminarEquipo(@Param('id') id: string, @CurrentUser() _user: JwtPayload): Promise<void> {
    const result = await this.eliminarEquipoUseCase.execute({ equipoId: id });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof EquipoInformaticoNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo eliminar el equipo');
    }
  }

  /**
   * POST /equipos/:id/asignar
   * Asigna el equipo a un usuario activo del tenant (cross-DB validation).
   * Requiere permiso equipo:gestionar.
   *
   * @returns 200 OK + EquipoResponseDto
   * @throws 404 si el equipo no existe
   * @throws 422 si el asignado no es usuario activo del tenant
   */
  @Post(':id/asignar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('equipo:gestionar')
  async asignarEquipo(
    @Param('id') id: string,
    @Body() dto: AsignarEquipoHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<EquipoResponseDto> {
    const result = await this.asignarEquipoUseCase.execute({
      equipoId: id,
      asignadoAId: dto.asignadoAId,
      clienteId: user.cliente_id,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof EquipoInformaticoNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof AsignadoEquipoInvalidoError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo asignar el equipo');
    }

    return toEquipoResponse(result.getValue());
  }

  /**
   * GET /equipos/:id
   * Obtiene un equipo por su UUID.
   *
   * @returns 200 OK + EquipoResponseDto
   * @throws 404 si el equipo no existe o fue eliminado
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async obtenerEquipo(
    @Param('id') id: string,
    @CurrentUser() _user: JwtPayload,
  ): Promise<EquipoResponseDto> {
    const result = await this.obtenerEquipoUseCase.execute(id);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof EquipoInformaticoNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Equipo no encontrado');
    }

    return toEquipoResponse(result.getValue());
  }

  /**
   * GET /equipos
   * Lista todos los equipos activos y no eliminados del tenant.
   *
   * @returns 200 OK + EquipoResponseDto[]
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listarEquipos(@CurrentUser() _user: JwtPayload): Promise<EquipoResponseDto[]> {
    const result = await this.listarEquiposUseCase.execute();

    if (result.isFail()) {
      throw new UnprocessableEntityException('No se pudo listar los equipos');
    }

    return result.getValue().map(toEquipoResponse);
  }
}
