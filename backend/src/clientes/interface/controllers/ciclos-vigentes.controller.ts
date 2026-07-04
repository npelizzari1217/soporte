import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { ListarCiclosVigentesUseCase } from '../../application/use-cases/listar-ciclos-vigentes.use-case';
import { EditarCicloVigenteUseCase } from '../../application/use-cases/editar-ciclo-vigente.use-case';
import { DesactivarCicloVigenteUseCase } from '../../application/use-cases/desactivar-ciclo-vigente.use-case';
import { CreateCicloVigenteDto } from '../dtos/create-ciclo-vigente.dto';
import { UpdateCicloVigenteDto } from '../dtos/update-ciclo-vigente.dto';
import { CicloVigenteResponseDto } from '../dtos/ciclo-vigente-response.dto';
import {
  CicloVigenteOverlapError,
  CicloVigenteInvalidDatesError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';

/**
 * CiclosVigentesController — entry point HTTP para el CATÁLOGO GLOBAL de ciclos.
 *
 * Rutas:
 *   POST   /ciclos-vigentes     → crear nuevo ciclo del catálogo global
 *   GET    /ciclos-vigentes     → listar el catálogo global (no soft-deleted)
 *   PATCH  /ciclos-vigentes/:id → editar un ciclo (ADR-2: no propaga a ciclos_cliente)
 *   DELETE /ciclos-vigentes/:id → baja lógica (soft-delete, ADR-1: NUNCA baja física)
 *
 * Seguridad:
 * - @UseGuards(JwtAuthGuard) a nivel de controlador — todos los endpoints requieren JWT válido.
 * - @UseGuards(GlobalAdminGuard) en TODOS los métodos — el catálogo global SOLO lo gestiona
 *   el operador global (is_global_admin). Sin este guard, cualquier usuario autenticado de
 *   cualquier tenant podía leer/escribir el catálogo compartido (agujero de seguridad).
 *
 * Tarea: 1.D.2 / T1.6 / T2.7
 */
@UseGuards(JwtAuthGuard)
@Controller('ciclos-vigentes')
export class CiclosVigentesController {
  constructor(
    private readonly crearCicloVigenteUseCase: CrearCicloVigenteUseCase,
    private readonly listarCiclosVigentesUseCase: ListarCiclosVigentesUseCase,
    private readonly editarCicloVigenteUseCase: EditarCicloVigenteUseCase,
    private readonly desactivarCicloVigenteUseCase: DesactivarCicloVigenteUseCase,
  ) {}

  /**
   * POST /ciclos-vigentes
   * Crea un nuevo ciclo en el catálogo global. Solo operador global.
   * @returns 201 + CicloVigenteResponseDto
   * @throws 422 UnprocessableEntityException si hay solapamiento de fechas
   */
  @Post()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCicloVigenteDto): Promise<CicloVigenteResponseDto> {
    const result = await this.crearCicloVigenteUseCase.execute({
      nombre: dto.nombre,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin: new Date(dto.fechaFin),
      activo: dto.activo ?? true,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CicloVigenteOverlapError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('Error al crear el ciclo vigente.');
    }

    return CicloVigenteResponseDto.fromEntity(result.getValue());
  }

  /**
   * GET /ciclos-vigentes
   * Lista el catálogo global de ciclos vigentes (no soft-deleted). Solo operador global.
   * @returns 200 + CicloVigenteResponseDto[]
   */
  @Get()
  @UseGuards(GlobalAdminGuard)
  async listar(): Promise<CicloVigenteResponseDto[]> {
    const ciclos = await this.listarCiclosVigentesUseCase.execute();
    return ciclos.map((ciclo) => CicloVigenteResponseDto.fromEntity(ciclo));
  }

  /**
   * PATCH /ciclos-vigentes/:id
   * Edita un ciclo del catálogo global. ADR-2: NO propaga a ciclos_cliente ya elegidos.
   * Solo operador global.
   * @returns 200 + CicloVigenteResponseDto
   * @throws 404 NotFoundException si el id no existe
   * @throws 422 UnprocessableEntityException si las fechas son inválidas o solapan
   */
  @Patch(':id')
  @UseGuards(GlobalAdminGuard)
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateCicloVigenteDto,
  ): Promise<CicloVigenteResponseDto> {
    const result = await this.editarCicloVigenteUseCase.execute(id, dto);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CicloVigenteNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof CicloVigenteInvalidDatesError ||
        error instanceof CicloVigenteOverlapError
      ) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('Error al editar el ciclo vigente.');
    }

    return CicloVigenteResponseDto.fromEntity(result.getValue());
  }

  /**
   * DELETE /ciclos-vigentes/:id
   * Baja lógica (soft-delete) de un ciclo del catálogo global. ADR-1: NUNCA baja física.
   * Solo operador global.
   * @returns 204 sin body
   * @throws 404 NotFoundException si el id no existe
   */
  @Delete(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async desactivar(@Param('id') id: string): Promise<void> {
    const result = await this.desactivarCicloVigenteUseCase.execute(id);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CicloVigenteNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw new UnprocessableEntityException('Error al desactivar el ciclo vigente.');
    }
  }
}
