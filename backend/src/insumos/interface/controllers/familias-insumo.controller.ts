/**
 * FamiliasInsumoController — entry point HTTP del catálogo de familias de
 * insumo.
 *
 * Rutas de escritura (`@UseGuards(AdminClienteGuard)` POR MÉTODO, NUNCA a
 * nivel de clase — un guard sin metadata no se puede anular desde el handler y
 * rompería la lectura abierta de abajo, mismo patrón que `SectoresController`):
 *   POST  /familias-insumo             → CrearFamiliaInsumoUseCase
 *   PATCH /familias-insumo/:id         → EditarFamiliaInsumoUseCase
 *   PATCH /familias-insumo/:id/estado  → CambiarEstadoActivoFamiliaInsumoUseCase
 *
 * Ruta de lectura (SIN gate — cualquier autenticado del tenant, que necesita
 * el catálogo para clasificar y buscar insumos):
 *   GET   /familias-insumo             → ListarFamiliasInsumoUseCase
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
import { CrearFamiliaInsumoUseCase } from '../../application/use-cases/crear-familia-insumo.use-case';
import { EditarFamiliaInsumoUseCase } from '../../application/use-cases/editar-familia-insumo.use-case';
import { CambiarEstadoActivoFamiliaInsumoUseCase } from '../../application/use-cases/cambiar-estado-activo-familia-insumo.use-case';
import { ListarFamiliasInsumoUseCase } from '../../application/use-cases/listar-familias-insumo.use-case';
import { DomainError } from '../../../shared/domain/result';
import { FamiliaInsumoNoEncontradaError } from '../../domain/errors/familias-insumo.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import {
  CreateFamiliaInsumoDto,
  EditFamiliaInsumoDto,
  CambiarEstadoActivoFamiliaInsumoDto,
  FamiliaInsumoResponseDto,
  toFamiliaInsumoResponseDto,
} from '../dtos/familias-insumo.dto';

/**
 * Mapea un `DomainError` de familias de insumo a la `HttpException` de
 * presentación.
 *
 * @param error Error de dominio devuelto por un use case.
 * @returns 404 si la familia no existe; 422 para el resto (código duplicado).
 */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof FamiliaInsumoNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('familias-insumo')
export class FamiliasInsumoController {
  constructor(
    private readonly crearFamiliaInsumoUseCase: CrearFamiliaInsumoUseCase,
    private readonly editarFamiliaInsumoUseCase: EditarFamiliaInsumoUseCase,
    private readonly cambiarEstadoActivoFamiliaInsumoUseCase: CambiarEstadoActivoFamiliaInsumoUseCase,
    private readonly listarFamiliasInsumoUseCase: ListarFamiliasInsumoUseCase,
  ) {}

  /**
   * GET /familias-insumo — catálogo activo, SIN gate.
   *
   * @returns Las familias vigentes del tenant.
   */
  @Get()
  async listar(): Promise<FamiliaInsumoResponseDto[]> {
    const familias = await this.listarFamiliasInsumoUseCase.execute();
    return familias.map(toFamiliaInsumoResponseDto);
  }

  /**
   * POST /familias-insumo
   *
   * @param dto Código y nombre de la familia.
   * @returns La familia creada.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 422 codigo duplicado
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateFamiliaInsumoDto): Promise<FamiliaInsumoResponseDto> {
    const result = await this.crearFamiliaInsumoUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toFamiliaInsumoResponseDto(result.getValue());
  }

  /**
   * PATCH /familias-insumo/:id
   *
   * @param id Id de la familia a editar.
   * @param dto Campos a modificar (PATCH parcial).
   * @returns La familia editada.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 familia inexistente
   * @throws 422 codigo duplicado (si `codigo` cambia)
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EditFamiliaInsumoDto,
  ): Promise<FamiliaInsumoResponseDto> {
    const result = await this.editarFamiliaInsumoUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toFamiliaInsumoResponseDto(result.getValue());
  }

  /**
   * PATCH /familias-insumo/:id/estado — activa/desactiva.
   *
   * @param id Id de la familia.
   * @param dto Estado deseado.
   * @returns La familia con su nuevo estado.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 familia inexistente
   */
  @Patch(':id/estado')
  @UseGuards(AdminClienteGuard)
  async cambiarEstadoActivo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CambiarEstadoActivoFamiliaInsumoDto,
  ): Promise<FamiliaInsumoResponseDto> {
    const result = await this.cambiarEstadoActivoFamiliaInsumoUseCase.execute({
      id,
      activo: dto.activo,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toFamiliaInsumoResponseDto(result.getValue());
  }
}
