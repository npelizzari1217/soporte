/**
 * InsumosController — entry point HTTP del catálogo de insumos del tenant.
 *
 * Rutas de escritura (`@UseGuards(AdminClienteGuard)` POR MÉTODO, NUNCA a
 * nivel de clase — un guard sin metadata no se puede anular desde el handler y
 * rompería la lectura abierta de abajo, mismo patrón que
 * `ModelosEquipoController`):
 *   POST  /insumos             → CrearInsumoUseCase
 *   PATCH /insumos/:id         → EditarInsumoUseCase
 *   PATCH /insumos/:id/estado  → CambiarEstadoActivoInsumoUseCase
 *
 * Ruta de lectura (SIN gate — cualquier autenticado del tenant, que necesita
 * el catálogo para elegir un insumo en cualquier otra pantalla):
 *   GET   /insumos             → ListarInsumosUseCase
 *
 * `POST` y `PATCH` llevan la lista COMPLETA de códigos alternativos: el
 * insumo es la raíz del agregado y la lista que llega REEMPLAZA a la guardada.
 * No hay endpoints propios para el código alternativo.
 *
 * Sin `@RequiereAcciones`: el ABM del catálogo se gatea 100% por rol
 * (`AdminClienteGuard`), no por el catálogo `MODULO:ACCION`.
 */
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearInsumoUseCase } from '../../application/use-cases/crear-insumo.use-case';
import { EditarInsumoUseCase } from '../../application/use-cases/editar-insumo.use-case';
import { CambiarEstadoActivoInsumoUseCase } from '../../application/use-cases/cambiar-estado-activo-insumo.use-case';
import { ListarInsumosUseCase } from '../../application/use-cases/listar-insumos.use-case';
import { DomainError } from '../../../shared/domain/result';
import {
  CondicionUsadoNoAdmitidaError,
  InsumoNoEncontradoError,
  SecuenciaCodigoInsumoAgotadaError,
} from '../../domain/errors/insumos.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import {
  CambiarEstadoActivoInsumoDto,
  CreateInsumoDto,
  EditInsumoDto,
  InsumoResponseDto,
  ListarInsumosQueryDto,
  toInsumoResponseDto,
} from '../dtos/insumos.dto';

/**
 * Mapea un `DomainError` de insumos a la `HttpException` de presentación.
 *
 * Solo el insumo inexistente es un 404. La familia o la unidad deshabilitada
 * NO lo son: sus filas existen y el administrador las ve en su propio listado,
 * así que un "no encontrado" lo mandaría a buscar un problema que no está.
 *
 * `SecuenciaCodigoInsumoAgotadaError` (issue #162) es 409, no 422: es una
 * precondición de infraestructura de negocio —la serie de códigos
 * autogenerados se agotó—, no un error de carga del usuario sobre un campo
 * del body. Mismo criterio que `SecuenciaAgotadaError` (tickets) y
 * `NumeradorCompraAgotadoError` (compras).
 *
 * @param error Error de dominio devuelto por un use case.
 * @returns 404 si el insumo no existe; 409 si la serie de códigos se agotó; 422 para el resto, incluida la condición USADO no admitida.
 */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (error instanceof InsumoNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof SecuenciaCodigoInsumoAgotadaError) {
    return new ConflictException(error.message);
  }
  // Explícito aunque coincida con el default: USADO en un insumo que no es
  // repuesto es una regla de negocio (422), y el mapeo no debe depender de que
  // el default siga siendo 422.
  if (error instanceof CondicionUsadoNoAdmitidaError) {
    return new UnprocessableEntityException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('insumos')
export class InsumosController {
  constructor(
    private readonly crearInsumoUseCase: CrearInsumoUseCase,
    private readonly editarInsumoUseCase: EditarInsumoUseCase,
    private readonly cambiarEstadoActivoInsumoUseCase: CambiarEstadoActivoInsumoUseCase,
    private readonly listarInsumosUseCase: ListarInsumosUseCase,
  ) {}

  /**
   * GET /insumos — catálogo vigente (habilitados y deshabilitados), SIN gate.
   *
   * `esRepuesto` filtra por familia (WU-2, sdd/repuestos-seccion); ausente
   * trae TODOS. `soloVinculables` (WU-3, sdd/repuestos-vinculo-componente)
   * restringe a los insumos vinculables; ausente no aplica ese filtro. Ver el
   * JSDoc de `ListarInsumosUseCase.execute`.
   *
   * @param query Filtros opcionales `esRepuesto` y `soloVinculables`.
   * @returns Los insumos vigentes del tenant, con sus códigos alternativos.
   */
  @Get()
  async listar(@Query() query: ListarInsumosQueryDto): Promise<InsumoResponseDto[]> {
    const insumos = await this.listarInsumosUseCase.execute(
      query.esRepuesto,
      query.soloVinculables,
    );
    return insumos.map(toInsumoResponseDto);
  }

  /**
   * POST /insumos
   *
   * @param dto Datos del insumo, con su lista completa de códigos alternativos.
   * @returns El insumo creado.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 422 código duplicado, familia o unidad no elegible, código alternativo duplicado
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateInsumoDto): Promise<InsumoResponseDto> {
    const result = await this.crearInsumoUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toInsumoResponseDto(result.getValue());
  }

  /**
   * PATCH /insumos/:id
   *
   * @param id Id del insumo a editar.
   * @param dto Campos a modificar (PATCH parcial).
   * @returns El insumo editado.
   * @throws 400 id mal formado
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 insumo inexistente
   * @throws 422 código duplicado, familia o unidad no elegible, código alternativo duplicado
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EditInsumoDto,
  ): Promise<InsumoResponseDto> {
    const result = await this.editarInsumoUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toInsumoResponseDto(result.getValue());
  }

  /**
   * PATCH /insumos/:id/estado — habilita/deshabilita.
   *
   * @param id Id del insumo.
   * @param dto Estado deseado.
   * @returns El insumo con su nuevo estado.
   * @throws 400 id mal formado
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 insumo inexistente
   */
  @Patch(':id/estado')
  @UseGuards(AdminClienteGuard)
  async cambiarEstadoActivo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CambiarEstadoActivoInsumoDto,
  ): Promise<InsumoResponseDto> {
    const result = await this.cambiarEstadoActivoInsumoUseCase.execute({
      id,
      activo: dto.activo,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toInsumoResponseDto(result.getValue());
  }
}
