/**
 * ComprasController — entry point HTTP de los casos de uso del módulo
 * `compras/` (PR-21/PR-22, más las 3 etapas y `editarFechaEtapaDeItem` de
 * WU-24, sdd/compras-tres-etapas-y-sectores).
 *
 * Sin conteo de casos de uso en este header: el que había quedó
 * desactualizado dos veces. La tabla de abajo SÍ se mantiene, porque no
 * duplica un número sino el mapeo ruta → acción RBAC, que no se lee de
 * ningún otro lado de un vistazo.
 *
 * Rutas:
 *   POST   /compras                                             → CrearCompraUseCase                 [COMPRAS:ALTAS]
 *   POST   /compras/:id/items                                   → AgregarItemCompraUseCase            [COMPRAS:ALTAS]
 *   PATCH  /compras/:id                                          → EditarCompraUseCase                 [COMPRAS:MODIFICACION]
 *   PATCH  /compras/:id/items/:itemId                            → EditarItemCompraUseCase             [COMPRAS:MODIFICACION]
 *   DELETE /compras/:id/items/:itemId                            → EliminarItemCompraUseCase           [COMPRAS:BORRADO]
 *   POST   /compras/:id/items/:itemId/aprobar                    → AprobarItemCompraUseCase            [COMPRAS:APROBACION]
 *   POST   /compras/:id/items/:itemId/rechazar                   → RechazarItemCompraUseCase           [COMPRAS:APROBACION]
 *   POST   /compras/:id/items/:itemId/registrar-orden             → RegistrarOrdenDeItemUseCase         [COMPRAS:MODIFICACION]
 *   POST   /compras/:id/items/:itemId/registrar-recepcion         → RegistrarRecepcionDeItemUseCase     [COMPRAS:MODIFICACION]
 *   POST   /compras/:id/items/:itemId/registrar-entrega           → RegistrarEntregaDeItemUseCase       [COMPRAS:MODIFICACION]
 *   PATCH  /compras/:id/items/:itemId/fecha-etapa                 → EditarFechaEtapaDeItemUseCase       [COMPRAS:MODIFICACION]
 *   POST   /compras/:id/items/:itemId/cerrar-con-faltante         → CerrarItemConFaltanteUseCase        [COMPRAS:MODIFICACION]
 *   POST   /compras/:id/cancelar                                  → CancelarCompraUseCase               [COMPRAS:BORRADO]
 *   GET    /compras                                               → ListarComprasUseCase                [COMPRAS:LECTURA]
 *   GET    /compras/export                                        → ExportarComprasUseCase              [COMPRAS:LECTURA]
 *   GET    /compras/:id                                           → ObtenerCompraUseCase                [COMPRAS:LECTURA]
 *   GET    /compras/:id/operaciones                               → ListarOperacionesCompraUseCase      [COMPRAS:LECTURA]
 *
 * Rutas de acción (`POST`, no `PATCH`) para aprobar/rechazar/registrar avance/
 * cerrar-con-faltante/cancelar: sigue el contrato ya fijado por el JSDoc de
 * `CerrarItemConFaltanteHttpDto`/`CancelarCompraHttpDto` (PR-20, ambas
 * documentadas como `POST`) — este controller extiende ese mismo criterio a
 * los otros verbos de acción (aprobar/rechazar/registrar-compra/
 * registrar-entrega) para que las 8 rutas de acción del módulo sean
 * consistentes entre sí. `PATCH` queda reservado para las ediciones
 * semánticas de campos (`EditarCompraUseCase` sobre la cabecera,
 * `EditarItemCompraUseCase` sobre un ítem).
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario — reemplaza a
 * `PermissionsGuard`+`ModulosGuard`+`@RequireModulo('COMPRAS')` de clase).
 * `COMPRAS:ALTAS`/`MODIFICACION`/`BORRADO` gatean las 8 rutas de gestión
 * (mapeo exacto por ruta, ver cada JSDoc); `COMPRAS:APROBACION` gatea SOLO
 * aprobar/rechazar (S11, S38, S39); `COMPRAS:LECTURA` gatea las 3 rutas de
 * consulta (reemplaza el gate de módulo puro de hoy — R7). `AccionesGuard`
 * bypassea a ROOT (`is_global_admin`, S40) y a ADMINISTRADOR del cliente.
 *
 * `numero`/`solicitanteId`/`cicloId` NUNCA se toman del body HTTP (PR-20,
 * riesgo declarado `sdd/redisenio-modulo-compras/riesgo-throws-planos`):
 * `numero` lo emite `NumeradorCompra` DENTRO de la transacción de
 * `CrearCompraUseCase`; `solicitanteId` es SIEMPRE `JWT.sub`; `cicloId` lo
 * resuelve `ResolverCicloActivoCompra` DENTRO del propio use case — este
 * controller nunca lo recibe ni lo pasa. Aceptar cualquiera de los tres desde
 * el body los volvería alcanzables desde HTTP y reabriría un 500 latente.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException` (presentación) vía `toHttpException`,
 * que consume el contrato HTTP declarado en el JSDoc de cada uno de los
 * errores de `domain/errors/compras.errors.ts` (spec §5) — 422 por defecto,
 * nunca 500 silencioso para un `DomainError`.
 *
 * **Las 3 rutas de CONSULTA (PR-22) declaran `@RequiereAcciones('COMPRAS:LECTURA')`**
 * (WU-7.3): reemplaza el gate de módulo puro de hoy (`ModulosGuard` sin
 * `@RequirePermissions`) por la celda equivalente del catálogo nuevo (R7,
 * regla universal de LECTURA para los 3 módulos que ya tenían `ModulosGuard`).
 * El aislamiento de tenant (S41) lo garantiza
 * `TenantContext`/`PrismaCompraRepository`, no la acción de aplicación.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1-§4.8 (S1-S31), §4.9
 * (S32-S34), §4.10 (S35-S37), §4.11 (S38-S41), §5 (catálogo error → HTTP).
 * Ref design: sección CASOS DE USO. Tareas: PR-21 (comandos), PR-22
 * (consultas + wiring del módulo).
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { FormatoExport } from '../../../shared/application/armar-export';
import { entregarExport } from '../../../shared/interface/export/entregar-export';
import { ParseFormatoExportPipe } from '../../../shared/interface/export/formato-export.pipe';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';

import { CrearCompraUseCase } from '../../application/use-cases/crear-compra.use-case';
import { AgregarItemCompraUseCase } from '../../application/use-cases/agregar-item-compra.use-case';
import { EditarCompraUseCase } from '../../application/use-cases/editar-compra.use-case';
import { EditarItemCompraUseCase } from '../../application/use-cases/editar-item-compra.use-case';
import { EliminarItemCompraUseCase } from '../../application/use-cases/eliminar-item-compra.use-case';
import { AprobarItemCompraUseCase } from '../../application/use-cases/aprobar-item-compra.use-case';
import { RechazarItemCompraUseCase } from '../../application/use-cases/rechazar-item-compra.use-case';
import { RegistrarOrdenDeItemUseCase } from '../../application/use-cases/registrar-orden-de-item.use-case';
import { RegistrarRecepcionDeItemUseCase } from '../../application/use-cases/registrar-recepcion-de-item.use-case';
import { RegistrarEntregaDeItemUseCase } from '../../application/use-cases/registrar-entrega-de-item.use-case';
import { EditarFechaEtapaDeItemUseCase } from '../../application/use-cases/editar-fecha-etapa-de-item.use-case';
import { CerrarItemConFaltanteUseCase } from '../../application/use-cases/cerrar-item-con-faltante.use-case';
import { CancelarCompraUseCase } from '../../application/use-cases/cancelar-compra.use-case';
import { ListarComprasUseCase } from '../../application/use-cases/listar-compras.use-case';
import { ObtenerCompraUseCase } from '../../application/use-cases/obtener-compra.use-case';
import { ListarOperacionesCompraUseCase } from '../../application/use-cases/listar-operaciones-compra.use-case';
import { ExportarComprasUseCase } from '../../application/use-cases/exportar-compras.use-case';

import {
  CantidadOrdenadaExcedeSolicitadaError,
  CantidadOrdenadaRetrocedeError,
  CantidadRecibidaExcedeOrdenadaError,
  CantidadRecibidaRetrocedeError,
  CantidadEntregadaExcedeRecibidaError,
  CantidadEntregadaRetrocedeError,
  CompraCanceladaError,
  CompraConOrdenEmitidaError,
  CompraNoEncontradaError,
  CompraNoPendienteError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
  EtapaNoRegistradaError,
  ExportacionDemasiadoGrandeError,
  FechaEtapaFuturaError,
  FechaEtapasFueraDeOrdenError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraCongeladoError,
  ItemCompraNoAprobadoError,
  ItemCompraNoEncontradoError,
  ItemCompraYaCerradoError,
  ItemCompraYaDecididoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
  NumeradorCompraAgotadoError,
  SectorInexistenteError,
  SinCicloActivoError,
} from '../../domain/errors/compras.errors';
// El error viene de `insumos` sin traducir, a propósito: el mismo hecho —el id
// no está en el catálogo— tiene que dar el mismo código venga por el endpoint
// que venga. Traducirlo a una clase propia de compras daría dos errores para
// una sola causa.
import { InsumoNoEncontradoError } from '../../../insumos/domain/errors/insumos.errors';
import {
  CantidadNoEnteraError,
  SerialDuplicadoError,
  SerialesNoCoincidenError,
  UnidadNoAdmitidaError,
} from '../../../insumos/domain/errors/unidades-insumo.errors';

import {
  AgregarItemCompraHttpDto,
  CancelarCompraHttpDto,
  CerrarItemConFaltanteHttpDto,
  CompraDetalleResponseDto,
  CrearCompraHttpDto,
  EditarCompraHttpDto,
  EditarFechaEtapaHttpDto,
  EditarItemCompraHttpDto,
  ExportarComprasQueryDto,
  ItemCompraResponseDto,
  ListarComprasQueryDto,
  ListarComprasResponseDto,
  OperacionCompraResponseDto,
  RegistrarOrdenDeItemHttpDto,
  RegistrarRecepcionDeItemHttpDto,
  RegistrarEntregaDeItemHttpDto,
  toCompraDetalleResponseDto,
  toItemCompraResponseDto,
  toListarComprasResponseDto,
  toOperacionCompraResponseDto,
} from '../dtos/compras.dto';

/**
 * Mapea un `DomainError` de los use cases de compras a la `HttpException`
 * correspondiente, según el contrato declarado en el JSDoc de cada error de
 * `compras.errors.ts` (spec §5). El conteo de clases NO se escribe acá: lo
 * fija `compras.controller.spec.ts`, que lo deriva por reflexión del módulo
 * de errores y se rompe solo si alguien agrega un error sin mapearlo — un
 * número en este comentario ya quedó desactualizado antes y nunca dio esa
 * garantía. 403 NO aparece acá: es RBAC resuelto por guard
 * (`AccionesGuard`), nunca un `DomainError`.
 */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (error instanceof CompraNoEncontradaError || error instanceof ItemCompraNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  // Un serial ya cargado en el insumo: conflicto con el estado vigente, igual
  // que en `toHttpExceptionMovimiento`. La recepción revierte entera.
  if (
    error instanceof SinCicloActivoError ||
    error instanceof NumeradorCompraAgotadoError ||
    error instanceof SerialDuplicadoError
  ) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof CompraCanceladaError ||
    error instanceof CompraNoPendienteError ||
    error instanceof CompraYaCanceladaError ||
    error instanceof CompraYaCerradaError ||
    error instanceof CompraConOrdenEmitidaError ||
    error instanceof ItemCompraAprobadoNoEliminableError ||
    error instanceof ItemCompraYaDecididoError ||
    error instanceof ItemCompraCongeladoError ||
    error instanceof ItemCompraNoAprobadoError ||
    error instanceof CantidadOrdenadaExcedeSolicitadaError ||
    error instanceof CantidadOrdenadaRetrocedeError ||
    error instanceof CantidadRecibidaExcedeOrdenadaError ||
    error instanceof CantidadRecibidaRetrocedeError ||
    error instanceof CantidadEntregadaExcedeRecibidaError ||
    error instanceof CantidadEntregadaRetrocedeError ||
    error instanceof ItemCompraYaCerradoError ||
    error instanceof ItemSinFaltanteError ||
    error instanceof MotivoCierreFaltanteRequeridoError ||
    // WU-24 (compras-tres-etapas-y-sectores, R-4 del design): un error
    // nuevo que nadie mapea sale como 500, no como 422 — precedente idéntico
    // ya ocurrido en este módulo (ver `resolver-ciclo-activo-compra.service.ts`).
    error instanceof FechaEtapaFuturaError ||
    error instanceof FechaEtapasFueraDeOrdenError ||
    // Fix post-verify W3.
    error instanceof EtapaNoRegistradaError ||
    // Fix post-verify W6.
    error instanceof SectorInexistenteError ||
    // Exportación a CSV: cae igual en 422 por el default, pero se lista
    // explícito como los otros 22 — el default existe para el error que
    // NADIE mapeó, no para ahorrarse una línea en uno conocido.
    error instanceof ExportacionDemasiadoGrandeError ||
    // El insumo declarado para un ítem, cuando no está en el catálogo del
    // inquilino o tiene baja lógica. Es 422 y NO 404 a propósito, aunque
    // `InsumosController` conteste 404 para esta misma clase: allá el insumo
    // ES el recurso de la URL, y acá es un valor del BODY. Un 404 sobre
    // `POST /compras/:id/items` se leería como "la compra no existe" y
    // mandaría a mirar el lugar equivocado. Se lista explícito por el mismo
    // motivo que el de arriba.
    error instanceof InsumoNoEncontradoError ||
    // Recepción de un insumo `SERIE` (repuestos-numero-de-serie, ADR-11):
    // seriales sobre un insumo sin seguimiento, más seriales que el delta o
    // un delta fraccional. Los tres rechazan TODA la recepción.
    error instanceof UnidadNoAdmitidaError ||
    error instanceof SerialesNoCoincidenError ||
    error instanceof CantidadNoEnteraError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo
  // esperado). Mismo criterio que TicketsController/EquiposController/
  // ReparacionesController.
  return new UnprocessableEntityException(error.message);
}

