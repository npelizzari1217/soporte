/**
 * CicloVigenteController — entry point HTTP para el CATÁLOGO GLOBAL de
 * ciclos (`master.ciclos_vigentes`).
 *
 * Rutas:
 *   POST   /ciclos-vigentes       → CrearCicloVigenteUseCase           [ROOT — R20]
 *   GET    /ciclos-vigentes       → ListarCiclosVigentesUseCase        [ciclo:gestionar, tenant — item 4/G6]
 *   PATCH  /ciclos-vigentes/:id   → EditarCicloVigenteUseCase          [ROOT — sdd/ciclos-abm-root]
 *   DELETE /ciclos-vigentes/:id   → EliminarCicloVigenteUseCase        [ROOT — sdd/ciclos-abm-root]
 *   GET    /ciclos-vigentes/admin → ListarCiclosVigentesAdminUseCase   [ROOT — sdd/ciclos-abm-root]
 *
 * Guards DISTINTOS por endpoint (decisión explícita, no un descuido):
 * `POST`/`PATCH`/`DELETE`/`GET admin` son EXCLUSIVOS de ROOT
 * (`GlobalAdminGuard`, R20) — un ROOT puede no tener `cliente_id` en el
 * JWT (recién logueado, sin tenant switcheado), por eso NO pasan por
 * `TenantGuard` (ver su JSDoc: "los endpoints master/root NO aplican este
 * guard"). `GET` (sin sufijo) en cambio lo necesita el ADMINISTRADOR del
 * TENANT para poblar el selector de adopción (`AdoptarCicloForm`, G6) —
 * por eso usa `TenantGuard` + `ciclo:gestionar` (mismo permiso que
 * `POST /ciclos` en `CiclosController`), NO `GlobalAdminGuard`, y solo
 * retorna ciclos ACTIVOS (`findAllActivos`). `GET /admin` retorna el
 * catálogo COMPLETO (incluye soft-deleted, DTO distinto con `eliminado`)
 * porque la pantalla ABM de ROOT necesita poder editar/dar de baja
 * cualquier ciclo. `JwtAuthGuard` es el único guard compartido por todos
 * (nivel de clase); `TenantGuard`/`PermissionsGuard`/`GlobalAdminGuard` se
 * declaran por método.
 *
 * Tarea: T9.3 (PR9 — Ciclos: catálogo master + adopción/activación); item 4
 * (sdd/beta-frontend/backend-gaps — G6); sdd/ciclos-abm-root (PATCH/DELETE/
 * GET admin — ABM completo del catálogo maestro por ROOT).
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
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { ListarCiclosVigentesUseCase } from '../../application/use-cases/listar-ciclos-vigentes.use-case';
import { EditarCicloVigenteUseCase } from '../../application/use-cases/editar-ciclo-vigente.use-case';
import { EliminarCicloVigenteUseCase } from '../../application/use-cases/eliminar-ciclo-vigente.use-case';
import { ListarCiclosVigentesAdminUseCase } from '../../application/use-cases/listar-ciclos-vigentes-admin.use-case';
import {
  CreateCicloVigenteDto,
  UpdateCicloVigenteDto,
  CicloVigenteResponseDto,
  CicloVigenteAdminResponseDto,
} from '../dtos/ciclo-vigente.dto';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { DomainError } from '../../../shared/domain/result';
import { CicloVigenteNotFoundError } from '../../domain/errors/clientes.errors';
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

/**
 * Respuesta de `GET /ciclos-vigentes/admin` (sdd/ciclos-abm-root) — agrega
 * `eliminado` al DTO público para que la pantalla ABM de ROOT pueda
 * deshabilitar editar/eliminar sobre ciclos ya soft-deleted.
 */
function toAdminResponseDto(ciclo: CicloVigenteEntity): CicloVigenteAdminResponseDto {
  return { ...toResponseDto(ciclo), eliminado: ciclo.isDeleted() };
}

/**
 * Mapea un `DomainError` de PATCH/DELETE (sdd/ciclos-abm-root) a la
 * `HttpException` correspondiente. `POST` no lo reusa (patrón ya
 * establecido y probado ahí, con un único error posible) para no tocar
 * código en verde sin necesidad.
 */
function toHttpException(error: DomainError): UnprocessableEntityException | NotFoundException {
  if (error instanceof CicloVigenteNotFoundError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard)
@Controller('ciclos-vigentes')
export class CicloVigenteController {
  constructor(
    private readonly crearCicloVigenteUseCase: CrearCicloVigenteUseCase,
    private readonly listarCiclosVigentesUseCase: ListarCiclosVigentesUseCase,
    private readonly editarCicloVigenteUseCase: EditarCicloVigenteUseCase,
    private readonly eliminarCicloVigenteUseCase: EliminarCicloVigenteUseCase,
    private readonly listarCiclosVigentesAdminUseCase: ListarCiclosVigentesAdminUseCase,
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

  /**
   * GET /ciclos-vigentes/admin
   * Lista TODOS los ciclos del catálogo global (incluye soft-deleted) para
   * la pantalla ABM de ROOT (sdd/ciclos-abm-root). Solo ROOT.
   */
  @Get('admin')
  @UseGuards(GlobalAdminGuard)
  async listarAdmin(): Promise<CicloVigenteAdminResponseDto[]> {
    const ciclos = await this.listarCiclosVigentesAdminUseCase.execute();
    return ciclos.map(toAdminResponseDto);
  }

  /**
   * PATCH /ciclos-vigentes/:id
   * Edita nombre y/o fechas de un ciclo del catálogo global (PATCH
   * semántico — campos ausentes no se tocan). Solo ROOT.
   * @returns 200 + CicloVigenteResponseDto
   * @throws 404 NotFoundException si el ciclo no existe o ya fue eliminado
   * @throws 422 UnprocessableEntityException si `fechaFin <= fechaInicio`
   */
  @Patch(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateCicloVigenteDto,
  ): Promise<CicloVigenteResponseDto> {
    const result = await this.editarCicloVigenteUseCase.execute({
      cicloVigenteId: id,
      nombre: dto.nombre,
      fechaInicio: dto.fechaInicio === undefined ? undefined : new Date(dto.fechaInicio),
      fechaFin: dto.fechaFin === undefined ? undefined : new Date(dto.fechaFin),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * DELETE /ciclos-vigentes/:id
   * Da de baja lógica (soft-delete) un ciclo del catálogo global. Ciclos ya
   * adoptados por algún tenant NO se ven afectados (soft-ref sin FK
   * física, ver `EliminarCicloVigenteUseCase`). Solo ROOT.
   * @throws 404 NotFoundException si el ciclo no existe o ya fue eliminado
   */
  @Delete(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarCicloVigenteUseCase.execute({ cicloVigenteId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
