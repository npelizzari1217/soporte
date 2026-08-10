/**
 * TiposComponenteController — entry point HTTP para el CATÁLOGO GLOBAL de
 * tipos de componente (`master.tipos_componente`).
 *
 * Rutas (TODAS exclusivas de ROOT — `GlobalAdminGuard`, mismo criterio que
 * `CicloVigenteController` en sus rutas ROOT: un ROOT recién logueado puede
 * no tener `cliente_id` en el JWT, por eso NO pasan por `TenantGuard`):
 *   POST   /tipos-componente             → CrearTipoComponenteUseCase
 *   GET    /tipos-componente/admin       → ListarTiposComponenteAdminUseCase
 *   PATCH  /tipos-componente/:id         → RenombrarTipoComponenteUseCase (solo `nombre`, `codigo` inmutable)
 *   POST   /tipos-componente/:id/activar → ActivarTipoComponenteUseCase
 *   POST   /tipos-componente/:id/desactivar → DesactivarTipoComponenteUseCase
 *
 * `JwtAuthGuard` a nivel clase (compartido); `GlobalAdminGuard` por método
 * (todas las rutas de este PR2 son ROOT-only — a diferencia de
 * `CicloVigenteController` que también expone `GET` para el tenant, este
 * catálogo no tiene endpoint de lectura para el tenant todavía).
 *
 * Tarea: sdd/tipos-componente-master (PR2 — ABM del catálogo maestro).
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
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearTipoComponenteUseCase } from '../../application/use-cases/crear-tipo-componente.use-case';
import { RenombrarTipoComponenteUseCase } from '../../application/use-cases/renombrar-tipo-componente.use-case';
import { DesactivarTipoComponenteUseCase } from '../../application/use-cases/desactivar-tipo-componente.use-case';
import { ActivarTipoComponenteUseCase } from '../../application/use-cases/activar-tipo-componente.use-case';
import { ListarTiposComponenteAdminUseCase } from '../../application/use-cases/listar-tipos-componente-admin.use-case';
import {
  CrearTipoComponenteDto,
  RenombrarTipoComponenteDto,
  TipoComponenteResponseDto,
} from '../dtos/tipos-componente.dto';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import { DomainError } from '../../../shared/domain/result';
import {
  CodigoTipoComponenteDuplicadoError,
  TipoComponenteNotFoundError,
} from '../../domain/errors/tipos-componente.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';

function toResponseDto(tipo: TipoComponente): TipoComponenteResponseDto {
  return { id: tipo.id, codigo: tipo.codigo, nombre: tipo.nombre, activo: tipo.activo };
}

/** Mapea un `DomainError` de este catálogo a la `HttpException` correspondiente. */
function toHttpException(
  error: DomainError,
): ConflictException | NotFoundException | UnprocessableEntityException {
  if (error instanceof CodigoTipoComponenteDuplicadoError) {
    return new ConflictException(error.message);
  }
  if (error instanceof TipoComponenteNotFoundError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard)
@Controller('tipos-componente')
export class TiposComponenteController {
  constructor(
    private readonly crearTipoComponenteUseCase: CrearTipoComponenteUseCase,
    private readonly renombrarTipoComponenteUseCase: RenombrarTipoComponenteUseCase,
    private readonly desactivarTipoComponenteUseCase: DesactivarTipoComponenteUseCase,
    private readonly activarTipoComponenteUseCase: ActivarTipoComponenteUseCase,
    private readonly listarTiposComponenteAdminUseCase: ListarTiposComponenteAdminUseCase,
  ) {}

  /**
   * POST /tipos-componente
   * Crea un nuevo tipo de componente en el catálogo global. Solo ROOT.
   * @returns 201 + TipoComponenteResponseDto
   * @throws 409 ConflictException si el código ya existe
   * @throws 422 UnprocessableEntityException si el código normalizado queda vacío
   */
  @Post()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CrearTipoComponenteDto): Promise<TipoComponenteResponseDto> {
    const result = await this.crearTipoComponenteUseCase.execute({
      codigo: dto.codigo,
      nombre: dto.nombre,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * GET /tipos-componente/admin
   * Lista TODOS los tipos de componente del catálogo global (incluye
   * inactivos) para la pantalla ABM de ROOT. Solo ROOT.
   */
  @Get('admin')
  @UseGuards(GlobalAdminGuard)
  async listarAdmin(): Promise<TipoComponenteResponseDto[]> {
    const tipos = await this.listarTiposComponenteAdminUseCase.execute();
    return tipos.map(toResponseDto);
  }

  /**
   * PATCH /tipos-componente/:id
   * Renombra un tipo de componente del catálogo global. `codigo` es
   * inmutable — el DTO solo acepta `nombre`. Solo ROOT.
   * @returns 200 + TipoComponenteResponseDto
   * @throws 404 NotFoundException si el tipo no existe
   */
  @Patch(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  async renombrar(
    @Param('id') id: string,
    @Body() dto: RenombrarTipoComponenteDto,
  ): Promise<TipoComponenteResponseDto> {
    const result = await this.renombrarTipoComponenteUseCase.execute({
      id,
      nombre: dto.nombre,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * POST /tipos-componente/:id/activar
   * Reactiva un tipo de componente del catálogo global. Solo ROOT.
   * @throws 404 NotFoundException si el tipo no existe
   */
  @Post(':id/activar')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  async activar(@Param('id') id: string): Promise<TipoComponenteResponseDto> {
    const result = await this.activarTipoComponenteUseCase.execute({ id });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * POST /tipos-componente/:id/desactivar
   * Da de baja lógica un tipo de componente del catálogo global. Solo ROOT.
   * @throws 404 NotFoundException si el tipo no existe
   */
  @Post(':id/desactivar')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  async desactivar(@Param('id') id: string): Promise<TipoComponenteResponseDto> {
    const result = await this.desactivarTipoComponenteUseCase.execute({ id });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }
}
