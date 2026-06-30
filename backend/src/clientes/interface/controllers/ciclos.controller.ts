import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ListarCiclosUseCase } from '../../application/use-cases/listar-ciclos.use-case';
import { CrearCicloTenantUseCase } from '../../application/use-cases/crear-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from '../../application/use-cases/activar-ciclo.use-case';
import { CreateCicloDto } from '../dtos/create-ciclo.dto';
import { CicloResponseDto } from '../dtos/ciclo-response.dto';
import {
  CicloVigenteOverlapError,
  CicloVigenteInvalidDatesError,
} from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

/**
 * CiclosController — entry point HTTP para ciclos de gestión del tenant.
 *
 * Rutas:
 *   GET    /ciclos               → listar ciclos del tenant resuelto
 *   POST   /ciclos               → crear nuevo ciclo (inactivo por defecto)
 *   PATCH  /ciclos/:id/activar   → activar ciclo (desactiva los demás en transacción)
 *
 * Guards:
 * - JwtAuthGuard + TenantGuard a nivel de controlador (todos los endpoints requieren
 *   JWT válido y resolución de tenant via JWT.cliente_id o X-Tenant-Id).
 * - PermissionsGuard + @RequirePermissions('ciclo:gestionar') en cada endpoint.
 *
 * Tenant scope:
 * - Los endpoints operan sobre el tenant resuelto por TenantGuard.
 * - El operador (is_global_admin) puede pasar X-Tenant-Id para operar en nombre
 *   de cualquier tenant. TenantGuard lo resuelve; este controller es transparente a eso.
 *
 * Tarea: T2.15
 */
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('ciclos')
export class CiclosController {
  constructor(
    private readonly listarCiclosUseCase: ListarCiclosUseCase,
    private readonly crearCicloTenantUseCase: CrearCicloTenantUseCase,
    private readonly activarCicloUseCase: ActivarCicloUseCase,
  ) {}

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
   * Crea un nuevo ciclo en el tenant. El ciclo se crea INACTIVO por defecto.
   * @returns 201 + CicloResponseDto con activo=false
   * @throws 400 BadRequestException si fecha_fin <= fecha_inicio
   * @throws 422 UnprocessableEntityException si hay solapamiento con ciclo activo
   */
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('ciclo:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCicloDto): Promise<CicloResponseDto> {
    const result = await this.crearCicloTenantUseCase.execute({
      nombre: dto.nombre,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin: new Date(dto.fechaFin),
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CicloVigenteInvalidDatesError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof CicloVigenteOverlapError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('Error al crear el ciclo.');
    }

    return CicloResponseDto.fromEntity(result.getValue());
  }

  /**
   * PATCH /ciclos/:id/activar
   * Activa el ciclo indicado y desactiva todos los demás del tenant.
   * La operación es atómica (transacción Prisma en el repositorio).
   * @returns 200 + CicloResponseDto con activo=true
   * @throws 404 NotFoundException si el ciclo no existe en el tenant
   */
  @Patch(':id/activar')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('ciclo:gestionar')
  @HttpCode(HttpStatus.OK)
  async activar(@Param('id') id: string): Promise<CicloResponseDto> {
    // ActivarCicloUseCase lanza NotFoundException si el ciclo no existe
    const ciclo = await this.activarCicloUseCase.execute(id);
    return CicloResponseDto.fromEntity(ciclo);
  }
}
