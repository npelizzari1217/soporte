/**
 * DTOs de entrada/salida para `ComprasController` (PR-21/PR-22, sdd/redisenio-modulo-compras).
 *
 * Mismo patrón que `tickets/interface/dtos/ticket.dto.ts` /
 * `equipos/interface/dtos/equipos.dto.ts`: `class-validator` valida el body
 * en `POST`/`PATCH`; el `ValidationPipe({ whitelist: true, transform: true })`
 * global (`AppModule`) lo aplica automáticamente — una violación de estos
 * decoradores nunca llega al controller, responde 400 antes de tocar el
 * dominio (mismo contrato que `auth.e2e.spec.ts` — "body inválido → 400").
 *
 * **POR QUÉ ESTE ARCHIVO EXISTE (decisión del maintainer,
 * `sdd/redisenio-modulo-compras/riesgo-throws-planos`)**: la Fase B dejó 10
 * `throw new Error(...)` PLANOS en `ItemCompraEntity`/`CompraEntity`
 * (`validarCamposBase` × 2, y el guard de motivo de `CompraEntity.cancelar`).
 * Un `throw` plano NO es un `DomainError`, así que `toHttpException`
 * (PR-21) NO lo mapea — si lo alcanza input de usuario sale HTTP 500. El
 * catálogo cerrado de 19 errores (spec §5) no tiene un error reservado para
 * "campo inválido" y los agentes de la Fase B tenían prohibido crear
 * errores nuevos, así que el maintainer cerró el hueco acá, en el BORDE: la
 * validación de estos DTOs es la que mantiene esos 10 `throw` INALCANZABLES
 * desde HTTP — pasan a ser lo que dicen ser en el JSDoc del dominio,
 * precondiciones del contrato del caller, no un camino de negocio real.
 * **NO se agrega ningún error al catálogo — sigue en 19.**
 *
 * Tres de los diez NO tienen campo equivalente en ningún DTO de este
 * archivo, DELIBERADAMENTE — ver el detalle en el JSDoc de `CrearCompraHttpDto`.
 *
 * Tarea: PR-20 (abre la Fase E).
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { EstadoAprobacionItem, EstadoCompra } from '../../domain/services/estado-compra';
import {
  CompraListItemDto,
  ListarComprasResult,
} from '../../application/use-cases/listar-compras.use-case';
import {
  OperacionCompra,
  TipoOperacionCompra,
} from '../../domain/ports/i-operacion-compra.repository';

/**
 * Monedas admitidas (ADR-C7: set CERRADO, `CHECK moneda IN (...)`, NO
 * editable por el admin — por eso es un `@IsIn` fijo acá y no una consulta a
 * un catálogo). Espejo EXACTO de `MONEDAS_VALIDAS` en
 * `ItemCompraEntity` — si diverge, el DTO deja de cumplir su propósito de
 * "inalcanzable desde HTTP" para el throw de moneda.
 */
const MONEDAS_ADMITIDAS: readonly string[] = ['ARS', 'USD', 'EUR'];

// ─── Input DTOs ─────────────────────────────────────────────────────────────

/**
 * Body de `POST /compras` (§4.1, S1).
 *
 * **`numero`/`solicitanteId`/`cicloId` NO son campos de este DTO —
 * DELIBERADAMENTE.** Los tres son datos de `CrearCompraDto` (capa de
 * aplicación) que el controller (PR-21) resuelve del lado del servidor,
 * NUNCA del body HTTP:
 * - `numero`: lo genera `NumeradorCompra` dentro de la transacción.
 * - `solicitanteId`: `JWT.sub` del actor autenticado.
 * - `cicloId`: el ciclo ACTIVO resuelto por `ResolverCicloActivoParaCreacion`.
 *
 * Consecuencia (declarada en el reporte de PR-20, no un descuido): los 3
 * `throw` planos de `CompraEntity.validarCamposBase` que validan esos tres
 * campos (`numero`/`solicitanteId`/`cicloId` no vacíos) son INALCANZABLES
 * desde HTTP por construcción del wiring, no porque este DTO los valide —
 * ninguno de los tres viaja jamás en el body de una request. `numero` es
 * SIEMPRE un string no vacío con formato `COM-{anio}-{00000}` (`NumeradorCompra`
 * nunca produce otra cosa); `solicitanteId` es SIEMPRE el `sub` de un JWT ya
 * autenticado por los guards (una request sin JWT válido nunca llega al
 * controller); `cicloId` es SIEMPRE el `id` de una fila real de
 * `CicloCliente` devuelta por `ResolverCicloActivoParaCreacion` (si no hay
 * ciclo activo, la resolución falla ANTES con `SinCicloActivoError`, un
 * `DomainError` -> 409, no el `throw` plano).
 */