/**
 * Lo único que este controller necesita de la respuesta HTTP para entregar
 * una descarga: poder escribir headers.
 *
 * Se declara acá en vez de importar `Response` de `express` a propósito. El
 * tipo completo traería `@types/express` como dependencia nueva — y este
 * proyecto tiene un motivo concreto para no tocar el lockfile sin
 * necesidad: el deploy aborta cuando cambia (`argon2` no recompila en
 * Windows). Tipar exactamente lo que se usa deja el mismo chequeo estricto
 * sin arrastrar nada.
 */
interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('compras')
export class ComprasController {
  constructor(
    private readonly crearCompraUseCase: CrearCompraUseCase,
    private readonly agregarItemCompraUseCase: AgregarItemCompraUseCase,
    private readonly editarCompraUseCase: EditarCompraUseCase,
    private readonly editarItemCompraUseCase: EditarItemCompraUseCase,
    private readonly eliminarItemCompraUseCase: EliminarItemCompraUseCase,
    private readonly aprobarItemCompraUseCase: AprobarItemCompraUseCase,
    private readonly rechazarItemCompraUseCase: RechazarItemCompraUseCase,
    private readonly registrarOrdenDeItemUseCase: RegistrarOrdenDeItemUseCase,
    private readonly registrarRecepcionDeItemUseCase: RegistrarRecepcionDeItemUseCase,
    private readonly registrarEntregaDeItemUseCase: RegistrarEntregaDeItemUseCase,
    private readonly editarFechaEtapaDeItemUseCase: EditarFechaEtapaDeItemUseCase,
    private readonly cerrarItemConFaltanteUseCase: CerrarItemConFaltanteUseCase,
    private readonly cancelarCompraUseCase: CancelarCompraUseCase,
    private readonly listarComprasUseCase: ListarComprasUseCase,
    private readonly obtenerCompraUseCase: ObtenerCompraUseCase,
    private readonly listarOperacionesCompraUseCase: ListarOperacionesCompraUseCase,
    private readonly exportarComprasUseCase: ExportarComprasUseCase,
  ) {}

