/**
 * ConfiguracionController — API de gestión de `ConfiguracionRuntime`
 * (categoría `smtp` únicamente, R8).
 *
 * Rutas:
 *   GET /configuracion?scope=tenant|global&categoria=smtp  → LeerConfigUseCase       [configuracion:gestionar]
 *   PUT /configuracion                                     → ActualizarConfigUseCase [configuracion:gestionar]
 *
 * Guard chain (clase, mismo patrón que `TicketsController`):
 *   JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * OBLIGACIÓN DURA (Judgment Day PR4, `ActorContext` docblock — NO
 * negociable): `ActorContext.clienteId`/`esGlobalAdmin` se resuelven
 * EXCLUSIVAMENTE del JWT verificado (`@CurrentUser() user: JwtPayload` —
 * `user.cliente_id`/`user.is_global_admin`), NUNCA del body/query de la
 * request. `buildScope()`/`buildActorContext()` son los ÚNICOS puntos donde
 * este controller construye esos valores — ambos leen solo de `user`, jamás
 * de `dto`/query params (salvo el `kind` del scope, que SÍ es input público:
 * "quiero leer/escribir tenant o global", no una identidad).
 *
 * El enforcement real de F2 (scope global solo `is_global_admin`) y de
 * ownership de tenant vive en `ActualizarConfigUseCase`/`LeerConfigUseCase`
 * (domain/application, ya implementado y testeado en PR4) — este controller
 * SOLO resuelve la identidad del JWT y traduce errores de dominio a HTTP.
 * Sin lógica de negocio acá (api-design skill: "Controllers are THIN").
 *
 * Ref design: §10. Ref spec: Requirement 3, Requirement 4. Tarea: 5.4 (PR5).
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1" (ActorContext).
 */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { CurrentUser, RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

import {
  LeerConfigUseCase,
  LeerConfigError,
} from '../../application/use-cases/leer-config.use-case';
import {
  ActualizarConfigUseCase,
  ActualizarConfigError,
} from '../../application/use-cases/actualizar-config.use-case';
import { ActorContext } from '../../domain/actor-context';
import { esScopeKindValido } from '../../domain/validar-scope';
import { ConfigScope } from '../../domain/events/configuracion-cambiada.event';
import {
  CategoriaNoSoportadaError,
  ConfigConflictoConcurrenteError,
  ScopeGlobalNoAutorizadoError,
  ScopeTenantNoAutorizadoError,
  InvalidScopeError,
  ValorEnmascaradoNoPermitidoError,
} from '../../domain/errors/config.errors';

import { ActualizarConfigHttpDto } from '../dtos/actualizar-config-http.dto';
import { ConfigResponseDto } from '../dtos/config-response.dto';

const PERMISO_CONFIGURACION = 'configuracion:gestionar';

/**
 * Resuelve el `ActorContext` EXCLUSIVAMENTE del JWT verificado — nunca del
 * body/query. `user.cliente_id` es un campo requerido de `JwtPayload`
 * (siempre string, verificado además por `TenantGuard` antes de que este
 * handler corra).
 */
function buildActorContext(user: JwtPayload): ActorContext {
  return {
    clienteId: user.cliente_id,
    esGlobalAdmin: user.is_global_admin,
  };
}

/**
 * Construye el `ConfigScope` a partir del `kind` público (`'tenant'|
 * 'global'`) — el `clienteId` de un scope tenant SIEMPRE es el propio tenant
 * del actor (`user.cliente_id`), nunca un valor recibido del cliente HTTP.
 * `kind` inválido/ausente ⇒ 400 (validación de transporte, api-design
 * skill), ANTES de tocar cualquier caso de uso.
 */
function buildScope(rawKind: unknown, user: JwtPayload): ConfigScope {
  if (!esScopeKindValido(rawKind)) {
    throw new BadRequestException(
      `scope inválido: "${String(rawKind)}" — debe ser "tenant" o "global".`,
    );
  }
  return rawKind === 'global' ? { kind: 'global' } : { kind: 'tenant', clienteId: user.cliente_id };
}

/**
 * Traduce errores de dominio de `configuracion/` a `HttpException`
 * (presentación — error-handling skill: "Application errors NEVER cross
 * into presentation as-is"). `CifradoError`/`InfraConfigError` NUNCA
 * exponen su mensaje interno (puede referirse a detalle de infra/driver) —
 * se devuelve un mensaje genérico, mismo criterio que el resto del proyecto
 * (`InfraConfigError` ya documenta esto en su propio docblock).
 */
function mapConfigError(error: LeerConfigError | ActualizarConfigError): never {
  if (error instanceof InvalidScopeError) {
    throw new BadRequestException(error.message);
  }
  if (error instanceof CategoriaNoSoportadaError) {
    throw new BadRequestException(error.message);
  }
  if (error instanceof ValorEnmascaradoNoPermitidoError) {
    throw new BadRequestException(error.message);
  }
  if (
    error instanceof ScopeGlobalNoAutorizadoError ||
    error instanceof ScopeTenantNoAutorizadoError
  ) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof ConfigConflictoConcurrenteError) {
    throw new ConflictException(error.message);
  }
  // CifradoError | InfraConfigError — fallo de infra/cifrado, no filtrar detalle interno.
  throw new InternalServerErrorException('No se pudo procesar la operación de configuración.');
}