export class CrearCompraHttpDto {
  @IsString()
  @MinLength(1)
  motivo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsDateString()
  fechaSolicitud!: string;
}

/** Body de `POST /compras/:id/items` (§4.2, S4). */
export class AgregarItemCompraHttpDto {
  @IsString()
  @MinLength(1)
  descripcion!: string;

  /**
   * Cubre el throw plano `ItemCompraEntity.validarCamposBase`: "cantidad
   * debe ser mayor a 0". `@Min(0.01)` es el equivalente exacto de `> 0`
   * dado `maxDecimalPlaces: 2` (`Decimal(10,2)`, ADR-C3): el menor valor
   * positivo representable es 0.01, así que `>= 0.01` y `> 0` coinciden.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  cantidad!: number;

  @IsString()
  @MinLength(1)
  proveedor!: string;

  /** Cubre el throw plano `ItemCompraEntity.validarCamposBase`: "monto no puede ser negativo". */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto!: number;

  /** Cubre el throw plano `ItemCompraEntity.validarCamposBase`: "moneda inválida" (ADR-C7, set cerrado). */
  @IsIn(MONEDAS_ADMITIDAS)
  moneda!: string;

  /** Cubre el throw plano `ItemCompraEntity.validarCamposBase`: "fechaCotizacion inválida". */
  @IsDateString()
  fechaCotizacion!: string;

  @IsOptional()
  @IsString()
  observaciones?: string | null;
}

/**
 * Body de `PATCH /compras/:id/items/:itemId` (§4.2/§4.4) — PATCH semántico,
 * `undefined` no toca el campo (mismo criterio que `ItemCompraActualizarProps`).
 * Los 4 campos congelables/validables sólo se validan SI se proveen — el
 * congelamiento (S13) y los campos libres (S14) los resuelve la entidad, no
 * este DTO; acá sólo se cubre la forma/rango del dato si viaja.
 */
export class EditarItemCompraHttpDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  descripcion?: string;

  /** Si se provee, cubre el mismo throw plano que `AgregarItemCompraHttpDto.cantidad`. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  cantidad?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  proveedor?: string;

  /** Si se provee, cubre el mismo throw plano que `AgregarItemCompraHttpDto.monto`. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto?: number;

  /** Si se provee, cubre el mismo throw plano que `AgregarItemCompraHttpDto.moneda`. */
  @IsOptional()
  @IsIn(MONEDAS_ADMITIDAS)
  moneda?: string;

  /** Si se provee, cubre el mismo throw plano que `AgregarItemCompraHttpDto.fechaCotizacion`. */
  @IsOptional()
  @IsDateString()
  fechaCotizacion?: string;

  @IsOptional()
  @IsString()
  observaciones?: string | null;
}

/**
 * Body de registro de avance (§4.5/§4.6 — `cantidadComprada`/
 * `cantidadEntregada` son ACUMULADOS, no deltas). El exceso/retroceso (S17,
 * S18, S20, S21) NO son throws planos — ya son `Result.fail()` con
 * `DomainError`s del catálogo (`CantidadCompradaExcedeSolicitadaError`, etc.),
 * mapeados por `toHttpException` (PR-21). Este DTO sólo garantiza la FORMA
 * del dato (número, no negativo, 2 decimales como `Decimal(10,2)`) —
 * hardening adicional, no cobertura de uno de los 10 throws planos.
 */
export class RegistrarCompraDeItemHttpDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cantidadComprada!: number;
}

