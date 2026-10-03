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
 * catálogo cerrado de 25 errores (spec §5) no tiene un error reservado para
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
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { EsNumeroConDecimales } from '../../../shared/interface/validators/es-numero-con-decimales';
import { EsSerialDeUnidad } from '../../../insumos/interface/validators/es-serial-de-unidad';
import {
  MOVIMIENTO_INSUMO_SERIALES_MAX,
  transformarSeriales,
} from '../../../insumos/interface/dtos/movimientos-insumo.dto';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import type { SeguimientoInsumo } from '../../../insumos/domain/entities/unidad-insumo.entity';
import {
  EstadoAprobacionItem,
  EstadoCompra,
  FILTROS_GRUPO_ESTADO_COMPRA,
  FiltroGrupoEstadoCompra,
} from '../../domain/services/estado-compra';
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
 * - `cicloId`: el ciclo ACTIVO resuelto por `ResolverCicloActivoCompra`.
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
 * `CicloCliente` devuelta por `ResolverCicloActivoCompra` (si no hay
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

  /** Sector de destino (WU-09, R11) — opcional, sin backfill (S66). */
  @IsOptional()
  @IsUUID()
  sectorId?: string;
}

/** Body de `POST /compras/:id/items` (§4.2, S4). */
export class AgregarItemCompraHttpDto {
  @IsString()
  @MinLength(1)
  descripcion!: string;

  /**
   * Insumo del catálogo que este ítem compra (insumos-entrega-3). OPCIONAL: el
   * ítem de texto libre sigue siendo legítimo y es la enorme mayoría de lo
   * cargado hasta hoy. Declararlo es lo que hace que registrar la recepción
   * sume el stock solo.
   *
   * El `@IsUUID` no es una formalidad: el campo viaja en el BODY, así que
   * ningún `ParseUUIDPipe` lo alcanza. Sin él, un id crudo llega a Prisma
   * contra una columna `@db.Uuid`, Postgres tira `22P02` y el usuario se come
   * un 500 en vez del 400 que nombra el campo. Mismo criterio que `equipoId` en
   * `movimientos-insumo.dto.ts`.
   *
   * Que el insumo EXISTA de verdad no lo decide este decorador: lo verifica
   * `AgregarItemCompraUseCase` contra el catálogo, porque la forma del id no
   * dice nada de la fila.
   */
  @IsOptional()
  @IsUUID()
  insumoId?: string | null;

  /**
   * Cubre el throw plano `ItemCompraEntity.validarCamposBase`: "cantidad
   * debe ser mayor a 0". `@Min(0.01)` es el equivalente exacto de `> 0`
   * dado el tope de 2 decimales (`Decimal(10,2)`, ADR-C3): el menor valor
   * positivo representable es 0.01, así que `>= 0.01` y `> 0` coinciden.
   *
   * Ese tope lo mide `@EsNumeroConDecimales` y no `@IsNumber`: ver su JSDoc
   * para por qué el conteo de decimales de la librería no sirve acá.
   */
  @EsNumeroConDecimales(2)
  @Min(0.01)
  cantidad!: number;

  @IsString()
  @MinLength(1)
  proveedor!: string;

  /** Cubre el throw plano `ItemCompraEntity.validarCamposBase`: "monto no puede ser negativo". */
  @EsNumeroConDecimales(2)
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

  /**
   * Insumo del catálogo que este ítem compra (insumos-entrega-3), con las TRES
   * posibilidades del PATCH distinguidas: ausente no toca el vínculo, un UUID
   * lo asigna o lo cambia, y un `null` EXPLÍCITO lo borra. `@IsOptional()` deja
   * pasar el nulo a propósito — borrar el vínculo es una operación legítima,
   * no un valor inválido—; quién puede hacerlo y cuándo lo decide
   * `ItemCompraEntity.actualizar()` con su guard de reasignación, que bloquea
   * el cambio en cuanto el ítem recibió mercadería.
   *
   * Ver `AgregarItemCompraHttpDto.insumoId` para por qué el `@IsUUID` importa
   * y por qué la existencia se verifica en la capa de aplicación.
   */
  @IsOptional()
  @IsUUID()
  insumoId?: string | null;

