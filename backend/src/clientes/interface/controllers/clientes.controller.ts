/**
 * ClientesController — entry point HTTP para el alta de clientes (tenants),
 * exclusivo de ROOT (R16).
 *
 * Rutas:
 *   POST /clientes → CrearClienteUseCase (R16, R17, R18)
 *   GET  /clientes → ListarClientesUseCase (G3 parcial, sdd/beta-frontend/spec §3;
 *     incluye resumen de correo, D7/#2359)
 *   GET/PATCH/DELETE /clientes/:id/correo, POST /clientes/:id/correo/probar →
 *     configuración de correo por cliente (sdd/configuracion-correo-por-cliente D7)
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
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { CrearClienteUseCase } from '../../application/use-cases/crear-cliente.use-case';
import {
  ClienteConCorreoResumen,
  ListarClientesUseCase,
} from '../../application/use-cases/listar-clientes.use-case';
import { EditarClienteUseCase } from '../../application/use-cases/editar-cliente.use-case';
import { DesactivarClienteUseCase } from '../../application/use-cases/desactivar-cliente.use-case';
import { ReactivarClienteUseCase } from '../../application/use-cases/reactivar-cliente.use-case';
import { ConfigurarCorreoClienteUseCase } from '../../application/use-cases/configurar-correo-cliente.use-case';
import { QuitarCorreoClienteUseCase } from '../../application/use-cases/quitar-correo-cliente.use-case';
import { ProbarCorreoClienteUseCase } from '../../application/use-cases/probar-correo-cliente.use-case';
import { VerCorreoClienteUseCase } from '../../application/use-cases/ver-correo-cliente.use-case';
import { ConfigurarCsatClienteUseCase } from '../../application/use-cases/configurar-csat-cliente.use-case';
import {
  ClienteCorreoResponseDto,
  ClienteListItemResponseDto,
  ConfigurarCorreoClienteDto,
  ConfigurarCsatClienteDto,
  CreateClienteDto,
  UpdateClienteDto,
  ClienteResponseDto,
} from '../dtos/cliente.dto';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClienteEmailConfigState } from '../../domain/ports/i-cliente-email-config.repository';
import {
  AdminEmailYaRegistradoError,
  ClienteNoEncontradoError,
  CorreoNoConfiguradoError,
  CorreoPasswordFaltanteError,
  EmailCryptoKeyAusenteError,
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
    csatHabilitado: cliente.csatHabilitado,
  };
}

/**
 * Mapea cliente + resumen de correo (ya calculado por `ListarClientesUseCase`)
 * al item de `GET /clientes` (D7, decisión #2359 — visibilidad del estado
 * "correo no configurado" en el listado). Espejo campo a campo, igual que
 * `toCorreoResponseDto` — nunca un spread del resumen crudo.
 */
function toListItemResponseDto(item: ClienteConCorreoResumen): ClienteListItemResponseDto {
  return {
    ...toResponseDto(item.cliente),
    correo: { configurado: item.correo.configurado, verificadoAt: item.correo.verificadoAt },
  };
}

/**
 * Mapea el estado de correo (dominio) a su DTO de respuesta (D7). Espejo
 * campo a campo — existe como función separada para que ningún cambio
 * futuro en `ClienteEmailConfigState` agregue un campo nuevo (p.ej. la
 * contraseña) al DTO de forma silenciosa: hay que tocar ambos tipos.
 */
function toCorreoResponseDto(state: ClienteEmailConfigState): ClienteCorreoResponseDto {
  return {
    configurado: state.configurado,
    host: state.host,
    port: state.port,
    user: state.user,
    secure: state.secure,
    from: state.from,
    verificadoAt: state.verificadoAt,
    verificacionError: state.verificacionError,
  };
}

/**
 * Mapea un `DomainError` de los use cases de `ClientesController` a la
 * `HttpException` correspondiente.
 */
