/**
 * ComprasController — entry point HTTP de los 10 comandos del módulo
 * `compras/` (sdd/redisenio-modulo-compras, PR-21). Las 3 consultas
 * (`GET /compras`, `GET /compras/:id`, `GET /compras/:id/operaciones`) y el
 * wiring de `ComprasModule` son PR-22 — este PR NO las agrega.
 *
 * Rutas:
 *   POST   /compras                                          → CrearCompraUseCase                [compra:gestionar]
 *   POST   /compras/:id/items                                 → AgregarItemCompraUseCase           [compra:gestionar]
 *   PATCH  /compras/:id/items/:itemId                          → EditarItemCompraUseCase            [compra:gestionar]
 *   DELETE /compras/:id/items/:itemId                          → EliminarItemCompraUseCase          [compra:gestionar]
 *   POST   /compras/:id/items/:itemId/aprobar                  → AprobarItemCompraUseCase           [compra:aprobar]
 *   POST   /compras/:id/items/:itemId/rechazar                 → RechazarItemCompraUseCase          [compra:aprobar]
 *   POST   /compras/:id/items/:itemId/registrar-compra         → RegistrarCompraDeItemUseCase       [compra:gestionar]
 *   POST   /compras/:id/items/:itemId/registrar-entrega        → RegistrarEntregaDeItemUseCase      [compra:gestionar]
 *   POST   /compras/:id/items/:itemId/cerrar-con-faltante      → CerrarItemConFaltanteUseCase       [compra:gestionar]
 *   POST   /compras/:id/cancelar                                → CancelarCompraUseCase              [compra:gestionar]
 *
 * Rutas de acción (`POST`, no `PATCH`) para aprobar/rechazar/registrar avance/
 * cerrar-con-faltante/cancelar: sigue el contrato ya fijado por el JSDoc de
 * `CerrarItemConFaltanteHttpDto`/`CancelarCompraHttpDto` (PR-20, ambas
 * documentadas como `POST`) — este controller extiende ese mismo criterio a
 * los otros verbos de acción (aprobar/rechazar/registrar-compra/
 * registrar-entrega) para que las 8 rutas de acción del módulo sean
 * consistentes entre sí. `PATCH` queda reservado para la única edición
 * semántica de campos (`EditarItemCompraUseCase`).
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `PermissionsGuard` + `ModulosGuard` (mismo patrón que
 * `EquiposController`/`ReparacionesController`) + `@RequireModulo('COMPRAS')`
 * a nivel de CLASE (spec §4.11). `compra:gestionar` gatea las 8 rutas de
 * gestión; `compra:aprobar` gatea SOLO aprobar/rechazar (S11, S38, S39). El
 * `PermissionsGuard` ya bypassea a ROOT (`is_global_admin`, S40); `ModulosGuard`
 * también.
 *
 * `numero`/`solicitanteId`/`cicloId` NUNCA se toman del body HTTP (PR-20,
 * riesgo declarado `sdd/redisenio-modulo-compras/riesgo-throws-planos`):
 * `numero` lo emite `NumeradorCompra` DENTRO de la transacción de
 * `CrearCompraUseCase`; `solicitanteId` es SIEMPRE `JWT.sub`; `cicloId` lo
 * resuelve `ResolverCicloActivoParaCreacion` DENTRO del propio use case — este
 * controller nunca lo recibe ni lo pasa. Aceptar cualquiera de los tres desde
 * el body los volvería alcanzables desde HTTP y reabriría un 500 latente.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException` (presentación) vía `toHttpException`,
 * que consume el contrato HTTP declarado en el JSDoc de cada uno de los 19
 * errores de `domain/errors/compras.errors.ts` (spec §5) — 422 por defecto,
 * nunca 500 silencioso para un `DomainError`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1-§4.8 (S1-S31), §4.11
 * (S38-S41), §5 (catálogo error → HTTP). Ref design: sección CASOS DE USO.
 * Tarea: PR-21.
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { ModulosGuard } from '../../../auth/infrastructure/guards/modulos.guard';
import {
  CurrentUser,
  RequireModulo,
  RequirePermissions,
} from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';

import { CrearCompraUseCase } from '../../application/use-cases/crear-compra.use-case';
import { AgregarItemCompraUseCase } from '../../application/use-cases/agregar-item-compra.use-case';
import { EditarItemCompraUseCase } from '../../application/use-cases/editar-item-compra.use-case';
import { EliminarItemCompraUseCase } from '../../application/use-cases/eliminar-item-compra.use-case';
import { AprobarItemCompraUseCase } from '../../application/use-cases/aprobar-item-compra.use-case';
import { RechazarItemCompraUseCase } from '../../application/use-cases/rechazar-item-compra.use-case';
import { RegistrarCompraDeItemUseCase } from '../../application/use-cases/registrar-compra-de-item.use-case';
import { RegistrarEntregaDeItemUseCase } from '../../application/use-cases/registrar-entrega-de-item.use-case';
import { CerrarItemConFaltanteUseCase } from '../../application/use-cases/cerrar-item-con-faltante.use-case';
import { CancelarCompraUseCase } from '../../application/use-cases/cancelar-compra.use-case';

import {
  CantidadCompradaExcedeSolicitadaError,
  CantidadCompradaRetrocedeError,
  CantidadEntregadaExcedeCompradaError,
  CantidadEntregadaRetrocedeError,
  CompraCanceladaError,
  CompraConComprasRegistradasError,
  CompraNoEncontradaError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraCongeladoError,
  ItemCompraNoAprobadoError,
  ItemCompraNoEncontradoError,
  ItemCompraYaCerradoError,
  ItemCompraYaDecididoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
  NumeradorCompraAgotadoError,
  SinCicloActivoError,
} from '../../domain/errors/compras.errors';

import {
  AgregarItemCompraHttpDto,
  CancelarCompraHttpDto,
  CerrarItemConFaltanteHttpDto,
  CompraDetalleResponseDto,
  CrearCompraHttpDto,
  EditarItemCompraHttpDto,
  ItemCompraResponseDto,
  RegistrarCompraDeItemHttpDto,
  RegistrarEntregaDeItemHttpDto,
  toCompraDetalleResponseDto,
  toItemCompraResponseDto,
} from '../dtos/compras.dto';

const PERMISO_GESTIONAR = 'compra:gestionar';
const PERMISO_APROBAR = 'compra:aprobar';

/**
 * Mapea un `DomainError` de los use cases de compras a la `HttpException`
 * correspondiente, según el contrato declarado en el JSDoc de cada error de
 * `compras.errors.ts` (spec §5: 2×409, 2×404, 15×422 — 19 en total). 403 NO
 * aparece acá: es RBAC resuelto por guard (`PermissionsGuard`/`ModulosGuard`),
 * nunca un `DomainError`.
 */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (error instanceof CompraNoEncontradaError || error instanceof ItemCompraNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof SinCicloActivoError || error instanceof NumeradorCompraAgotadoError) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof CompraCanceladaError ||
    error instanceof CompraYaCanceladaError ||
    error instanceof CompraYaCerradaError ||
    error instanceof CompraConComprasRegistradasError ||
    error instanceof ItemCompraAprobadoNoEliminableError ||
    error instanceof ItemCompraYaDecididoError ||
    error instanceof ItemCompraCongeladoError ||
    error instanceof ItemCompraNoAprobadoError ||
    error instanceof CantidadCompradaExcedeSolicitadaError ||
    error instanceof CantidadCompradaRetrocedeError ||
    error instanceof CantidadEntregadaExcedeCompradaError ||
    error instanceof CantidadEntregadaRetrocedeError ||
    error instanceof ItemCompraYaCerradoError ||
    error instanceof ItemSinFaltanteError ||
    error instanceof MotivoCierreFaltanteRequeridoError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo
  // esperado). Mismo criterio que TicketsController/EquiposController/
  // ReparacionesController.
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModulosGuard)
@RequireModulo('COMPRAS')
@Controller('compras')
export class ComprasController {
  constructor(
    private readonly crearCompraUseCase: CrearCompraUseCase,
    private readonly agregarItemCompraUseCase: AgregarItemCompraUseCase,
    private readonly editarItemCompraUseCase: EditarItemCompraUseCase,
    private readonly eliminarItemCompraUseCase: EliminarItemCompraUseCase,
    private readonly aprobarItemCompraUseCase: AprobarItemCompraUseCase,
    private readonly rechazarItemCompraUseCase: RechazarItemCompraUseCase,
    private readonly registrarCompraDeItemUseCase: RegistrarCompraDeItemUseCase,
    private readonly registrarEntregaDeItemUseCase: RegistrarEntregaDeItemUseCase,
    private readonly cerrarItemConFaltanteUseCase: CerrarItemConFaltanteUseCase,
    private readonly cancelarCompraUseCase: CancelarCompraUseCase,
  ) {}