  /** Si se provee, cubre el mismo throw plano que `AgregarItemCompraHttpDto.cantidad`. */
  @IsOptional()
  @EsNumeroConDecimales(2)
  @Min(0.01)
  cantidad?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  proveedor?: string;

  /** Si se provee, cubre el mismo throw plano que `AgregarItemCompraHttpDto.monto`. */
  @IsOptional()
  @EsNumeroConDecimales(2)
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
 * Body de `PATCH /compras/:id` — edición de la CABECERA. PATCH semántico:
 * `undefined` no toca el campo, `null` limpia `descripcion`/`sectorId` (mismo
 * criterio que `CompraActualizarProps`).
 *
 * **`numero`/`solicitanteId`/`cicloId` NO son campos de este DTO, por la misma
 * razón que no lo son de `CrearCompraHttpDto`** — con un agravante: en el alta
 * los resuelve el servidor, pero acá ya están escritos, así que aceptarlos
 * desde el body permitiría reescribir la identidad de una compra existente
 * (renumerarla, cambiarle el solicitante, moverla de ciclo). `CompraActualizarProps`
 * tampoco los incluye: la garantía es doble, de borde y de dominio.
 *
 * `motivo` y `fechaSolicitud` mantienen las mismas restricciones que en el alta
 * — son los dos campos que `CompraEntity.validarCamposBase` valida con `throw`
 * plano, y `actualizar()` los revalida cuando viajan. Sin `@MinLength(1)` /
 * `@IsDateString()` acá, un body con `motivo: ''` alcanzaría ese throw y saldría
 * como HTTP 500 en vez de 400.
 */
export class EditarCompraHttpDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  motivo?: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsOptional()
  @IsDateString()
  fechaSolicitud?: string;

  /** `null` explícito = desasignar el sector. Si viaja un UUID, el use case verifica que exista (fix W6). */
  @IsOptional()
  @IsUUID()
  sectorId?: string | null;
}

/**
 * Body de registro de avance de las TRES etapas (R1/R4,
 * `compras-tres-etapas-y-sectores`) — las tres cantidades son ACUMULADOS,
 * no deltas. El exceso/retroceso (S43/S45/S46) NO son throws planos — ya
 * son `Result.fail()` con `DomainError`s del catálogo, mapeados por
 * `toHttpException`. Este DTO sólo garantiza la FORMA del dato (número, no
 * negativo, 2 decimales como `Decimal(10,2)`) — hardening adicional.
 * `fecha` es opcional (R4/S51): sin ella, el dominio prellena con hoy
 * (Argentina).
 */
export class RegistrarOrdenDeItemHttpDto {
  @EsNumeroConDecimales(2)
  @Min(0)
  cantidadOrdenada!: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;
}

/**
 * **Renombrado** (WU-24, `compras-tres-etapas-y-sectores`): reemplaza a
 * `RegistrarCompraDeItemHttpDto` — "recibida" es la segunda de las tres
 * etapas. Ver `RegistrarOrdenDeItemHttpDto` para el criterio de `fecha`.
 */