function toHttpException(
  error: DomainError,
):
  | ForbiddenException
  | ConflictException
  | NotFoundException
  | BadRequestException
  | ServiceUnavailableException
  | InternalServerErrorException {
  if (error instanceof OnlyRootCanCreateClienteError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof ClienteNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof AdminEmailYaRegistradoError) {
    return new ConflictException(error.message);
  }
  if (error instanceof CorreoPasswordFaltanteError || error instanceof CorreoNoConfiguradoError) {
    return new BadRequestException(error.message);
  }
  if (error instanceof EmailCryptoKeyAusenteError) {
    return new ServiceUnavailableException(error.message);
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
    private readonly configurarCorreoClienteUseCase: ConfigurarCorreoClienteUseCase,
    private readonly quitarCorreoClienteUseCase: QuitarCorreoClienteUseCase,
    private readonly probarCorreoClienteUseCase: ProbarCorreoClienteUseCase,
    private readonly verCorreoClienteUseCase: VerCorreoClienteUseCase,
    private readonly configurarCsatClienteUseCase: ConfigurarCsatClienteUseCase,
  ) {}

  /**
   * GET /clientes
   * Lista TODOS los clientes de la plataforma, con un resumen MÍNIMO de
   * correo por cliente (`configurado` + `verificadoAt`, decisión #2359 —
   * visibilidad del estado "no configurado" sin abrir cada ficha). Exclusivo
   * ROOT (`GlobalAdminGuard`, a nivel de controller — G3 parcial,
   * sdd/beta-frontend).
   * @returns 200 + ClienteListItemResponseDto[]
   */
  @Get()
  async listar(): Promise<ClienteListItemResponseDto[]> {
    const result = await this.listarClientesUseCase.execute();
    return result.getValue().map(toListItemResponseDto);
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

  /**
   * GET /clientes/:id/correo
   * Detalle de la configuración de correo de UN cliente (D7) — lo que el
   * diálogo de edición necesita para prellenar host/puerto/usuario/remitente
   * y mostrar el estado de verificación SIN tener que hacer un PATCH primero.
   * SOLO LECTURA: `VerCorreoClienteUseCase` nunca toca
   * `smtp_config_updated_at` (no invalida el caché de transporters de WU5).
   * La contraseña NUNCA sale en la respuesta. Solo ROOT.
   * @returns 200 + ClienteCorreoResponseDto
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Get(':id/correo')
  async verCorreo(@Param('id') id: string): Promise<ClienteCorreoResponseDto> {
    const result = await this.verCorreoClienteUseCase.execute(id);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toCorreoResponseDto(result.getValue());
  }

  /**
   * PATCH /clientes/:id/correo
   * Alta o edición de la configuración SMTP de un cliente (D7). La
   * contraseña NUNCA sale en la respuesta — ver `toCorreoResponseDto`.
   * `password` omitido preserva la ya guardada; `password: ""` lo rechaza el
   * DTO (`@IsNotEmpty()`) antes de llegar acá. Solo ROOT.
   * @returns 200 + ClienteCorreoResponseDto
   * @throws 404 NotFoundException si el cliente no existe
   * @throws 400 BadRequestException si falta la contraseña y no hay nada que preservar
   * @throws 503 ServiceUnavailableException si falta EMAIL_CRYPTO_KEY (nada se guarda)
   */
  @Patch(':id/correo')
  @HttpCode(HttpStatus.OK)
  async configurarCorreo(
    @Param('id') id: string,
    @Body() dto: ConfigurarCorreoClienteDto,
  ): Promise<ClienteCorreoResponseDto> {
    const result = await this.configurarCorreoClienteUseCase.execute({
      clienteId: id,
      host: dto.host,
      port: dto.port,
      user: dto.user,
      secure: dto.secure,
      from: dto.from,
      password: dto.password,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toCorreoResponseDto(result.getValue());
  }

  /**
   * DELETE /clientes/:id/correo
   * Remoción EXPLÍCITA de la configuración de correo (único camino de
   * borrado, D7). Limpia las 9 columnas SMTP. Solo ROOT.
   * @returns 200 + ClienteCorreoResponseDto (configurado=false)
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Delete(':id/correo')
  @HttpCode(HttpStatus.OK)
  async quitarCorreo(@Param('id') id: string): Promise<ClienteCorreoResponseDto> {
    const result = await this.quitarCorreoClienteUseCase.execute(id);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toCorreoResponseDto(result.getValue());
  }

  /**
   * POST /clientes/:id/correo/probar
   * Handshake SMTP bajo demanda con la config YA guardada, sin modificarla
   * (solo persiste el resultado saneado, D6). Solo ROOT.
   * @returns 200 + ClienteCorreoResponseDto
   * @throws 404 NotFoundException si el cliente no existe
   * @throws 400 BadRequestException si el cliente no tiene config guardada
   */
  @Post(':id/correo/probar')
  @HttpCode(HttpStatus.OK)
  async probarCorreo(@Param('id') id: string): Promise<ClienteCorreoResponseDto> {
    const result = await this.probarCorreoClienteUseCase.execute(id);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toCorreoResponseDto(result.getValue());
  }

  /**
   * PATCH /clientes/:id/csat
   * Prende o apaga la emisión de encuestas CSAT de un cliente (sdd/csat,
   * WU10.2). Ruta SEPARADA de `PATCH /clientes/:id` (edición comercial),
   * mismo criterio que `/correo` (D7). Solo ROOT.
   * @returns 200 + ClienteResponseDto con el nuevo valor de `csatHabilitado`
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Patch(':id/csat')
  @HttpCode(HttpStatus.OK)
  async configurarCsat(
    @Param('id') id: string,
    @Body() dto: ConfigurarCsatClienteDto,
  ): Promise<ClienteResponseDto> {
    const result = await this.configurarCsatClienteUseCase.execute({
      clienteId: id,
      habilitado: dto.habilitado,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return toResponseDto(result.getValue());
  }
}
