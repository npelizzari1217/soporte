/**
 * UbicacionesController — entry point HTTP del catálogo de ubicaciones
 * físicas del tenant (F3-E2).
 *
 * Rutas:
 *   POST   /ubicaciones      → CrearUbicacionUseCase    [catalogo:gestionar]
 *   GET    /ubicaciones      → ListarUbicacionesUseCase (autenticado)
 *   PATCH  /ubicaciones/:id  → EditarUbicacionUseCase   [catalogo:gestionar]
 *   DELETE /ubicaciones/:id  → EliminarUbicacionUseCase [catalogo:gestionar]
 *
 * `catalogo:gestionar` (ADR-6): reuso pragmático del permiso de catálogos
 * de Fase 2 — el seed RBAC de Fase 1 no define un `ubicacion:gestionar`
 * dedicado. Decisión documentada, ver design ADR-6.
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `PermissionsGuard` (mismo patrón que `ComprasController`/
 * `ReparacionesController`). `GET /ubicaciones` NO declara
 * `@RequirePermissions` — cualquier usuario autenticado del tenant puede
 * listar (necesario para poblar selectores de ubicación en la UI).
 *
 * Tarea: T8.6.
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
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';
import { DomainError } from '../../../shared/domain/result';

import { CrearUbicacionUseCase } from '../../application/use-cases/crear-ubicacion.use-case';
import { ListarUbicacionesUseCase } from '../../application/use-cases/listar-ubicaciones.use-case';
import { EditarUbicacionUseCase } from '../../application/use-cases/editar-ubicacion.use-case';
import { EliminarUbicacionUseCase } from '../../application/use-cases/eliminar-ubicacion.use-case';

import {
  UbicacionInvalidaError,
  UbicacionNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';

import {
  CreateUbicacionHttpDto,
  EditarUbicacionHttpDto,
  UbicacionResponseDto,
  toUbicacionResponseDto,
} from '../dtos/reparaciones.dto';

/** Mapea un `DomainError` de los use cases de ubicaciones a la `HttpException` correspondiente. */
function toHttpException(error: DomainError): NotFoundException | UnprocessableEntityException {
  if (error instanceof UbicacionNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof UbicacionInvalidaError) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo esperado).
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('ubicaciones')
export class UbicacionesController {
  constructor(
    private readonly crearUbicacionUseCase: CrearUbicacionUseCase,
    private readonly listarUbicacionesUseCase: ListarUbicacionesUseCase,
    private readonly editarUbicacionUseCase: EditarUbicacionUseCase,
    private readonly eliminarUbicacionUseCase: EliminarUbicacionUseCase,
  ) {}

  /**
   * POST /ubicaciones
   * Crea una ubicación física (raíz o hija de un `padreId` existente).
   * @throws 422 padreId inválido/eliminado
   */
  @Post()
  @RequirePermissions('catalogo:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateUbicacionHttpDto): Promise<UbicacionResponseDto> {
    const result = await this.crearUbicacionUseCase.execute({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      padreId: dto.padreId ?? null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUbicacionResponseDto(result.getValue());
  }

  /**
   * GET /ubicaciones
   * Lista todas las ubicaciones del tenant (activas e inactivas).
   */
  @Get()
  async listar(): Promise<UbicacionResponseDto[]> {
    const result = await this.listarUbicacionesUseCase.execute();
    return result.getValue().map(toUbicacionResponseDto);
  }

  /**
   * PATCH /ubicaciones/:id
   * Edita datos (nombre/descripción/padreId) y/o activa/desactiva.
   * @throws 404 ubicación inexistente
   * @throws 422 nuevo padreId inválido/eliminado
   */
  @Patch(':id')
  @RequirePermissions('catalogo:gestionar')
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: EditarUbicacionHttpDto,
  ): Promise<UbicacionResponseDto> {
    const result = await this.editarUbicacionUseCase.execute({
      ubicacionId: id,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      padreId: dto.padreId,
      activo: dto.activo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUbicacionResponseDto(result.getValue());
  }

  /**
   * DELETE /ubicaciones/:id
   * Baja lógica en cascada de la ubicación y todo su subárbol (F3-E2).
   * @throws 404 ubicación inexistente
   */
  @Delete(':id')
  @RequirePermissions('catalogo:gestionar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarUbicacionUseCase.execute({ ubicacionId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