@Controller('configuracion')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ConfiguracionController {
  constructor(
    private readonly leerConfigUseCase: LeerConfigUseCase,
    private readonly actualizarConfigUseCase: ActualizarConfigUseCase,
  ) {}

  /**
   * GET /configuracion?scope=tenant|global&categoria=smtp
   * Lista filas de `ConfiguracionRuntime` del scope indicado. Filas
   * `esSecreto` viajan SIEMPRE enmascaradas (R3) — nunca el valor real.
   *
   * @returns 200 OK + ConfigResponseDto[]
   * @throws 400 BadRequestException — `scope` ausente/inválido
   * @throws 403 ForbiddenException — sin `configuracion:gestionar` (guard) o
   *         F2/ownership de tenant (use case)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISO_CONFIGURACION)
  async listar(
    @Query('scope') scope: unknown,
    @Query('categoria') categoria: string | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<ConfigResponseDto[]> {
    const resolvedScope = buildScope(scope, user);

    const result = await this.leerConfigUseCase.execute({
      scope: resolvedScope,
      categoria,
      actor: buildActorContext(user),
    });

    if (result.isFail()) {
      mapConfigError(result.getError());
    }

    return result.getValue().map(ConfigResponseDto.fromRow);
  }

  /**
   * PUT /configuracion
   * Crea o actualiza una fila `ConfiguracionRuntime` (categoría `smtp`
   * únicamente, R8). Cifra el valor si `esSecreto` y publica
   * `ConfiguracionCambiada` para el audit async (R5) — todo eso ya vive en
   * `ActualizarConfigUseCase` (PR4); este handler solo resuelve la
   * identidad y traduce errores.
   *
   * @returns 200 OK + ConfigResponseDto (fila persistida, enmascarada si esSecreto)
   * @throws 400 BadRequestException — `scope`/`categoria`/placeholder inválidos
   * @throws 403 ForbiddenException — sin permiso (guard), F2 scope global sin
   *         `is_global_admin`, o ownership de tenant ajeno
   * @throws 409 ConflictException — conflicto de escritura concurrente
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISO_CONFIGURACION)
  async actualizar(
    @Body() dto: ActualizarConfigHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ConfigResponseDto> {
    const resolvedScope = buildScope(dto.scope, user);

    const result = await this.actualizarConfigUseCase.execute({
      scope: resolvedScope,
      categoria: dto.categoria,
      clave: dto.clave,
      valor: dto.valor,
      esSecreto: dto.esSecreto,
      tipo: dto.tipo,
      actorId: user.sub,
      actor: buildActorContext(user),
    });

    if (result.isFail()) {
      mapConfigError(result.getError());
    }

    return ConfigResponseDto.fromRow(result.getValue());
  }
}
