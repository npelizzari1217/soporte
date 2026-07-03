import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  UseGuards,
} from '@nestjs/common';
import { ListarClientesUseCase } from '../../application/use-cases/listar-clientes.use-case';
import { CrearClienteUseCase } from '../../application/use-cases/crear-cliente.use-case';
import { SuspenderClienteUseCase } from '../../application/use-cases/suspender-cliente.use-case';
import { ReactivarClienteUseCase } from '../../application/use-cases/reactivar-cliente.use-case';
import { CreateClienteDto } from '../dtos/create-cliente.dto';
import { ClienteResponseDto } from '../dtos/cliente-response.dto';
import { ClienteConflictError, ClienteNotFoundError } from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';

/**
 * ClientesController — entry point HTTP para el módulo de clientes (tenants).
 *
 * Rutas:
 *   GET    /clientes               → listar clientes (solo operador global)
 *   POST   /clientes               → provisioning completo de nuevo cliente (solo operador)
 *   DELETE /clientes/:id           → suspender cliente
 *   PUT    /clientes/:id/reactivar → reactivar cliente suspendido
 *
 * Guards:
 * - JwtAuthGuard a nivel de controlador (todos los endpoints requieren JWT).
 * - GlobalAdminGuard en TODOS los endpoints (GET /, POST /, DELETE /:id,
 *   PUT /:id/reactivar) — solo operador con is_global_admin=true.
 *
 * Responsabilidades de esta capa:
 * - Parsear request HTTP → DTO de aplicación.
 * - Delegar al use case correspondiente.
 * - Mapear Result / throw → response HTTP.
 * - CERO lógica de negocio. CERO conocimiento de Prisma o DB.
 *
 * Tarea: 1.D.2 (base) + T1.4 (guards) + T2.5 (GET /clientes + provisioning POST)
 */
@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly listarClientesUseCase: ListarClientesUseCase,
    private readonly crearClienteUseCase: CrearClienteUseCase,
    private readonly suspenderClienteUseCase: SuspenderClienteUseCase,
    private readonly reactivarClienteUseCase: ReactivarClienteUseCase,
  ) {}

  /**
   * GET /clientes
   * Lista todos los clientes activos (solo operador global).
   * @returns 200 con array de ClienteResponseDto (vacío si no hay clientes)
   */
  @Get()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  async listar(): Promise<ClienteResponseDto[]> {
    const clientes = await this.listarClientesUseCase.execute();
    return clientes.map(ClienteResponseDto.fromEntity);
  }

  /**
   * POST /clientes
   * Provisiona un nuevo cliente: DB + migraciones + seed + master record + admin user.
   * db_name se genera automáticamente ('soporte_' + id sin guiones) — no es un
   * input del body (change auto-dbname-cliente).
   * @returns 201 + ClienteResponseDto (sin adminPassword)
   * @throws 500 si el provisioning falla en cualquier paso
   */
  @Post()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateClienteDto): Promise<ClienteResponseDto> {
    try {
      const result = await this.crearClienteUseCase.execute({
        nombre: dto.nombre,
        razonSocial: dto.razonSocial,
        cuit: dto.cuit,
        adminEmail: dto.adminEmail,
        adminNombre: dto.adminNombre,
        adminApellido: dto.adminApellido,
        adminPasswordPlaintext: dto.adminPassword,
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof ClienteConflictError) {
          throw new ConflictException(error.message);
        }
        throw new ConflictException('Error al crear el cliente.');
      }

      return ClienteResponseDto.fromEntity(result.getValue());
    } catch (err) {
      // ConflictException ya está formateada → re-lanzar
      if (err instanceof ConflictException) throw err;
      // Errores de provisioning (infra) → 500
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Error interno de provisioning',
      );
    }
  }

  /**
   * DELETE /clientes/:id
   * Suspende (soft delete) un cliente activo.
   * @returns 204 No Content
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Delete(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(@Param('id') id: string): Promise<void> {
    const result = await this.suspenderClienteUseCase.execute(id);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof ClienteNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Cliente no encontrado.');
    }
  }

  /**
   * PUT /clientes/:id/reactivar
   * Reactiva un cliente previamente suspendido.
   * @returns 200 OK
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Put(':id/reactivar')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  async reactivar(@Param('id') id: string): Promise<void> {
    const result = await this.reactivarClienteUseCase.execute(id);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof ClienteNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Cliente no encontrado.');
    }
  }
}
