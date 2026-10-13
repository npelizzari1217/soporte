import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../auth/infrastructure/guards/admin-cliente.guard';
import { DomainError } from '../../shared/domain/result';
import {
  ConsultarWebhookDestinoUseCase,
  WebhookDestinoVista,
} from '../application/consultar-webhook-destino.use-case';
import {
  GuardarWebhookDestinoOutput,
  GuardarWebhookDestinoUseCase,
} from '../application/guardar-webhook-destino.use-case';
import {
  ListarEntregasWebhookUseCase,
  MAXIMO_POR_PAGINA_ENTREGAS_WEBHOOK,
  PaginaEntregasWebhookVista,
} from '../application/listar-entregas-webhook.use-case';
import {
  RegenerarSecretoWebhookOutput,
  RegenerarSecretoWebhookUseCase,
} from '../application/regenerar-secreto-webhook.use-case';
import { WebhookDestinoNoEncontradoError } from '../domain/integraciones.errors';

/** Body de `PUT /integraciones/webhook`. El subconjunto de eventos lo valida el caso de uso (422). */
export class GuardarWebhookDestinoDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  eventos!: string[];

  @IsBoolean()
  activo!: boolean;
}

/** Query de `GET /integraciones/webhook/entregas`. */
export class ListarEntregasWebhookQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAXIMO_POR_PAGINA_ENTREGAS_WEBHOOK)
  porPagina?: number;
}

/** El cuerpo lleva el `code` del error de dominio, como `clientes` y `equipos`. */
function toHttpException(error: DomainError): Error {
  const cuerpo = (statusCode: number) => ({ statusCode, message: error.message, code: error.code });
  if (error instanceof WebhookDestinoNoEncontradoError) {
    return new NotFoundException(cuerpo(HttpStatus.NOT_FOUND));
  }
  return new UnprocessableEntityException(cuerpo(HttpStatus.UNPROCESSABLE_ENTITY));
}

/** `TenantGuard` ya exige un cliente en el token; esto lo reafirma sin castear. */
function clienteDe(user: JwtPayload): string {
  if (!user.cliente_id) throw new ForbiddenException('Se requiere un cliente activo.');
  return user.cliente_id;
}

/**
 * Destino de webhooks del cliente del actor y su registro de entregas (odd/webhooks, T6: CA4, CA6,
 * CA7 y CA8). Solo ADMINISTRADOR del cliente o ROOT; el cliente sale siempre del token, nunca de la
 * ruta, y el registro se lee de la base que bindea `TenantGuard`. Fuera del documento OpenAPI `v1`.
 */
@UseGuards(JwtAuthGuard, TenantGuard, AdminClienteGuard)
@Controller('integraciones/webhook')
export class WebhookController {
  constructor(
    private readonly consultarUseCase: ConsultarWebhookDestinoUseCase,
    private readonly guardarUseCase: GuardarWebhookDestinoUseCase,
    private readonly regenerarUseCase: RegenerarSecretoWebhookUseCase,
    private readonly listarEntregasUseCase: ListarEntregasWebhookUseCase,
  ) {}

  @Get()
  async consultar(@CurrentUser() user: JwtPayload): Promise<WebhookDestinoVista> {
    return this.consultarUseCase.execute(clienteDe(user));
  }

  /** Crea o actualiza el destino. Solo al crearlo la respuesta lleva `secreto` en claro. */
  @Put()
  async guardar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GuardarWebhookDestinoDto,
  ): Promise<GuardarWebhookDestinoOutput> {
    const result = await this.guardarUseCase.execute({
      clienteId: clienteDe(user),
      url: dto.url,
      eventos: dto.eventos,
      activo: dto.activo,
    });
    if (result.isFail()) throw toHttpException(result.getError());
    return result.getValue();
  }

  /** Devuelve el secreto nuevo en claro: es la unica respuesta que lo lleva. */
  @Post('secreto')
  @HttpCode(HttpStatus.OK)
  async regenerarSecreto(@CurrentUser() user: JwtPayload): Promise<RegenerarSecretoWebhookOutput> {
    const result = await this.regenerarUseCase.execute(clienteDe(user));
    if (result.isFail()) throw toHttpException(result.getError());
    return result.getValue();
  }

  @Get('entregas')
  async listarEntregas(
    @Query() query: ListarEntregasWebhookQueryDto,
  ): Promise<PaginaEntregasWebhookVista> {
    return this.listarEntregasUseCase.execute({
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
  }
}
