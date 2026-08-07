/**
 * CiclosController — entry point HTTP para los ciclos de gestión del tenant
 * resuelto (`tenant.ciclos_cliente`).
 *
 * Rutas:
 *   POST  /ciclos              → ElegirCicloTenantUseCase (adopta un ciclo del catálogo master, R21) [ciclo:gestionar]
 *   PATCH /ciclos/:id/activar  → ActivarCicloUseCase (activa, desactiva el resto, R22) [ciclo:gestionar]
 *   GET   /ciclos              → ListarCiclosUseCase (G4, sdd/beta-frontend — CUALQUIER usuario autenticado, sin gate de permiso)
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` a nivel de controlador (requieren
 * JWT válido y `cliente_id` resuelto — ADR-4: el switch es el ÚNICO
 * mecanismo de salto de tenant, root incluido). `PermissionsGuard` +
 * `@RequirePermissions('ciclo:gestionar')` en los endpoints de escritura
 * (T9.7). `GET /ciclos` NO declara `@RequirePermissions` — el filtro por
 * ciclo (tickets/dashboard) lo necesitan todos los roles, no solo el
 * ADMINISTRADOR que gestiona ciclos (mismo criterio que `GET /catalogos/*`).
 *
 * Tarea: T9.7 (PR9 — Ciclos: catálogo master + adopción/activación);
 *        sdd/beta-frontend/spec §3 G4 (GET).
 */
import {
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ElegirCicloTenantUseCase } from '../../application/use-cases/elegir-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from '../../application/use-cases/activar-ciclo.use-case';
import { ListarCiclosUseCase } from '../../application/use-cases/listar-ciclos.use-case';
import { ElegirCicloDto, CicloResponseDto, ListarCiclosResponseDto } from '../dtos/ciclo.dto';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import {
  CicloClienteNotFoundError,
  CicloOverlapError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

/** Formatea un `Date` (columna `@db.Date`) como `YYYY-MM-DD`. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toResponseDto(ciclo: CicloClienteEntity): CicloResponseDto {
  return {
    id: ciclo.id,
    nombre: ciclo.nombre,
    fechaInicio: toDateOnly(ciclo.fechaInicio),
    fechaFin: toDateOnly(ciclo.fechaFin),
    activo: ciclo.activo,
    cicloVigenteId: ciclo.cicloVigenteId,
  };
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('ciclos')
export class CiclosController {
  constructor(
    private readonly elegirCicloTenantUseCase: ElegirCicloTenantUseCase,
    private readonly activarCicloUseCase: ActivarCicloUseCase,
    private readonly listarCiclosUseCase: ListarCiclosUseCase,
  ) {}

  /**
   * GET /ciclos
   * Lista TODOS los ciclos adoptados por el tenant (incl. inactivos) +
   * `cicloActivoId`. SIN `@RequirePermissions` — cualquier usuario
   * autenticado del tenant (G4, sdd/beta-frontend/spec §3).
   */
  @Get()
  async listar(): Promise<ListarCiclosResponseDto> {
    const result = await this.listarCiclosUseCase.execute();
    const { ciclos, cicloActivoId } = result.getValue();
    return { ciclos: ciclos.map(toResponseDto), cicloActivoId };
  }

  /**
   * POST /ciclos
   * Elige un ciclo del catálogo master y lo crea INACTIVO en el tenant (R21).
   * @returns 201 + CicloResponseDto con activo=false
   * @throws 404 si el ciclo master no existe/no es elegible
   * @throws 409 CicloOverlap si las fechas solapan con el ciclo activo del tenant (R21)
   */
  @Post()
  @RequirePermissions('ciclo:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: ElegirCicloDto): Promise<CicloResponseDto> {
    const result = await this.elegirCicloTenantUseCase.execute({
      cicloVigenteId: dto.cicloVigenteId,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CicloVigenteNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof CicloOverlapError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    return toResponseDto(result.getValue());
  }

  /**
   * PATCH /ciclos/:id/activar
   * Activa el ciclo indicado; desactiva todos los demás del tenant en la
   * misma transacción (R22).
   * @returns 200 + CicloResponseDto con activo=true
   * @throws 404 si el ciclo no existe en el tenant
   */
  @Patch(':id/activar')
  @RequirePermissions('ciclo:gestionar')
  @HttpCode(HttpStatus.OK)
  async activar(@Param('id') id: string): Promise<CicloResponseDto> {
    const result = await this.activarCicloUseCase.execute(id);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CicloClienteNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }

    return toResponseDto(result.getValue());
  }
}
