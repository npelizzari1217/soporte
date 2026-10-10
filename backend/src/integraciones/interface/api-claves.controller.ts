import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../auth/infrastructure/guards/admin-cliente.guard';
import { DomainError } from '../../shared/domain/result';
import {
  CrearApiClaveOutput,
  CrearApiClaveUseCase,
  LARGO_MAXIMO_NOMBRE_CLAVE,
} from '../application/crear-api-clave.use-case';
import { ApiClaveVista, ListarApiClavesUseCase } from '../application/listar-api-claves.use-case';
import { RevocarApiClaveUseCase } from '../application/revocar-api-clave.use-case';
import { ApiClaveNoEncontradaError } from '../domain/integraciones.errors';

export class CrearApiClaveDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_NOMBRE_CLAVE)
  nombre!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permisos!: string[];
}

function toHttpException(error: DomainError): Error {
  if (error instanceof ApiClaveNoEncontradaError) return new NotFoundException(error.message);
  if (error.code === 'API_CLAVE_DUPLICADA') return new InternalServerErrorException(error.message);
  return new UnprocessableEntityException(error.message);
}

/** `TenantGuard` ya exige un cliente en el token; esto lo reafirma sin castear. */
function clienteDe(user: JwtPayload): string {
  if (!user.cliente_id) throw new ForbiddenException('Se requiere un cliente activo.');
  return user.cliente_id;
}

/**
 * Administracion de claves de la API publica del cliente del actor (CA3, CA4, CA9).
 * Solo ADMINISTRADOR del cliente o ROOT; el cliente sale siempre del token, nunca de la ruta.
 */
@UseGuards(JwtAuthGuard, TenantGuard, AdminClienteGuard)
@Controller('integraciones/claves')
export class ApiClavesController {
  constructor(
    private readonly crearApiClaveUseCase: CrearApiClaveUseCase,
    private readonly listarApiClavesUseCase: ListarApiClavesUseCase,
    private readonly revocarApiClaveUseCase: RevocarApiClaveUseCase,
  ) {}

  @Get()
  async listar(@CurrentUser() user: JwtPayload): Promise<ApiClaveVista[]> {
    return this.listarApiClavesUseCase.execute(clienteDe(user));
  }

  /** Devuelve la clave en claro: es la unica respuesta que la lleva. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CrearApiClaveDto,
  ): Promise<CrearApiClaveOutput> {
    const result = await this.crearApiClaveUseCase.execute({
      clienteId: clienteDe(user),
      creadaPorId: user.sub,
      nombre: dto.nombre,
      permisos: dto.permisos,
    });
    if (result.isFail()) throw toHttpException(result.getError());
    return result.getValue();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revocar(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const result = await this.revocarApiClaveUseCase.execute(clienteDe(user), id);
    if (result.isFail()) throw toHttpException(result.getError());
  }
}