  /**
   * POST /compras
   * Crea una compra nueva (§4.1, S1, S2). `solicitanteId` = `JWT.sub`; `anio`
   * lo resuelve el servidor (año en curso) para el numerador — nunca el
   * cliente HTTP. `cicloId` lo resuelve `ResolverCicloActivoParaCreacion`
   * DENTRO del use case, este controller no lo toca.
   * @throws 409 sin ciclo activo (S2), o numerador agotado
   */
  @Post()
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CrearCompraHttpDto,
  ): Promise<CompraDetalleResponseDto> {
    const result = await this.crearCompraUseCase.execute({
      motivo: dto.motivo,
      descripcion: dto.descripcion ?? null,
      fechaSolicitud: new Date(dto.fechaSolicitud),
      solicitanteId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toCompraDetalleResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/items
   * Agrega un ítem a una compra existente (§4.2, S4, S5). El ítem nace
   * `PENDIENTE`; si la cabecera estaba `APROBADO`/`RECHAZADO` vuelve a
   * `PENDIENTE` por T2 (consecuencia intencional del estado derivado).
   * @throws 404 compra inexistente/otro tenant
   * @throws 422 compra cancelada (S5)
   */
  @Post(':id/items')
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.CREATED)
  async agregarItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AgregarItemCompraHttpDto,
  ): Promise<CompraDetalleResponseDto> {
    const result = await this.agregarItemCompraUseCase.execute({
      compraId: id,
      usuarioId: user.sub,
      descripcion: dto.descripcion,
      cantidad: dto.cantidad,
      proveedor: dto.proveedor,
      monto: dto.monto,
      moneda: dto.moneda,
      fechaCotizacion: new Date(dto.fechaCotizacion),
      observaciones: dto.observaciones ?? null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toCompraDetalleResponseDto(result.getValue());
  }

  /**
   * PATCH /compras/:id/items/:itemId
   * Edita los campos de solicitud de un ítem (§4.2/§4.4, PATCH semántico —
   * `undefined` no toca el campo). El congelamiento (S13) y los campos libres
   * (S14) los resuelve la entidad, no este controller.
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada (S5), o ítem congelado (S13)
   */
  @Patch(':id/items/:itemId')
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.OK)
  async editarItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: EditarItemCompraHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.editarItemCompraUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
      descripcion: dto.descripcion,
      cantidad: dto.cantidad,
      proveedor: dto.proveedor,
      monto: dto.monto,
      moneda: dto.moneda,
      fechaCotizacion: dto.fechaCotizacion ? new Date(dto.fechaCotizacion) : undefined,
      observaciones: dto.observaciones,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * DELETE /compras/:id/items/:itemId
   * Baja lógica (soft delete) de un ítem PENDIENTE o RECHAZADO (§4.2, S6).
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada (S5), o ítem APROBADO no eliminable (S7)
   */
  @Delete(':id/items/:itemId')
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const result = await this.eliminarItemCompraUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * POST /compras/:id/items/:itemId/aprobar
   * Aprueba un ítem de compra (§4.3, S8). Requiere `compra:aprobar` —
   * `compra:gestionar` SOLO no alcanza (S11: 403, RBAC de guard). TECNICO
   * recibe 403 (S38, PR-3 le quitó ambos permisos de compra).
   * @throws 404 compra o ítem inexistente
   * @throws 422 ítem ya decidido (S10)
   */
  @Post(':id/items/:itemId/aprobar')
  @RequirePermissions(PERMISO_APROBAR)
  @HttpCode(HttpStatus.OK)
  async aprobarItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.aprobarItemCompraUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/items/:itemId/rechazar
   * Rechaza un ítem de compra (§4.3, S9). Requiere `compra:aprobar` — mismo
   * criterio que `aprobarItem` (S11, S39: TECNICO recibe 403).
   * @throws 404 compra o ítem inexistente
   * @throws 422 ítem ya decidido (S10)
   */
  @Post(':id/items/:itemId/rechazar')
  @RequirePermissions(PERMISO_APROBAR)
  @HttpCode(HttpStatus.OK)
  async rechazarItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.rechazarItemCompraUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/items/:itemId/registrar-compra
   * Registra el ACUMULADO de cantidad comprada de un ítem aprobado (§4.5,
   * S15-S18). `cantidadComprada` es el total acumulado, no un delta.
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada, ítem no aprobado (S16), exceso (S17),
   *             retroceso (S18), o ítem ya cerrado con faltante (S25)
   */
  @Post(':id/items/:itemId/registrar-compra')
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.OK)
  async registrarCompraDeItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: RegistrarCompraDeItemHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.registrarCompraDeItemUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
      cantidadComprada: dto.cantidadComprada,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/items/:itemId/registrar-entrega
   * Registra el ACUMULADO de cantidad entregada de un ítem (§4.6, S19-S21).
   * `cantidadEntregada` es el total acumulado, no un delta.
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada, exceso sobre lo comprado (S20), retroceso
   *             (S21), o ítem ya cerrado con faltante (S25)
   */
  @Post(':id/items/:itemId/registrar-entrega')
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.OK)
  async registrarEntregaDeItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: RegistrarEntregaDeItemHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.registrarEntregaDeItemUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
      cantidadEntregada: dto.cantidadEntregada,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/items/:itemId/cerrar-con-faltante
   * Cierra un ítem con faltante — estado TERMINAL (§4.7, req 9, S22-S25).
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada, ítem ya cerrado (S25), sin faltante real
   *             (S23), o motivo vacío (S24)
   */
  @Post(':id/items/:itemId/cerrar-con-faltante')
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.OK)
  async cerrarItemConFaltante(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CerrarItemConFaltanteHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.cerrarItemConFaltanteUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
      motivo: dto.motivo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/cancelar
   * Cancela una compra (§4.8, S27-S31). Cancelar SIN ítems está PERMITIDO
   * (S31, guarda existencial sobre conjunto vacío).
   * @throws 404 compra inexistente
   * @throws 422 ya cancelada (S30), ya cerrada (S28), o con compras
   *             registradas (S29)
   */
  @Post(':id/cancelar')
  @RequirePermissions(PERMISO_GESTIONAR)
  @HttpCode(HttpStatus.OK)
  async cancelar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelarCompraHttpDto,
  ): Promise<CompraDetalleResponseDto> {
    const result = await this.cancelarCompraUseCase.execute({
      compraId: id,
      usuarioId: user.sub,
      motivo: dto.motivo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toCompraDetalleResponseDto(result.getValue());
  }
}
