import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ListarCiclosUseCase } from '../../application/use-cases/listar-ciclos.use-case';
import { ElegirCicloTenantUseCase } from '../../application/use-cases/elegir-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from '../../application/use-cases/activar-ciclo.use-case';
import { ObtenerCicloActivoUseCase } from '../../application/use-cases/obtener-ciclo-activo.use-case';
import { ElegirCicloDto } from '../dtos/elegir-ciclo.dto';
import { CicloResponseDto } from '../dtos/ciclo-response.dto';
import {
  CicloVigenteOverlapError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PermissionsOrGlobalAdminGuard } from '../../../auth/infrastructure/guards/permissions-or-global-admin.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

/**
 * CiclosController — entry point HTTP para ciclos de gestión del tenant.
 *
 * Rutas:
 *   GET    /ciclos/activo        → ciclo activo del tenant resuelto (todos los roles, ADR-8)
 *   GET    /ciclos               → listar ciclos del tenant resuelto (ciclo:gestionar)
 *   POST   /ciclos               → elegir ciclo del catálogo master (ADR-3, ciclo:gestionar O global admin)
 *   PATCH  /ciclos/:id/activar   → activar ciclo (desactiva los demás en transacción)
 *
 * Guards:
 * - JwtAuthGuard + TenantGuard a nivel de controlador (todos los endpoints requieren
 *   JWT válido y resolución de tenant via JWT.cliente_id o X-Tenant-Id).
 * - `activo()` NO lleva guard de permisos adicional (ADR-8): accesible a todos los
 *   roles del tenant resuelto — TenantGuard ya garantiza el aislamiento.
 * - `create()` y `activar()` llevan PermissionsOrGlobalAdminGuard (ciclo:gestionar
 *   O is_global_admin) — el operador global opera en nombre del cliente via X-Tenant-Id.
 * - `listar()` mantiene PermissionsGuard simple (sin cambios, no pedido por el diseño).
 *
 * IMPORTANTE (riesgo #5, orden de rutas NestJS): `activo()` está declarado ANTES
 * que `listar()`/`create()`/`activar()` en esta clase — Nest registra las rutas
 * en el orden de declaración de métodos.
 *
 * Tarea: T2.15 (base) + T3.8 (Fase 3: elegir del catálogo, lectura del activo)
 */
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('ciclos')
export class CiclosController {
  constructor(
    private readonly listarCiclosUseCase: ListarCiclosUseCase,
    private readonly elegirCicloTenantUseCase: ElegirCicloTenantUseCase,
    private readonly activarCicloUseCase: ActivarCicloUseCase,
    private readonly obtenerCicloActivoUseCase: ObtenerCicloActivoUseCase,
  ) {}

  /**
   * GET /ciclos/activo
   * Retorna el ciclo ACTIVO del tenant resuelto. Accesible a TODOS los roles
   * (sin PermissionsGuard, ADR-8) — el aislamiento por tenant ya lo garantiza
   * TenantGuard (un rol regular no puede pasar X-Tenant-Id).
   *
   * Elección de contrato: 200 + `null` cuando no hay ciclo activo (en vez de
   * 204), para evitar manipular la Response manualmente en Nest.
   * @returns 200 con CicloResponseDto, o 200 con `null` si no hay activo.
   */
  @Get('activo')
  @HttpCode(HttpStatus.OK)
  async activo(): Promise<CicloResponseDto | null> {
    const ciclo = await this.obtenerCicloActivoUseCase.execute();
    return ciclo ? CicloResponseDto.fromEntity(ciclo) : null;
  }

  /**
   * GET /ciclos
   * Retorna todos los ciclos del tenant resuelto (excluye soft-deleted).
   * @returns 200 con array de CicloResponseDto (vacío si no hay ciclos)
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('ciclo:gestionar')
  @HttpCode(HttpStatus.OK)
  async listar(): Promise<CicloResponseDto[]> {
    const ciclos = await this.listarCiclosUseCase.execute();
    return ciclos.map(CicloResponseDto.fromEntity);
  }

  /**
   * POST /ciclos
   * Elige un ciclo del catálogo master (ADR-3) y lo crea INACTIVO en el tenant.
   * Guard combinado: ADMINISTRADOR del cliente (ciclo:gestionar) O operador
   * global via X-Tenant-Id (is_global_admin).
   * @returns 201 + CicloResponseDto con activo=false
   * @throws 404 NotFoundException si el ciclo master no existe/no es elegible
   * @throws 422 UnprocessableEntityException si hay solapamiento con ciclo activo
   */
  @Post()
  @UseGuards(PermissionsOrGlobalAdminGuard)
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
      if (error instanceof CicloVigenteOverlapError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('Error al elegir el ciclo.');
    }

    return CicloResponseDto.fromEntity(result.getValue());
  }

  /**
   * PATCH /ciclos/:id/activar
   * Activa el ciclo indicado y desactiva todos los demás del tenant.
   * La operación es atómica (transacción Prisma en el repositorio).
   * Sin cambios de comportamiento (ADR-7) — solo guard combinado.
   * @returns 200 + CicloResponseDto con activo=true
   * @throws 404 NotFoundException si el ciclo no existe en el tenant
   */
  @Patch(':id/activar')
  @UseGuards(PermissionsOrGlobalAdminGuard)
  @RequirePermissions('ciclo:gestionar')
  @HttpCode(HttpStatus.OK)
  async activar(@Param('id') id: string): Promise<CicloResponseDto> {
    // ActivarCicloUseCase lanza NotFoundException si el ciclo no existe
    const ciclo = await this.activarCicloUseCase.execute(id);
    return CicloResponseDto.fromEntity(ciclo);
  }
}
