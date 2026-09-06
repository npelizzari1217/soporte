/**
 * UnidadesMedidaController — entry point HTTP del catálogo de unidades de
 * medida.
 *
 * Rutas de escritura (`@UseGuards(AdminClienteGuard)` POR MÉTODO, NUNCA a
 * nivel de clase — un guard sin metadata no se puede anular desde el handler y
 * rompería la lectura abierta de abajo, mismo patrón que `SectoresController`):
 *   POST  /unidades-medida             → CrearUnidadMedidaUseCase
 *   PATCH /unidades-medida/:id         → EditarUnidadMedidaUseCase
 *   PATCH /unidades-medida/:id/estado  → CambiarEstadoActivoUnidadMedidaUseCase
 *
 * Ruta de lectura (SIN gate — cualquier autenticado del tenant, que necesita
 * el catálogo para cargar y consultar insumos):
 *   GET   /unidades-medida             → ListarUnidadesMedidaUseCase
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
import { CrearUnidadMedidaUseCase } from '../../application/use-cases/crear-unidad-medida.use-case';
import { EditarUnidadMedidaUseCase } from '../../application/use-cases/editar-unidad-medida.use-case';
import { CambiarEstadoActivoUnidadMedidaUseCase } from '../../application/use-cases/cambiar-estado-activo-unidad-medida.use-case';
import { ListarUnidadesMedidaUseCase } from '../../application/use-cases/listar-unidades-medida.use-case';
import { DomainError } from '../../../shared/domain/result';
import { UnidadMedidaNoEncontradaError } from '../../domain/errors/unidades-medida.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import {
  CreateUnidadMedidaDto,
  EditUnidadMedidaDto,
  CambiarEstadoActivoUnidadMedidaDto,
  UnidadMedidaResponseDto,
  toUnidadMedidaResponseDto,
} from '../dtos/unidades-medida.dto';

/**
 * Mapea un `DomainError` de unidades de medida a la `HttpException` de
 * presentación.
 *
 * @param error Error de dominio devuelto por un use case.
 * @returns 404 si la unidad no existe; 422 para el resto (código duplicado).
 */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof UnidadMedidaNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('unidades-medida')
export class UnidadesMedidaController {
  constructor(
    private readonly crearUnidadMedidaUseCase: CrearUnidadMedidaUseCase,
    private readonly editarUnidadMedidaUseCase: EditarUnidadMedidaUseCase,
    private readonly cambiarEstadoActivoUnidadMedidaUseCase: CambiarEstadoActivoUnidadMedidaUseCase,
    private readonly listarUnidadesMedidaUseCase: ListarUnidadesMedidaUseCase,
  ) {}

  /**
   * GET /unidades-medida — catálogo activo, SIN gate.
   *
   * @returns Las unidades vigentes del tenant.
   */
  @Get()
  async listar(): Promise<UnidadMedidaResponseDto[]> {
    const unidades = await this.listarUnidadesMedidaUseCase.execute();
    return unidades.map(toUnidadMedidaResponseDto);
  }

  /**
   * POST /unidades-medida
   *
   * @param dto Código y nombre de la unidad.
   * @returns La unidad creada.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 422 codigo duplicado
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateUnidadMedidaDto): Promise<UnidadMedidaResponseDto> {
    const result = await this.crearUnidadMedidaUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUnidadMedidaResponseDto(result.getValue());
  }

  /**
   * PATCH /unidades-medida/:id
   *
   * @param id Id de la unidad a editar.
   * @param dto Campos a modificar (PATCH parcial).
   * @returns La unidad editada.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 unidad inexistente
   * @throws 422 codigo duplicado (si `codigo` cambia)
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EditUnidadMedidaDto,
  ): Promise<UnidadMedidaResponseDto> {
    const result = await this.editarUnidadMedidaUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUnidadMedidaResponseDto(result.getValue());
  }

  /**
   * PATCH /unidades-medida/:id/estado — activa/desactiva.
   *
   * @param id Id de la unidad.
   * @param dto Estado deseado.
   * @returns La unidad con su nuevo estado.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 unidad inexistente
   */
  @Patch(':id/estado')
  @UseGuards(AdminClienteGuard)
  async cambiarEstadoActivo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CambiarEstadoActivoUnidadMedidaDto,
  ): Promise<UnidadMedidaResponseDto> {
    const result = await this.cambiarEstadoActivoUnidadMedidaUseCase.execute({
      id,
      activo: dto.activo,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUnidadMedidaResponseDto(result.getValue());
  }
}