  /**
   * POST /compras
   * Crea una compra nueva (§4.1, S1, S2). `solicitanteId` = `JWT.sub`; `anio`
   * lo resuelve el servidor (año en curso) para el numerador — nunca el
   * cliente HTTP. `cicloId` lo resuelve `ResolverCicloActivoCompra`
   * DENTRO del use case, este controller no lo toca.
   * @throws 409 sin ciclo activo (S2), o numerador agotado
   */
  @Post()
  @RequiereAcciones('COMPRAS:ALTAS')
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
      sectorId: dto.sectorId ?? null,
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
   * El `insumoId` es opcional (insumos-entrega-3): declararlo es lo que hace
   * que registrar la recepción sume el stock solo.
   * @throws 404 compra inexistente/otro tenant
   * @throws 422 compra cancelada (S5), o `insumoId` inexistente en el catálogo
   */
  @Post(':id/items')
  @RequiereAcciones('COMPRAS:ALTAS')
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
      insumoId: dto.insumoId ?? null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toCompraDetalleResponseDto(result.getValue());
  }

  /**
   * PATCH /compras/:id
   * Edita los campos de solicitud de la CABECERA (`motivo`/`descripcion`/
   * `fechaSolicitud`/`sectorId`), PATCH semántico — `undefined` no toca el
   * campo, `null` limpia `descripcion`/`sectorId`. La ventana de edición
   * (sólo mientras la compra deriva `PENDIENTE`) la resuelve
   * `CompraEntity.actualizar()`, no este controller.
   * @throws 404 compra inexistente/otro tenant
   * @throws 422 la compra ya no está PENDIENTE — algún ítem fue decidido, o
   *         está cancelada (mismo guard), o el `sectorId` no existe
   */
  @Patch(':id')
  @RequiereAcciones('COMPRAS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async editar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EditarCompraHttpDto,
  ): Promise<CompraDetalleResponseDto> {
    const result = await this.editarCompraUseCase.execute({
      compraId: id,
      usuarioId: user.sub,
      motivo: dto.motivo,
      descripcion: dto.descripcion,
      fechaSolicitud: dto.fechaSolicitud ? new Date(dto.fechaSolicitud) : undefined,
      sectorId: dto.sectorId,
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
   * (S14) los resuelve la entidad, no este controller. `insumoId` es el tercer
   * grupo (insumos-entrega-3): `null` explícito borra el vínculo, y el guard de
   * reasignación de la entidad lo bloquea en cuanto el ítem recibió mercadería.
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada (S5), ítem congelado (S13), insumo no
   *         reasignable tras una recepción, o `insumoId` inexistente
   */
  @Patch(':id/items/:itemId')
  @RequiereAcciones('COMPRAS:MODIFICACION')
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
      // Sin `??`: las tres posibilidades del PATCH tienen que llegar
      // distinguidas — ausente no toca el vínculo, `null` lo borra.
      insumoId: dto.insumoId,
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
  @RequiereAcciones('COMPRAS:BORRADO')
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
  @RequiereAcciones('COMPRAS:APROBACION')
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
  @RequiereAcciones('COMPRAS:APROBACION')
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
   * POST /compras/:id/items/:itemId/registrar-orden
   * Registra el ACUMULADO de cantidad ordenada de un ítem aprobado — PRIMERA
   * de las tres etapas (`compras-tres-etapas-y-sectores` R1, S42, S45-S47).
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada, ítem no aprobado (S47), exceso (S45),
   *             retroceso (S46), fecha futura/fuera de orden (S53-S55), o
   *             ítem ya cerrado con faltante (S48)
   */
  @Post(':id/items/:itemId/registrar-orden')
  @RequiereAcciones('COMPRAS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async registrarOrdenDeItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: RegistrarOrdenDeItemHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.registrarOrdenDeItemUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
      cantidadOrdenada: dto.cantidadOrdenada,
      ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/items/:itemId/registrar-recepcion
   * Registra el ACUMULADO de cantidad recibida de un ítem con orden emitida
   * — SEGUNDA de las tres etapas (R1, S42-S43, S46). **Rename de ruta**
   * (WU-24): reemplaza a `registrar-compra`.
   * @throws 404 compra o ítem inexistente
   * @throws 400 `seriales` con más de 100, o algún serial fuera de 1 a 255
   *             (recortado y normalizado)
   * @throws 409 serial duplicado en el insumo `SERIE` (la recepción revierte)
   * @throws 422 compra cancelada, ítem no aprobado, exceso (S43), retroceso
   *             (S46), fecha futura/fuera de orden, o ítem ya cerrado con
   *             faltante; o, con insumo: seriales sobre un insumo sin
   *             seguimiento, más seriales que el delta, o delta fraccional
   *             en un insumo `SERIE`
   */
  @Post(':id/items/:itemId/registrar-recepcion')
  @RequiereAcciones('COMPRAS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async registrarRecepcionDeItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: RegistrarRecepcionDeItemHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.registrarRecepcionDeItemUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
      cantidadRecibida: dto.cantidadRecibida,
      ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
      ...(dto.seriales !== undefined && { seriales: dto.seriales }),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/items/:itemId/registrar-entrega
   * Registra el ACUMULADO de cantidad entregada de un ítem — TERCERA de las
   * tres etapas (R1, S42, S44, S46-S47). `cantidadEntregada` es el total
   * acumulado, no un delta.
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada, ítem no aprobado (S47, endurecimiento
   *             real), exceso sobre lo recibido (S44), retroceso (S46),
   *             fecha futura/fuera de orden, o ítem ya cerrado con faltante
   */
  @Post(':id/items/:itemId/registrar-entrega')
  @RequiereAcciones('COMPRAS:MODIFICACION')
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
      ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * PATCH /compras/:id/items/:itemId/fecha-etapa
   * Edita la fecha de una etapa YA registrada, de forma independiente de su
   * cantidad (R4/S55).
   * @throws 404 compra o ítem inexistente
   * @throws 422 compra cancelada, fecha futura/fuera de orden, o ítem ya
   *             cerrado con faltante
   */
  @Patch(':id/items/:itemId/fecha-etapa')
  @RequiereAcciones('COMPRAS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async editarFechaEtapaDeItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: EditarFechaEtapaHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.editarFechaEtapaDeItemUseCase.execute({
      compraId: id,
      itemId,
      usuarioId: user.sub,
      etapa: dto.etapa,
      fecha: new Date(dto.fecha),
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
  @RequiereAcciones('COMPRAS:MODIFICACION')
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
  @RequiereAcciones('COMPRAS:BORRADO')
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

  /**
   * GET /compras
   * Lista compras del tenant activo, paginado (§4.9, S32-S34). El listado
   * NUNCA incluye `items` (S33): sólo derivados de cabecera + `total` de
   * paginación (universo filtrado completo, no el tamaño de la página).
   * `ListarComprasUseCase` siempre retorna `Result.ok` — no hay camino de
   * error (mismo criterio que `EquiposController.listar()`).
   *
   * Orden y filtro por grupo de estado: WU-25. `estado` y el `soloEnCurso`
   * deprecado se pasan CRUDOS al caso de uso — la precedencia entre ambos se
   * resuelve ahí (ver la tabla en `ListarComprasQueryDto`), no acá: el
   * controller no decide reglas, sólo traduce el borde HTTP.
   */
  @Get()
  @RequiereAcciones('COMPRAS:LECTURA')
  async listar(@Query() query: ListarComprasQueryDto): Promise<ListarComprasResponseDto> {
    const result = await this.listarComprasUseCase.execute({
      pagina: query.pagina,
      porPagina: query.porPagina,
      cicloId: query.cicloId,
      estado: query.estado,
      soloEnCurso: query.soloEnCurso,
      sectorId: query.sectorId,
      fechaDesde: query.fechaDesde !== undefined ? new Date(query.fechaDesde) : undefined,
      fechaHasta: query.fechaHasta !== undefined ? new Date(query.fechaHasta) : undefined,
    });
    return toListarComprasResponseDto(result.getValue());
  }

  /**
   * GET /compras/export
   * Exporta a CSV el listado completo que producen los filtros recibidos
   * (docs/roadmap-comercial.md punto 1) — NO la página visible.
   *
   * **Va declarada ANTES de `GET /compras/:id`, y el orden es funcional, no
   * de estilo**: Nest resuelve las rutas en el orden en que se registran, y
   * `:id` es un comodín que también matchea la palabra `export`. Declarada
   * después, esta ruta sería inalcanzable y el pedido caería en
   * `ObtenerCompraUseCase` con `id="export"`, devolviendo un 404
   * desconcertante.
   *
   * Gateada por `COMPRAS:LECTURA`, la misma acción que el listado: quien ya
   * ve estas compras en pantalla no accede a ningún dato nuevo por
   * descargarlas.
   *
   * @throws 422 la exportación supera el tope de filas (hay que filtrar más)
   */
  @Get('export')
  @RequiereAcciones('COMPRAS:LECTURA')
  async exportar(
    @Query() query: ExportarComprasQueryDto,
    @Res({ passthrough: true }) res: RespuestaConHeaders,
    @Query('formato', ParseFormatoExportPipe) formato: FormatoExport = 'csv',
  ): Promise<string | StreamableFile> {
    const result = await this.exportarComprasUseCase.execute(
      {
        cicloId: query.cicloId,
        estado: query.estado,
        sectorId: query.sectorId,
        fechaDesde: query.fechaDesde !== undefined ? new Date(query.fechaDesde) : undefined,
        fechaHasta: query.fechaHasta !== undefined ? new Date(query.fechaHasta) : undefined,
      },
      formato,
    );

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return entregarExport(res, formato, result.getValue());
  }

  /**
   * GET /compras/:id
   * Detalle de una compra CON sus ítems (§4.9, H3 del design).
   * @throws 404 compra inexistente, soft-deleted, u otro tenant
   */
  @Get(':id')
  @RequiereAcciones('COMPRAS:LECTURA')
  async obtener(@Param('id') id: string): Promise<CompraDetalleResponseDto> {
    const result = await this.obtenerCompraUseCase.execute({ compraId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { compra, seguimientoPorInsumo } = result.getValue();
    return toCompraDetalleResponseDto(compra, seguimientoPorInsumo);
  }

  /**
   * GET /compras/:id/operaciones
   * Bitácora completa de una compra, ordenada `created_at ASC` (§4.10,
   * S35-S37, H3 del design).
   * @throws 404 compra inexistente, soft-deleted, u otro tenant
   */
  @Get(':id/operaciones')
  @RequiereAcciones('COMPRAS:LECTURA')
  async listarOperaciones(@Param('id') id: string): Promise<OperacionCompraResponseDto[]> {
    const result = await this.listarOperacionesCompraUseCase.execute({ compraId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toOperacionCompraResponseDto);
  }
}
