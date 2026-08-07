/**
 * CicloVigenteController — entry point HTTP para el CATÁLOGO GLOBAL de
 * ciclos (`master.ciclos_vigentes`).
 *
 * Rutas:
 *   POST /ciclos-vigentes → CrearCicloVigenteUseCase       [ROOT, is_global_admin — R20]
 *   GET  /ciclos-vigentes → ListarCiclosVigentesUseCase    [ciclo:gestionar, tenant — item 4/G6]
 *
 * Guards DISTINTOS por endpoint (decisión explícita, no un descuido): `POST`
 * es EXCLUSIVO de ROOT (`GlobalAdminGuard`, R20) — un ROOT puede no tener
 * `cliente_id` en el JWT, por eso NO pasa por `TenantGuard` (ver su JSDoc:
 * "los endpoints master/root NO aplican este guard"). `GET` en cambio lo
 * necesita el ADMINISTRADOR del TENANT para poblar el selector de adopción
 * (`AdoptarCicloForm`, G6) — por eso usa `TenantGuard` + `ciclo:gestionar`
 * (mismo permiso que `POST /ciclos` en `CiclosController`), NO
 * `GlobalAdminGuard`. `JwtAuthGuard` es el único guard compartido por ambos
 * (nivel de clase); `TenantGuard`/`PermissionsGuard`/`GlobalAdminGuard` se
 * declaran por método.
 *
 * Tarea: T9.3 (PR9 — Ciclos: catálogo master + adopción/activación); item 4
 * (sdd/beta-frontend/backend-gaps — G6).
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { ListarCiclosVigentesUseCase } from '../../application/use-cases/listar-ciclos-vigentes.use-case';
import { CreateCicloVigenteDto, CicloVigenteResponseDto } from '../dtos/ciclo-vigente.dto';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';

/** Formatea un `Date` (columna `@db.Date`) como `YYYY-MM-DD`. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toResponseDto(ciclo: CicloVigenteEntity): CicloVigenteResponseDto {
  return {
    id: ciclo.id,
    nombre: ciclo.nombre,
    fechaInicio: toDateOnly(ciclo.fechaInicio),
    fechaFin: toDateOnly(ciclo.fechaFin),
    activo: ciclo.activo,
  };
}

@UseGuards(JwtAuthGuard)
@Controller('ciclos-vigentes')
export class CicloVigenteController {
  constructor(
    private readonly crearCicloVigenteUseCase: CrearCicloVigenteUseCase,
    private readonly listarCiclosVigentesUseCase: ListarCiclosVigentesUseCase,
  ) {}

  /**
   * POST /ciclos-vigentes
   * Crea un nuevo ciclo en el catálogo global. Solo ROOT (`is_global_admin`).
   * @returns 201 + CicloVigenteResponseDto
   * @throws 422 UnprocessableEntityException si `fechaFin <= fechaInicio`
   */
  @Post()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCicloVigenteDto): Promise<CicloVigenteResponseDto> {
    const result = await this.crearCicloVigenteUseCase.execute({
      nombre: dto.nombre,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin: new Date(dto.fechaFin),
    });

    if (result.isFail()) {
      throw new UnprocessableEntityException(result.getError().message);
    }

    return toResponseDto(result.getValue());
  }

  /**
   * GET /ciclos-vigentes
   * Lista los ciclos ACTIVOS del catálogo global — item 4/G6. El
   * ADMINISTRADOR del tenant lo usa para poblar el selector de
   * `AdoptarCicloForm` (antes texto libre de UUID sin catálogo).
   * @throws 403 sin `ciclo:gestionar`
   */
  @Get()
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions('ciclo:gestionar')
  async listar(): Promise<CicloVigenteResponseDto[]> {
    const ciclos = await this.listarCiclosVigentesUseCase.execute();
    return ciclos.map(toResponseDto);
  }
}