export class RegistrarRecepcionDeItemHttpDto {
  @EsNumeroConDecimales(2)
  @Min(0)
  cantidadRecibida!: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  /**
   * Seriales de las piezas que entran en esta recepción (insumo `SERIE`).
   * Cada uno se recorta y se valida por su largo recortado Y normalizado (1 a
   * 255): la entidad lanza ante el desborde y sin este espejo saldría un 500.
   * Que el insumo admita seriales o que no superen el delta es regla de negocio
   * (422), no de forma.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MOVIMIENTO_INSUMO_SERIALES_MAX)
  @Transform(transformarSeriales)
  @EsSerialDeUnidad({ each: true })
  seriales?: string[];
}

/** Ver `RegistrarOrdenDeItemHttpDto` — mismo criterio para `cantidadEntregada`. */
export class RegistrarEntregaDeItemHttpDto {
  @EsNumeroConDecimales(2)
  @Min(0)
  cantidadEntregada!: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;
}

/**
 * Body de `PATCH /compras/:id/items/:itemId/fecha-etapa` (R4/S55) — edita
 * la fecha de una etapa YA registrada, de forma independiente de su
 * cantidad. `etapa` restringido al catálogo cerrado de `ETAPAS_EJECUCION`
 * (ADR-T1).
 */
export class EditarFechaEtapaHttpDto {
  @IsIn(['ORDEN', 'RECEPCION', 'ENTREGA'])
  etapa!: 'ORDEN' | 'RECEPCION' | 'ENTREGA';

  @IsDateString()
  fecha!: string;
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

/**
 * Query params de `GET /compras` (§4.9 + WU-11/WU-14, R7/R11; WU-25 suma
 * `estado`). Los filtros de negocio son opcionales y combinables con la
 * paginación. `soloEnCurso` viaja como string en la querystring
 * (`?soloEnCurso=false`); `@Type(() => Boolean)` de `class-transformer` NO
 * interpreta `'false'` como `false` (cualquier string no vacío es truthy) —
 * se parsea a mano.
 *
 * **Precedencia `estado` vs `soloEnCurso` (WU-25)** — la resuelve
 * `ListarComprasUseCase.resolverGrupoEstado`, no este DTO (mismo criterio
 * con el que el default de paginación tampoco vive acá):
 *
 * | `estado`  | `soloEnCurso` | grupo aplicado |
 * |-----------|---------------|----------------|
 * | presente  | cualquiera    | el de `estado` (gana; `soloEnCurso` se ignora) |
 * | ausente   | `true`        | `ACTIVAS` |
 * | ausente   | `false`       | `TODAS` |
 * | ausente   | ausente       | `ACTIVAS` (default) |
 */
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

  @IsOptional()
  @IsUUID()
  cicloId?: string;

  /**
   * Grupo de estado a listar (WU-25). Sin este parámetro el listado muestra
   * sólo `ACTIVAS` — el default lo resuelve el caso de uso.
   */
  @IsOptional()
  @IsIn(FILTROS_GRUPO_ESTADO_COMPRA)
  estado?: FiltroGrupoEstadoCompra;

  /**
   * @deprecated WU-25 — usar `estado`. Se sigue aceptando por
   * retrocompatibilidad (`false` ≡ `TODAS`, `true` ≡ `ACTIVAS`) y se IGNORA
   * cuando `estado` viene presente. Ver la tabla de precedencia en el JSDoc
   * de esta clase.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'false' ? false : value === 'true' ? true : (value as boolean | undefined),
  )
  @IsBoolean()
  soloEnCurso?: boolean;

  @IsOptional()
  @IsUUID()
  sectorId?: string;

  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;
}

/**
 * Query params de `GET /compras/export`.
 *
 * Son los mismos filtros de negocio de `ListarComprasQueryDto` SIN
 * `pagina`/`porPagina`, y sin el `soloEnCurso` deprecado. La exportación
 * cubre el universo filtrado completo: aceptar paginación acá sólo podría
 * servir para producir un archivo incompleto, y un parámetro que se ignora
 * en silencio es peor que uno que no existe.
 *
 * Ref: docs/roadmap-comercial.md punto 1.
 */
export class ExportarComprasQueryDto {
  @IsOptional()
  @IsUUID()
  cicloId?: string;

  @IsOptional()
  @IsIn(FILTROS_GRUPO_ESTADO_COMPRA)
  estado?: FiltroGrupoEstadoCompra;

