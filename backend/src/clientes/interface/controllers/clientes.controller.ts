import {
  Controller,
  Post,
  Delete,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ConflictException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { RegistrarClienteUseCase } from '../../application/use-cases/registrar-cliente.use-case';
import { SuspenderClienteUseCase } from '../../application/use-cases/suspender-cliente.use-case';
import { ReactivarClienteUseCase } from '../../application/use-cases/reactivar-cliente.use-case';
import { CreateClienteDto } from '../dtos/create-cliente.dto';
import { ClienteResponseDto } from '../dtos/cliente-response.dto';
import { ClienteConflictError, ClienteNotFoundError } from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

/**
 * ClientesController — entry point HTTP para el módulo de clientes (tenants).
 *
 * Rutas:
 *   POST   /clientes            → registrar nuevo cliente (sin provisioning en PR-04)
 *   DELETE /clientes/:id        → suspender cliente (soft delete + activo=false)
 *   PUT    /clientes/:id/reactivar → reactivar cliente suspendido
 *
 * Responsabilidades de esta capa:
 * - Parsear request HTTP → DTO de aplicación.
 * - Delegar al use case correspondiente.
 * - Mapear Result → response HTTP (200/201/204) o excepción NestJS.
 * - CERO lógica de negocio. CERO conocimiento de Prisma o DB.
 *
 * Seguridad (T1.4, PR1 admin-general):
 * - @UseGuards(JwtAuthGuard) a nivel de controlador — todos los endpoints requieren JWT válido.
 * - Cierra el agujero de seguridad crítico: el controlador estaba ABIERTO sin autenticación.
 *
 * Tarea: 1.D.2 / T1.4
 */
@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly registrarClienteUseCase: RegistrarClienteUseCase,
    private readonly suspenderClienteUseCase: SuspenderClienteUseCase,
    private readonly reactivarClienteUseCase: ReactivarClienteUseCase,
  ) {}

  /**
   * POST /clientes
   * Registra un nuevo cliente en el sistema. Versión básica (sin provisioning).
   * @returns 201 + ClienteResponseDto
   * @throws 409 ConflictException si db_name ya existe
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateClienteDto): Promise<ClienteResponseDto> {
    const result = await this.registrarClienteUseCase.execute({
      nombre: dto.nombre,
      razonSocial: dto.razonSocial,
      cuit: dto.cuit,
      dbName: dto.dbName,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof ClienteConflictError) {
        throw new ConflictException(error.message);
      }
      throw new ConflictException('Error al crear el cliente.');
    }

    return ClienteResponseDto.fromEntity(result.getValue());
  }

  /**
   * DELETE /clientes/:id
   * Suspende (soft delete) un cliente activo.
   * @returns 204 No Content
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Delete(':id')
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
