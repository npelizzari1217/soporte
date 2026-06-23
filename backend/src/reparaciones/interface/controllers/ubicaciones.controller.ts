/**
 * UbicacionesController — endpoints REST para la gestión de ubicaciones físicas.
 *
 * Rutas:
 *   POST   /ubicaciones       → CrearUbicacionUseCase   [ticket:crear]
 *   DELETE /ubicaciones/:id   → EliminarUbicacionUseCase [ticket:crear]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * Tarea: 5.D.2
 */
import {
  Body,
  Controller,
  Delete,
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

import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import {
  PadreUbicacionEliminadoError,
  UbicacionInvalidaError,
} from '../../domain/errors/reparaciones.errors';
import { CrearUbicacionUseCase } from '../../application/use-cases/crear-ubicacion.use-case';
import { EliminarUbicacionUseCase } from '../../application/use-cases/eliminar-ubicacion.use-case';

import { CreateUbicacionHttpDto, UbicacionResponseDto } from '../dtos/reparaciones.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toUbicacionResponse(ubicacion: UbicacionEntity): UbicacionResponseDto {
  return {
    id: ubicacion.id,
    nombre: ubicacion.nombre,
    descripcion: ubicacion.descripcion,
    padreId: ubicacion.padreId,
    activo: ubicacion.activo,
    createdAt: ubicacion.createdAt.toISOString(),
    updatedAt: ubicacion.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('ubicaciones')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class UbicacionesController {
  constructor(
    private readonly crearUbicacionUseCase: CrearUbicacionUseCase,
    private readonly eliminarUbicacionUseCase: EliminarUbicacionUseCase,
  ) {}

  /**
   * POST /ubicaciones
   * Crea una nueva ubicación física (con padre opcional).
   *
   * @returns 201 Created + UbicacionResponseDto
   * @throws 404 si el padre no existe o está eliminado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:crear')
  async crearUbicacion(
    @Body() dto: CreateUbicacionHttpDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<UbicacionResponseDto> {
    const result = await this.crearUbicacionUseCase.execute({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      padreId: dto.padreId ?? null,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof PadreUbicacionEliminadoError) {
        throw new NotFoundException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo crear la ubicacion');
    }

    return toUbicacionResponse(result.getValue());
  }

  /**
   * DELETE /ubicaciones/:id
   * Elimina lógicamente una ubicación y sus descendientes (cascada lógica).
   * Registra OperacionTicket UBICACION_ELIMINADA en los tickets afectados.
   *
   * @returns 204 No Content
   * @throws 404 si la ubicacion no existe o ya está eliminada
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ticket:crear')
  async eliminarUbicacion(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    const result = await this.eliminarUbicacionUseCase.execute({
      ubicacionId: id,
      autorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof UbicacionInvalidaError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InternalServerErrorException) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo eliminar la ubicacion');
    }
  }
}
