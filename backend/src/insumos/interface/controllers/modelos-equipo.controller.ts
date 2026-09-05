/**
 * ModelosEquipoController — entry point HTTP del catálogo de modelos de
 * equipo.
 *
 * Rutas de escritura (`@UseGuards(AdminClienteGuard)` POR MÉTODO, NUNCA a
 * nivel de clase — un guard sin metadata no se puede anular desde el handler y
 * rompería la lectura abierta de abajo, mismo patrón que `SectoresController`):
 *   POST  /modelos-equipo             → CrearModeloEquipoUseCase
 *   PATCH /modelos-equipo/:id         → EditarModeloEquipoUseCase
 *   PATCH /modelos-equipo/:id/estado  → CambiarEstadoActivoModeloEquipoUseCase
 *
 * Ruta de lectura (SIN gate — cualquier autenticado del tenant, que necesita
 * el catálogo para elegir el modelo de un equipo y consultar compatibilidad):
 *   GET   /modelos-equipo             → ListarModelosEquipoUseCase
 *
 * Sin `@RequiereAcciones`: el ABM del catálogo se gatea 100% por rol
 * (`AdminClienteGuard`), no por el catálogo `MODULO:ACCION`.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearModeloEquipoUseCase } from '../../application/use-cases/crear-modelo-equipo.use-case';
import { EditarModeloEquipoUseCase } from '../../application/use-cases/editar-modelo-equipo.use-case';
import { CambiarEstadoActivoModeloEquipoUseCase } from '../../application/use-cases/cambiar-estado-activo-modelo-equipo.use-case';
import { ListarModelosEquipoUseCase } from '../../application/use-cases/listar-modelos-equipo.use-case';
import { DomainError } from '../../../shared/domain/result';
import { ModeloEquipoNoEncontradoError } from '../../domain/errors/modelos-equipo.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import {
  CreateModeloEquipoDto,
  EditModeloEquipoDto,
  CambiarEstadoActivoModeloEquipoDto,
  ModeloEquipoResponseDto,
  toModeloEquipoResponseDto,
} from '../dtos/modelos-equipo.dto';

/**
 * Mapea un `DomainError` de modelos de equipo a la `HttpException` de
 * presentación.
 *
 * @param error Error de dominio devuelto por un use case.
 * @returns 404 si el modelo no existe; 422 para el resto (par duplicado).
 */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof ModeloEquipoNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('modelos-equipo')
export class ModelosEquipoController {
  constructor(
    private readonly crearModeloEquipoUseCase: CrearModeloEquipoUseCase,
    private readonly editarModeloEquipoUseCase: EditarModeloEquipoUseCase,
    private readonly cambiarEstadoActivoModeloEquipoUseCase: CambiarEstadoActivoModeloEquipoUseCase,
    private readonly listarModelosEquipoUseCase: ListarModelosEquipoUseCase,
  ) {}

  /**
   * GET /modelos-equipo — catálogo activo, SIN gate.
   *
   * @returns Los modelos vigentes del tenant.
   */
  @Get()
  async listar(): Promise<ModeloEquipoResponseDto[]> {
    const modelos = await this.listarModelosEquipoUseCase.execute();
    return modelos.map(toModeloEquipoResponseDto);
  }

  /**
   * POST /modelos-equipo
   *
   * @param dto Marca y modelo.
   * @returns El modelo creado.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 422 par marca+modelo duplicado
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateModeloEquipoDto): Promise<ModeloEquipoResponseDto> {
    const result = await this.crearModeloEquipoUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toModeloEquipoResponseDto(result.getValue());
  }

  /**
   * PATCH /modelos-equipo/:id
   *
   * @param id Id del modelo a editar.
   * @param dto Campos a modificar (PATCH parcial).
   * @returns El modelo editado.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 modelo inexistente
   * @throws 422 par marca+modelo duplicado (si alguna mitad cambia)
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EditModeloEquipoDto,
  ): Promise<ModeloEquipoResponseDto> {
    const result = await this.editarModeloEquipoUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toModeloEquipoResponseDto(result.getValue());
  }

  /**
   * PATCH /modelos-equipo/:id/estado — activa/desactiva.
   *
   * @param id Id del modelo.
   * @param dto Estado deseado.
   * @returns El modelo con su nuevo estado.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 modelo inexistente
   */
  @Patch(':id/estado')
  @UseGuards(AdminClienteGuard)
  async cambiarEstadoActivo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CambiarEstadoActivoModeloEquipoDto,
  ): Promise<ModeloEquipoResponseDto> {
    const result = await this.cambiarEstadoActivoModeloEquipoUseCase.execute({
      id,
      activo: dto.activo,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toModeloEquipoResponseDto(result.getValue());
  }
}