/** Ver `RegistrarCompraDeItemHttpDto` — mismo criterio para `cantidadEntregada`. */
export class RegistrarEntregaDeItemHttpDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cantidadEntregada!: number;
}

/**
 * Body de `POST /compras/:id/items/:itemId/cerrar-con-faltante` (§4.7, S24).
 * `motivo` vacío ya es un `MotivoCierreFaltanteRequeridoError` (`Result.fail`,
 * NO un throw plano) en `ItemCompraEntity.cerrarConFaltante` — este campo NO
 * cubre uno de los 10 throws del riesgo declarado, pero se valida igual por
 * consistencia de API (falla rápido en el borde, mismo shape que
 * `CancelarCompraHttpDto.motivo`).
 */
export class CerrarItemConFaltanteHttpDto {
  @IsString()
  @MinLength(1)
  motivo!: string;
}

/**
 * Body de `POST /compras/:id/cancelar` (§4.8). **Cubre el 10º y último throw
 * plano**: `CompraEntity.cancelar` — "motivoCancelacion es obligatorio". Es
 * el motivo de la CANCELACIÓN, NO el `motivo` de la compra (`CrearCompraHttpDto.motivo`)
 * — se pisan de nombre pero son campos de dos DTOs distintos sobre dos
 * entidades distintas del flujo.
 */
export class CancelarCompraHttpDto {
  @IsString()
  @MinLength(1)
  motivo!: string;
}

/** Query params de `GET /compras` (§4.9) — sólo paginación, la spec no pide filtros de negocio. */
export class ListarComprasQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}

// ─── Response DTOs ────────────────────────────────────────────────────────

