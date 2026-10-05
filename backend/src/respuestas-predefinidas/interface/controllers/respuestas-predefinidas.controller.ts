/**
 * RespuestasPredefinidasController — entry point HTTP del catálogo de respuestas predefinidas
 * de soporte (roadmap segunda etapa, punto 4; issue #368).
 *
 * Escritura (`@UseGuards(AdminClienteGuard)` POR MÉTODO, NUNCA a nivel de clase — mismo
 * patrón que `SectoresController`):
 *   POST  /respuestas-predefinidas             → CrearRespuestaPredefinidaUseCase
 *   PATCH /respuestas-predefinidas/:id         → EditarRespuestaPredefinidaUseCase
 *   PATCH /respuestas-predefinidas/:id/estado  → CambiarEstadoActivoRespuestaPredefinidaUseCase
 *
 * Lectura (SIN gate — cualquier autenticado del tenant; el selector del comentario la usa con
 * `?activas=true`, el ABM sin filtro para poder reactivar):
 *   GET   /respuestas-predefinidas[?activas=true]
 *
 * Sin `@RequiereAcciones`: se gatea por rol, no se agrega ninguna acción `MODULO:ACCION`.
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
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearRespuestaPredefinidaUseCase } from '../../application/use-cases/crear-respuesta-predefinida.use-case';
import { EditarRespuestaPredefinidaUseCase } from '../../application/use-cases/editar-respuesta-predefinida.use-case';
import { CambiarEstadoActivoRespuestaPredefinidaUseCase } from '../../application/use-cases/cambiar-estado-activo-respuesta-predefinida.use-case';
import { ListarRespuestasPredefinidasUseCase } from '../../application/use-cases/listar-respuestas-predefinidas.use-case';
import { DomainError } from '../../../shared/domain/result';
import { RespuestaPredefinidaNoEncontradaError } from '../../domain/errors/respuestas-predefinidas.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import {
  CambiarEstadoActivoRespuestaPredefinidaDto,
  CreateRespuestaPredefinidaDto,
  EditRespuestaPredefinidaDto,
  ListarRespuestasPredefinidasQueryDto,
  RespuestaPredefinidaResponseDto,
  toRespuestaPredefinidaResponseDto,
} from '../dtos/respuestas-predefinidas.dto';

/** Mapea un `DomainError` del catálogo a la `HttpException` de presentación. */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof RespuestaPredefinidaNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('respuestas-predefinidas')
export class RespuestasPredefinidasController {
  constructor(
    private readonly crearUseCase: CrearRespuestaPredefinidaUseCase,
    private readonly editarUseCase: EditarRespuestaPredefinidaUseCase,
    private readonly cambiarEstadoActivoUseCase: CambiarEstadoActivoRespuestaPredefinidaUseCase,
    private readonly listarUseCase: ListarRespuestasPredefinidasUseCase,
  ) {}

  /** GET /respuestas-predefinidas — SIN gate. `?activas=true` omite las desactivadas. */
  @Get()
  async listar(
    @Query() query: ListarRespuestasPredefinidasQueryDto,
  ): Promise<RespuestaPredefinidaResponseDto[]> {
    const respuestas = await this.listarUseCase.execute(query.activas === true);
    return respuestas.map(toRespuestaPredefinidaResponseDto);
  }

  /**
   * POST /respuestas-predefinidas
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 422 título duplicado
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CreateRespuestaPredefinidaDto,
  ): Promise<RespuestaPredefinidaResponseDto> {
    const result = await this.crearUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toRespuestaPredefinidaResponseDto(result.getValue());
  }

  /**
   * PATCH /respuestas-predefinidas/:id
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 inexistente
   * @throws 422 título duplicado (si `titulo` cambia)
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(
    @Param('id') id: string,
    @Body() dto: EditRespuestaPredefinidaDto,
  ): Promise<RespuestaPredefinidaResponseDto> {
    const result = await this.editarUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toRespuestaPredefinidaResponseDto(result.getValue());
  }

  /**
   * PATCH /respuestas-predefinidas/:id/estado — activa/desactiva.
   * @throws 403 sin rol ADMINISTRADOR
   * @throws 404 inexistente
   */
  @Patch(':id/estado')
  @UseGuards(AdminClienteGuard)
  async cambiarEstadoActivo(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoActivoRespuestaPredefinidaDto,
  ): Promise<RespuestaPredefinidaResponseDto> {
    const result = await this.cambiarEstadoActivoUseCase.execute({ id, activo: dto.activo });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toRespuestaPredefinidaResponseDto(result.getValue());
  }
}
