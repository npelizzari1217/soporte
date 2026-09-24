/**
 * FeriadosClienteController — entry point HTTP del calendario de feriados
 * propios del TENANT (`feriados_cliente`, WU4b, sdd/feriados-configurables).
 *
 * Rutas:
 *   GET    /feriados-cliente      → ListarFeriadosClienteUseCase  [cualquier autenticado del tenant]
 *   POST   /feriados-cliente      → CrearFeriadoClienteUseCase     [ADMINISTRADOR/ROOT — AdminClienteGuard]
 *   PATCH  /feriados-cliente/:id  → EditarFeriadoClienteUseCase     [ADMINISTRADOR/ROOT — AdminClienteGuard]
 *   DELETE /feriados-cliente/:id  → EliminarFeriadoClienteUseCase   [ADMINISTRADOR/ROOT — AdminClienteGuard]
 *
 * `JwtAuthGuard, TenantGuard` a nivel de clase (D5, `catalogos.controller.ts:94`):
 * `TenantGuard` resuelve el tenant desde el JWT y liga `TenantContext`. Los
 * tres endpoints de escritura declaran `AdminClienteGuard` POR MÉTODO, nunca
 * a nivel de clase (ADR-P5 — un guard sin metadata no se puede anular desde
 * el handler, y a nivel de clase rompería la lectura abierta de `GET`).
 *
 * Aislación cross-tenant (D6): NINGÚN chequeo inline de `clienteId` — no hay
 * tal campo en la ruta. `PrismaFeriadoClienteRepository` solo lee/escribe la
 * DB del tenant ligado por `TenantContext`; un `:id` de otro cliente
 * simplemente no existe ahí → 404, nunca la fila de otro cliente. La
 * aislación es estructural, no un `if`.
 *
 * Error → HTTP (D7): `FechaCalendarioInvalidaError` / `FeriadoFechaDuplicadaError`
 * / `FeriadoFechaEsGlobalError` → 422; `FeriadoNoEncontradoError` → 404;
 * `DELETE` exitoso → 204. La forma del DTO (regex/largo) la resuelve el
 * `ValidationPipe` global → 400, antes del use case.
 *
 * Tarea: 4.2, sdd/feriados-configurables.
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
import { ListarFeriadosClienteUseCase } from '../../application/use-cases/listar-feriados-cliente.use-case';
import { CrearFeriadoClienteUseCase } from '../../application/use-cases/crear-feriado-cliente.use-case';
import { EditarFeriadoClienteUseCase } from '../../application/use-cases/editar-feriado-cliente.use-case';
import { EliminarFeriadoClienteUseCase } from '../../application/use-cases/eliminar-feriado-cliente.use-case';
import {
  CreateFeriadoClienteDto,
  UpdateFeriadoClienteDto,
  FeriadoClienteResponseDto,
} from '../dtos/feriado-cliente.dto';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { DomainError } from '../../../shared/domain/result';
import { FeriadoNoEncontradoError } from '../../domain/errors/feriados.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';

function toResponseDto(feriado: FeriadoEntity): FeriadoClienteResponseDto {
  return {
    id: feriado.id,
    fecha: feriado.fecha.aClave(),
    descripcion: feriado.descripcion,
  };
}

/** Mapea un `DomainError` de los use cases de feriados de cliente a la `HttpException` correspondiente (D7). */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof FeriadoNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('feriados-cliente')
export class FeriadosClienteController {
  constructor(
    private readonly listarFeriadosClienteUseCase: ListarFeriadosClienteUseCase,
    private readonly crearFeriadoClienteUseCase: CrearFeriadoClienteUseCase,
    private readonly editarFeriadoClienteUseCase: EditarFeriadoClienteUseCase,
    private readonly eliminarFeriadoClienteUseCase: EliminarFeriadoClienteUseCase,
  ) {}

  /** GET /feriados-cliente — feriados propios del tenant, orden por fecha asc. Cualquier autenticado del tenant puede leer. */
  @Get()
  async listar(): Promise<FeriadoClienteResponseDto[]> {
    const result = await this.listarFeriadosClienteUseCase.execute();
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toResponseDto);
  }

  /** POST /feriados-cliente — crea un feriado propio del tenant. Solo ADMINISTRADOR/ROOT. 201; 422 si fecha inválida, ya es global, o ya existe en el propio listado. */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateFeriadoClienteDto): Promise<FeriadoClienteResponseDto> {
    const result = await this.crearFeriadoClienteUseCase.execute({
      fecha: dto.fecha,
      descripcion: dto.descripcion,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /** PATCH /feriados-cliente/:id — full-replace. Solo ADMINISTRADOR/ROOT. 200; 404 si no existe EN EL TENANT ACTUAL (D6); 422 si fecha inválida, ya es global, o ya existe en el propio listado. */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateFeriadoClienteDto,
  ): Promise<FeriadoClienteResponseDto> {
    const result = await this.editarFeriadoClienteUseCase.execute({
      feriadoId: id,
      fecha: dto.fecha,
      descripcion: dto.descripcion,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /** DELETE /feriados-cliente/:id — baja FÍSICA (D1: sin soft delete). Solo ADMINISTRADOR/ROOT. 404 si no existe EN EL TENANT ACTUAL. */
  @Delete(':id')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarFeriadoClienteUseCase.execute({ feriadoId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