/** Shape de respuesta de un ítem de compra (usado sólo en el detalle — S33 lo excluye del listado). */
export interface ItemCompraResponseDto {
  id: string;
  compraId: string;
  descripcion: string;
  cantidad: number;
  proveedor: string;
  monto: number;
  moneda: string;
  fechaCotizacion: string;
  observaciones: string | null;
  estadoAprobacion: EstadoAprobacionItem;
  /** ADR-C6: nombres neutros — también se escriben en el RECHAZO. */
  decididoPorId: string | null;
  decididoEn: string | null;
  cantidadComprada: number;
  cantidadEntregada: number;
  cerradoConFaltante: boolean;
  motivoCierreFaltante: string | null;
  comprado: boolean;
  entregado: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte un `ItemCompraEntity` al shape de respuesta HTTP. */
export function toItemCompraResponseDto(item: ItemCompraEntity): ItemCompraResponseDto {
  return {
    id: item.id,
    compraId: item.compraId,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    proveedor: item.proveedor,
    monto: item.monto,
    moneda: item.moneda,
    fechaCotizacion: item.fechaCotizacion.toISOString(),
    observaciones: item.observaciones,
    estadoAprobacion: item.estadoAprobacion,
    decididoPorId: item.decididoPorId,
    decididoEn: item.decididoEn ? item.decididoEn.toISOString() : null,
    cantidadComprada: item.cantidadComprada,
    cantidadEntregada: item.cantidadEntregada,
    cerradoConFaltante: item.cerradoConFaltante,
    motivoCierreFaltante: item.motivoCierreFaltante,
    comprado: item.comprado,
    entregado: item.entregado,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * Fila de `GET /compras` (S33): SOLO los derivados de cabecera, **NUNCA
 * `items`**. Espejo 1:1 de `CompraListItemDto` (capa de aplicación) —
 * exponer un tipo de response propio en vez de reexportar el de aplicación
 * mantiene la capa `interface` desacoplada de `application` (mismo criterio
 * que `TicketResponseDto`).
 */
export interface CompraListItemResponseDto {
  id: string;
  numero: string;
  fechaSolicitud: string;
  motivo: string;
  estado: EstadoCompra;
  comprado: boolean;
  cerrado: boolean;
  totalesPorMoneda: Record<string, number>;
}

/** Convierte una fila de `ListarComprasUseCase` al shape de respuesta HTTP. */
export function toCompraListItemResponseDto(item: CompraListItemDto): CompraListItemResponseDto {
  return {
    id: item.id,
    numero: item.numero,
    fechaSolicitud: item.fechaSolicitud.toISOString(),
    motivo: item.motivo,
    estado: item.estado,
    comprado: item.comprado,
    cerrado: item.cerrado,
    totalesPorMoneda: item.totalesPorMoneda,
  };
}

/** Response de `GET /compras` — envoltorio con metadata de paginación. `total` es el universo filtrado completo (`ListarComprasUseCase`), no el tamaño de la página. */
export interface ListarComprasResponseDto {
  items: CompraListItemResponseDto[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Convierte el resultado paginado de `ListarComprasUseCase` al shape de respuesta HTTP. */
export function toListarComprasResponseDto(
  resultado: ListarComprasResult,
): ListarComprasResponseDto {
  return {
    items: resultado.items.map(toCompraListItemResponseDto),
    total: resultado.total,
    pagina: resultado.pagina,
    porPagina: resultado.porPagina,
  };
}

/** Shape de respuesta de `GET /compras/:id` — detalle CON ítems (a diferencia del listado, S33). */
export interface CompraDetalleResponseDto {
  id: string;
  numero: string;
  fechaSolicitud: string;
  motivo: string;
  descripcion: string | null;
  solicitanteId: string;
  cicloId: string;
  estado: EstadoCompra;
  comprado: boolean;
  cerrado: boolean;
  totalesPorMoneda: Record<string, number>;
  canceladaEn: string | null;
  canceladoPorId: string | null;
  motivoCancelacion: string | null;
  items: ItemCompraResponseDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Convierte una `CompraEntity` (con ítems cargados) al shape de respuesta
 * HTTP del detalle. `compra.items` INCLUYE soft-deleted (contrato del
 * getter, ver JSDoc de `CompraEntity` — los mappers de persistencia
 * necesitan verlos para escribir su `deletedAt`); esta función los
 * EXCLUYE explícitamente — un ítem eliminado no es información que la API
 * deba exponer a un consumidor HTTP, mismo criterio que `itemsActivos()`
 * (privado en la entidad) usa internamente para la derivación de estado.
 */
export function toCompraDetalleResponseDto(compra: CompraEntity): CompraDetalleResponseDto {
  return {
    id: compra.id,
    numero: compra.numero,
    fechaSolicitud: compra.fechaSolicitud.toISOString(),
    motivo: compra.motivo,
    descripcion: compra.descripcion,
    solicitanteId: compra.solicitanteId,
    cicloId: compra.cicloId,
    estado: compra.estado,
    comprado: compra.comprado,
    cerrado: compra.cerrado,
    totalesPorMoneda: compra.totalesPorMoneda,
    canceladaEn: compra.canceladaEn ? compra.canceladaEn.toISOString() : null,
    canceladoPorId: compra.canceladoPorId,
    motivoCancelacion: compra.motivoCancelacion,
    items: compra.items.filter((item) => !item.isDeleted()).map(toItemCompraResponseDto),
    createdAt: compra.createdAt.toISOString(),
    updatedAt: compra.updatedAt.toISOString(),
  };
}

/** Shape de respuesta de una entrada de la bitácora (`GET /compras/:id/operaciones`, §4.10). */
export interface OperacionCompraResponseDto {
  id: string;
  compraId: string;
  itemCompraId: string | null;
  tipo: TipoOperacionCompra;
  usuarioId: string;
  detalle: string;
  datos: Record<string, unknown> | null;
  createdAt: string;
}

/** Convierte una `OperacionCompra` (tipo plano del puerto, ver su JSDoc) al shape de respuesta HTTP. */
export function toOperacionCompraResponseDto(
  operacion: OperacionCompra,
): OperacionCompraResponseDto {
  return {
    id: operacion.id,
    compraId: operacion.compraId,
    itemCompraId: operacion.itemCompraId,
    tipo: operacion.tipo,
    usuarioId: operacion.usuarioId,
    detalle: operacion.detalle,
    datos: operacion.datos,
    createdAt: operacion.createdAt.toISOString(),
  };
}
