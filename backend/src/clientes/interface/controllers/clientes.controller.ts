/**
 * ClientesController — entry point HTTP para el alta de clientes (tenants),
 * exclusivo de ROOT (R16).
 *
 * Rutas:
 *   POST /clientes → CrearClienteUseCase (R16, R17, R18)
 *   GET  /clientes → ListarClientesUseCase (G3 parcial, sdd/beta-frontend/spec §3)
 *
 * Guards: `JwtAuthGuard` + `GlobalAdminGuard` a nivel de controller — solo
 * `is_global_admin=true` puede provisionar un cliente nuevo (R16) O listar
 * TODOS los clientes de la plataforma (admin de plataforma + switcher de
 * ROOT). `CrearClienteUseCase` revalida `actor.isGlobalAdmin` internamente
 * (defensa en profundidad) — `GET /clientes` no lo necesita porque no muta
 * estado.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case.
 * El mapeo de errores de dominio a HttpException se hace acá (presentación).
 *
 * Tarea: T8.4 (PR8 — CrearClienteUseCase + ClientesController);
 *        sdd/beta-frontend/spec §3 G3 (GET, parcial).
 */
import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CrearClienteUseCase } from '../../application/use-cases/crear-cliente.use-case';
import { ListarClientesUseCase } from '../../application/use-cases/listar-clientes.use-case';
import { EditarClienteUseCase } from '../../application/use-cases/editar-cliente.use-case';
import { DesactivarClienteUseCase } from '../../application/use-cases/desactivar-cliente.use-case';
import { ReactivarClienteUseCase } from '../../application/use-cases/reactivar-cliente.use-case';
import { CreateClienteDto, UpdateClienteDto, ClienteResponseDto } from '../dtos/cliente.dto';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import {
  AdminEmailYaRegistradoError,
  ClienteNoEncontradoError,
  OnlyRootCanCreateClienteError,
} from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';

function toResponseDto(cliente: ClienteEntity): ClienteResponseDto {
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    razonSocial: cliente.razonSocial,
    cuit: cliente.cuit,
    dbName: cliente.dbName,
    activo: cliente.activo,
  };
}

/**
 * Mapea un `DomainError` de `CrearClienteUseCase` a la `HttpException`
 * correspondiente.
 */
function toHttpException(
  error: DomainError,
): ForbiddenException | ConflictException | NotFoundException | InternalServerErrorException {
  if (error instanceof OnlyRootCanCreateClienteError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof ClienteNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof AdminEmailYaRegistradoError) {
    return new ConflictException(error.message);
  }
  // AdministradorRoleNotFoundError (u otro no mapeado explícitamente): falla
  // de configuración/infra, no del caller.
  return new InternalServerErrorException(error.message);
}

@UseGuards(JwtAuthGuard, GlobalAdminGuard)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly crearClienteUseCase: CrearClienteUseCase,
    private readonly listarClientesUseCase: ListarClientesUseCase,
    private readonly editarClienteUseCase: EditarClienteUseCase,
    private readonly desactivarClienteUseCase: DesactivarClienteUseCase,
    private readonly reactivarClienteUseCase: ReactivarClienteUseCase,
  ) {}

  /**
   * GET /clientes
   * Lista TODOS los clientes de la plataforma. Exclusivo ROOT
   * (`GlobalAdminGuard`, a nivel de controller — G3 parcial, sdd/beta-frontend).
   * @returns 200 + ClienteResponseDto[]
   */
  @Get()
  async listar(): Promise<ClienteResponseDto[]> {
    const result = await this.listarClientesUseCase.execute();
    return result.getValue().map(toResponseDto);
  }

  /**
   * POST /clientes
   * Provisiona un cliente nuevo completo: DB física + admin inicial. Solo
   * ROOT (`is_global_admin`).
   * @returns 201 + ClienteResponseDto
   * @throws 403 ForbiddenException si el actor no es ROOT
   * @throws 409 ConflictException si `adminEmail` ya está registrado
   * @throws 500 InternalServerErrorException si el catálogo RBAC no tiene
   *   el rol ADMINISTRADOR
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateClienteDto,
  ): Promise<ClienteResponseDto> {
    const result = await this.crearClienteUseCase.execute(
      {
        nombre: dto.nombre,
        razonSocial: dto.razonSocial ?? null,
        cuit: dto.cuit ?? null,
        adminEmail: dto.adminEmail,
        adminNombre: dto.adminNombre,
        adminApellido: dto.adminApellido,
        adminPassword: dto.adminPassword,
      },
      { isGlobalAdmin: user.is_global_admin },
    );

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * PATCH /clientes/:id
   * Edita los datos comerciales de un cliente (nombre/razón social/CUIT).
   * dbName es inmutable (no editable). Solo ROOT.
   * @returns 200 + ClienteResponseDto
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
  ): Promise<ClienteResponseDto> {
    const result = await this.editarClienteUseCase.execute({
      clienteId: id,
      nombre: dto.nombre,
      razonSocial: dto.razonSocial,
      cuit: dto.cuit,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * PATCH /clientes/:id/desactivar
   * Baja lógica: `activo=false` + soft delete. La DB física del tenant NO se
   * elimina — reversible vía `activar`. Solo ROOT.
   * @returns 200 + ClienteResponseDto con activo=false
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Patch(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  async desactivar(@Param('id') id: string): Promise<ClienteResponseDto> {
    const result = await this.desactivarClienteUseCase.execute(id);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }

  /**
   * PATCH /clientes/:id/activar
   * Revierte la baja lógica: `activo=true` + limpia deletedAt. Solo ROOT.
   * @returns 200 + ClienteResponseDto con activo=true
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Patch(':id/activar')
  @HttpCode(HttpStatus.OK)
  async activar(@Param('id') id: string): Promise<ClienteResponseDto> {
    const result = await this.reactivarClienteUseCase.execute(id);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }
}
