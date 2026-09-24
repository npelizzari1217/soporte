/**
 * FeriadosController — entry point HTTP del calendario de feriados GLOBALES
 * (master `feriados`, WU2, sdd/feriados-configurables).
 *
 * Rutas:
 *   GET    /feriados      → ListarFeriadosGlobalesUseCase  [cualquier autenticado]
 *   POST   /feriados      → CrearFeriadoGlobalUseCase       [ROOT — GlobalAdminGuard]
 *   PATCH  /feriados/:id  → EditarFeriadoGlobalUseCase       [ROOT — GlobalAdminGuard]
 *   DELETE /feriados/:id  → EliminarFeriadoGlobalUseCase     [ROOT — GlobalAdminGuard]
 *
 * `JwtAuthGuard` a nivel de clase — spec "Authenticated read access":
 * cualquier actor autenticado puede leer, 401 sin token. Los tres endpoints
 * de escritura declaran `GlobalAdminGuard` por método (D5,
 * `ciclos-vigentes.controller.ts:103-121` precedent) — spec "ROOT-only
 * writes, backend-enforced": el chequeo vive en el pipeline HTTP backend,
 * no solo en la visibilidad de la UI.
 *
 * Error → HTTP (D7): `FechaCalendarioInvalidaError` / `FeriadoFechaDuplicadaError`
 * / `FeriadoFechaEsGlobalError` → 422; `FeriadoNoEncontradoError` → 404;
 * `DELETE` exitoso → 204. La validación de forma del DTO (regex/largo) la
 * resuelve el `ValidationPipe` global → 400, antes de llegar al use case.
 *
 * Tarea: 2.3, sdd/feriados-configurables.
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
import { ListarFeriadosGlobalesUseCase } from '../../application/use-cases/listar-feriados-globales.use-case';
import { CrearFeriadoGlobalUseCase } from '../../application/use-cases/crear-feriado-global.use-case';
import { EditarFeriadoGlobalUseCase } from '../../application/use-cases/editar-feriado-global.use-case';
import { EliminarFeriadoGlobalUseCase } from '../../application/use-cases/eliminar-feriado-global.use-case';
import { CreateFeriadoDto, UpdateFeriadoDto, FeriadoResponseDto } from '../dtos/feriado.dto';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { DomainError } from '../../../shared/domain/result';
import { FeriadoNoEncontradoError } from '../../domain/errors/feriados.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';

function toResponseDto(feriado: FeriadoEntity): FeriadoResponseDto {
  return {
    id: feriado.id,
    fecha: feriado.fecha.aClave(),
    descripcion: feriado.descripcion,
  };
}

/** Mapea un `DomainError` de los use cases de feriados globales a la `HttpException` correspondiente (D7). */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof FeriadoNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard)
@Controller('feriados')
export class FeriadosController {
  constructor(
    private readonly listarFeriadosGlobalesUseCase: ListarFeriadosGlobalesUseCase,
    private readonly crearFeriadoGlobalUseCase: CrearFeriadoGlobalUseCase,
    private readonly editarFeriadoGlobalUseCase: EditarFeriadoGlobalUseCase,
    private readonly eliminarFeriadoGlobalUseCase: EliminarFeriadoGlobalUseCase,
  ) {}

  /**
   * GET /feriados
   * Lista el calendario de feriados globales, ordenado por fecha ascendente.
   * Cualquier actor autenticado puede leer (spec "Authenticated read access").
   */
  @Get()
  async listar(): Promise<FeriadoResponseDto[]> {
    const result = await this.listarFeriadosGlobalesUseCase.execute();
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toResponseDto);
  }

  /**
   * POST /feriados
   * Crea un feriado global. Solo ROOT (`is_global_admin`).
   * @returns 201 + FeriadoResponseDto
   * @throws 422 si la fecha es inválida o ya existe un feriado para esa fecha
   */
  @Post()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateFeriadoDto): Promise<FeriadoResponseDto> {
    const result = await this.crearFeriadoGlobalUseCase.execute({
      fecha: dto.fecha,
      descripcion: dto.descripcion,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * PATCH /feriados/:id
   * Edita fecha y descripción de un feriado global (full-replace). Solo ROOT.
   * @returns 200 + FeriadoResponseDto
   * @throws 404 si el feriado no existe
   * @throws 422 si la nueva fecha es inválida o ya existe otro feriado para esa fecha
   */
  @Patch(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateFeriadoDto,
  ): Promise<FeriadoResponseDto> {
    const result = await this.editarFeriadoGlobalUseCase.execute({
      feriadoId: id,
      fecha: dto.fecha,
      descripcion: dto.descripcion,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * DELETE /feriados/:id
   * Da de baja FÍSICA un feriado global (D1: sin soft delete). Solo ROOT.
   * @throws 404 si el feriado no existe
   */
  @Delete(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarFeriadoGlobalUseCase.execute({ feriadoId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
