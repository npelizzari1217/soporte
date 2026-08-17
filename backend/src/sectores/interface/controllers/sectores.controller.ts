/**
 * SectoresController — entry point HTTP del catálogo de sectores (WU-07,
 * sdd/compras-tres-etapas-y-sectores/spec R10).
 *
 * Rutas de escritura (`@UseGuards(AdminClienteGuard)` POR MÉTODO, NUNCA a
 * nivel de clase — un guard sin metadata no se puede anular desde el
 * handler y rompería la lectura abierta de abajo, mismo patrón que
 * `CatalogosController`):
 *   POST  /sectores             → CrearSectorUseCase
 *   PATCH /sectores/:id         → EditarSectorUseCase
 *   PATCH /sectores/:id/estado  → CambiarEstadoActivoSectorUseCase
 *
 * Ruta de lectura (SIN gate — cualquier autenticado del tenant, S65):
 *   GET   /sectores             → ListarSectoresUseCase
 *
 * Sin `@RequiereAcciones`: el ABM de sectores se gatea 100% por rol
 * (`AdminClienteGuard`), no por el catálogo `MODULO:ACCION` — no se agrega
 * ninguna acción nueva (spec, fuera de alcance).
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R10, S63-S65.
 */
import {
  Body,
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
import { CrearSectorUseCase } from '../../application/use-cases/crear-sector.use-case';
import { EditarSectorUseCase } from '../../application/use-cases/editar-sector.use-case';
import { CambiarEstadoActivoSectorUseCase } from '../../application/use-cases/cambiar-estado-activo-sector.use-case';
import { ListarSectoresUseCase } from '../../application/use-cases/listar-sectores.use-case';
import { DomainError } from '../../../shared/domain/result';
import {
  SectorNoEncontradoError,
  SectorCodigoDuplicadoError,
} from '../../domain/errors/sectores.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import {
  CreateSectorDto,
  EditSectorDto,
  CambiarEstadoActivoSectorDto,
  SectorResponseDto,
  toSectorResponseDto,
} from '../dtos/sectores.dto';

/** Mapea un `DomainError` de sectores a la `HttpException` de presentación. */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof SectorNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof SectorCodigoDuplicadoError) {
    return new UnprocessableEntityException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('sectores')
export class SectoresController {
  constructor(
    private readonly crearSectorUseCase: CrearSectorUseCase,
    private readonly editarSectorUseCase: EditarSectorUseCase,
    private readonly cambiarEstadoActivoSectorUseCase: CambiarEstadoActivoSectorUseCase,
    private readonly listarSectoresUseCase: ListarSectoresUseCase,
  ) {}

  /** GET /sectores — catálogo activo, SIN gate (S65). */
  @Get()
  async listar(): Promise<SectorResponseDto[]> {
    const sectores = await this.listarSectoresUseCase.execute();
    return sectores.map(toSectorResponseDto);
  }

  /**
   * POST /sectores
   * @throws 403 sin rol ADMINISTRADOR (S64)
   * @throws 422 codigo duplicado
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateSectorDto): Promise<SectorResponseDto> {
    const result = await this.crearSectorUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSectorResponseDto(result.getValue());
  }

  /**
   * PATCH /sectores/:id
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 sector inexistente
   * @throws 422 codigo duplicado (si `codigo` cambia)
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(@Param('id') id: string, @Body() dto: EditSectorDto): Promise<SectorResponseDto> {
    const result = await this.editarSectorUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSectorResponseDto(result.getValue());
  }

  /**
   * PATCH /sectores/:id/estado — activa/desactiva.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 sector inexistente
   */
  @Patch(':id/estado')
  @UseGuards(AdminClienteGuard)
  async cambiarEstadoActivo(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoActivoSectorDto,
  ): Promise<SectorResponseDto> {
    const result = await this.cambiarEstadoActivoSectorUseCase.execute({ id, activo: dto.activo });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSectorResponseDto(result.getValue());
  }
}
