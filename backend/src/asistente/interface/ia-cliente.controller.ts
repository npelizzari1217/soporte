import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../auth/infrastructure/guards/global-admin.guard';
import { DomainError } from '../../shared/domain/result';
import { ConfigurarIaClienteUseCase } from '../application/configurar-ia-cliente.use-case';
import { ProbarIaClienteUseCase } from '../application/probar-ia-cliente.use-case';
import { QuitarIaClienteUseCase } from '../application/quitar-ia-cliente.use-case';
import { VerIaClienteUseCase } from '../application/ver-ia-cliente.use-case';
import {
  ClaveCifradoIaAusenteError,
  ClaveIaFaltanteError,
  ClaveIaInvalidaError,
  ClienteIaNoEncontradoError,
  IaNoConfiguradaError,
  ModeloIaInvalidoError,
  UrlIaInvalidaError,
} from '../domain/asistente.errors';
import {
  EstadoConfigIa,
  LARGO_MAXIMO_CLAVE_IA,
  LARGO_MAXIMO_MODELO_IA,
  LARGO_MAXIMO_URL_IA,
} from '../domain/config-ia';

/**
 * Body de `PATCH /clientes/:id/ia`. `clave` es el único campo opcional: omitirla conserva la
 * guardada; un texto vacío se rechaza (borrar es `DELETE /clientes/:id/ia`, una acción aparte).
 * `ValidateIf` y no `IsOptional`: `IsOptional` también deja pasar `null`, que no significa nada acá.
 * El piso sobre el valor recortado lo mide el dominio (`validarModeloIa`, `validarClaveIa`).
 */
export class ConfigurarIaClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_URL_IA)
  url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_MODELO_IA)
  modelo!: string;

  @ValidateIf((dto: ConfigurarIaClienteDto) => dto.clave !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_CLAVE_IA)
  clave?: string;
}

/** Respuesta de las cuatro rutas: espejo de `EstadoConfigIa`. La clave no existe en este tipo. */
export interface IaClienteResponseDto {
  configurado: boolean;
  url: string | null;
  modelo: string | null;
  verificadoAt: Date | null;
  verificacionError: string | null;
}

/** Campo a campo, para que un campo nuevo del estado no llegue a la respuesta sin decidirlo. */
function aRespuesta(estado: EstadoConfigIa): IaClienteResponseDto {
  return {
    configurado: estado.configurado,
    url: estado.url,
    modelo: estado.modelo,
    verificadoAt: estado.verificadoAt,
    verificacionError: estado.verificacionError,
  };
}

function aHttp(error: DomainError): Error {
  if (error instanceof ClienteIaNoEncontradoError) return new NotFoundException(error.message);
  if (
    error instanceof UrlIaInvalidaError ||
    error instanceof ModeloIaInvalidoError ||
    error instanceof ClaveIaInvalidaError ||
    error instanceof ClaveIaFaltanteError ||
    error instanceof IaNoConfiguradaError
  ) {
    return new BadRequestException(error.message);
  }
  if (error instanceof ClaveCifradoIaAusenteError) {
    return new ServiceUnavailableException(error.message);
  }
  return new InternalServerErrorException(error.message);
}

/**
 * Configuración del asistente de IA de cada cliente (odd/asistente-ia-ayuda, S4). Solo ROOT, como el
 * correo del cliente. La clave entra por `PATCH` y no sale por ninguna ruta.
 */
@UseGuards(JwtAuthGuard, GlobalAdminGuard)
@Controller('clientes')
export class IaClienteController {
  constructor(
    private readonly verIa: VerIaClienteUseCase,
    private readonly configurarIa: ConfigurarIaClienteUseCase,
    private readonly quitarIa: QuitarIaClienteUseCase,
    private readonly probarIa: ProbarIaClienteUseCase,
  ) {}

  /** GET /clientes/:id/ia — estado de la configuración. 404 si el cliente no existe. */
  @Get(':id/ia')
  async ver(@Param('id', ParseUUIDPipe) id: string): Promise<IaClienteResponseDto> {
    const result = await this.verIa.execute(id);
    if (result.isFail()) throw aHttp(result.getError());
    return aRespuesta(result.getValue());
  }

  /**
   * PATCH /clientes/:id/ia — alta o edición. 400 por URL inválida o por clave omitida sin
   * configuración previa; 503 si falta `EMAIL_CRYPTO_KEY` (no se guarda nada).
   */
  @Patch(':id/ia')
  @HttpCode(HttpStatus.OK)
  async configurar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfigurarIaClienteDto,
  ): Promise<IaClienteResponseDto> {
    const result = await this.configurarIa.execute({
      clienteId: id,
      url: dto.url,
      modelo: dto.modelo,
      clave: dto.clave,
    });
    if (result.isFail()) throw aHttp(result.getError());
    return aRespuesta(result.getValue());
  }

  /** DELETE /clientes/:id/ia — quita la configuración; el cliente pasa al modo de respaldo. */
  @Delete(':id/ia')
  @HttpCode(HttpStatus.OK)
  async quitar(@Param('id', ParseUUIDPipe) id: string): Promise<IaClienteResponseDto> {
    const result = await this.quitarIa.execute(id);
    if (result.isFail()) throw aHttp(result.getError());
    return aRespuesta(result.getValue());
  }

  /** POST /clientes/:id/ia/probar — consulta mínima al proveedor; registra el resultado. */
  @Post(':id/ia/probar')
  @HttpCode(HttpStatus.OK)
  async probar(@Param('id', ParseUUIDPipe) id: string): Promise<IaClienteResponseDto> {
    const result = await this.probarIa.execute(id);
    if (result.isFail()) throw aHttp(result.getError());
    return aRespuesta(result.getValue());
  }
}