  @IsOptional()
  @IsUUID()
  sectorId?: string;

  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────

/** Shape de respuesta de un ítem de compra (usado sólo en el detalle — S33 lo excluye del listado). */
export interface ItemCompraResponseDto {
  id: string;
  compraId: string;
  descripcion: string;
  /**
   * Insumo del catálogo que el ítem declara, o `null` si es de texto libre
   * (insumos-entrega-3). Se publica porque sin él quien lo declara no puede
   * verlo después: el formulario de edición no tendría de dónde precargar el
   * valor vigente, y la pantalla no podría distinguir el ítem que va a mover
   * stock del que no.
   */
  insumoId: string | null;
  /**
   * Cómo se lleva el insumo declarado (`SERIE` pide seriales al recibir), o `null` si el ítem no
   * declara insumo o el dato no se resolvió. Solo `GET /compras/:id` lo resuelve; el resto de las
   * respuestas lo publican en `null`. Existe para que quien recibe no necesite `INSUMOS:LECTURA`.
   */
  insumoSeguimiento: SeguimientoInsumo | null;
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
  cantidadOrdenada: number;
  cantidadRecibida: number;
  cantidadEntregada: number;
  fechaOrden: string | null;
  fechaRecepcion: string | null;
  fechaEntrega: string | null;
  /** Total de este ítem (`monto × cantidad`, WU-24 R6/ADR-T12) — derivado, no persistido. */
  totalItem: number;
  cerradoConFaltante: boolean;
  motivoCierreFaltante: string | null;
  comprado: boolean;
  entregado: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte un `ItemCompraEntity` al shape de respuesta HTTP. */
export function toItemCompraResponseDto(
  item: ItemCompraEntity,
  insumoSeguimiento: SeguimientoInsumo | null = null,
): ItemCompraResponseDto {
  return {
    id: item.id,
    compraId: item.compraId,
    descripcion: item.descripcion,
    insumoId: item.insumoId,
    insumoSeguimiento,
    cantidad: item.cantidad,
    proveedor: item.proveedor,
    monto: item.monto,
    moneda: item.moneda,
    fechaCotizacion: item.fechaCotizacion.toISOString(),
    observaciones: item.observaciones,
    estadoAprobacion: item.estadoAprobacion,
    decididoPorId: item.decididoPorId,
    decididoEn: item.decididoEn ? item.decididoEn.toISOString() : null,
    cantidadOrdenada: item.cantidadOrdenada,
    cantidadRecibida: item.cantidadRecibida,
    cantidadEntregada: item.cantidadEntregada,
    fechaOrden: item.fechaOrden ? item.fechaOrden.toISOString() : null,
    fechaRecepcion: item.fechaRecepcion ? item.fechaRecepcion.toISOString() : null,
    fechaEntrega: item.fechaEntrega ? item.fechaEntrega.toISOString() : null,
    totalItem: item.totalItem,
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
  /** Sector de destino (WU-09, R11). `null` si no se asignó (S66/S67). */
  sectorId: string | null;
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
export function toCompraDetalleResponseDto(
  compra: CompraEntity,
  seguimientoPorInsumo: ReadonlyMap<string, SeguimientoInsumo> = new Map(),
): CompraDetalleResponseDto {
  return {
    id: compra.id,
    numero: compra.numero,
    fechaSolicitud: compra.fechaSolicitud.toISOString(),
    motivo: compra.motivo,
    descripcion: compra.descripcion,
    solicitanteId: compra.solicitanteId,
    cicloId: compra.cicloId,
    sectorId: compra.sectorId,
    estado: compra.estado,
    comprado: compra.comprado,
    cerrado: compra.cerrado,
    totalesPorMoneda: compra.totalesPorMoneda,
    canceladaEn: compra.canceladaEn ? compra.canceladaEn.toISOString() : null,
    canceladoPorId: compra.canceladoPorId,
    motivoCancelacion: compra.motivoCancelacion,
    items: compra.items
      .filter((item) => !item.isDeleted())
      .map((item) =>
        toItemCompraResponseDto(
          item,
          item.insumoId !== null ? (seguimientoPorInsumo.get(item.insumoId) ?? null) : null,
        ),
      ),
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
