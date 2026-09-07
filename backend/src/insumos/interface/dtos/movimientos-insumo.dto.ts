/**
 * DTOs de entrada/salida de `MovimientosInsumoController` — la bitácora de
 * existencias y la consulta de stock.
 *
 * **Ningún tope declara su número: todos lo IMPORTAN del dominio**, que es la
 * autoridad del límite. Acá el tope solo se adelanta al borde HTTP para
 * devolver un 400 que nombra el campo, en vez de la violación de precondición
 * que `MovimientoInsumoEntity` lanza como `throw` —y que, sin este espejo,
 * llegaría al usuario como un 500 crudo: es la clase 1 de fallo de topes que el
 * `AGENTS.md` de este repo describe—.
 *
 * Los `@Transform` aplican las MISMAS funciones de normalización del dominio,
 * por el mismo motivo que en `insumos.dto.ts`: `class-transformer` corre la
 * transformación ANTES de que `class-validator` mida nada.
 *
 * El sufijo `HttpDto` no es decorativo. La capa de aplicación ya exporta
 * `RegistrarAjusteInsumoDto` como el contrato de su caso de uso; dos tipos con
 * el mismo nombre en dos capas distintas se confunden en cada import, y el que
 * describe el BODY es este.
 *
 * **El `usuarioId` no está en ningún DTO de entrada, y esa ausencia es una
 * regla, no un olvido**: lo estampa el controller desde el usuario autenticado
 * (`JWT.sub`). Como el `ValidationPipe` global corre con `whitelist: true`, un
 * body que pretenda fijarlo queda descartado antes de llegar al handler. Mismo
 * criterio que `solicitanteId` en `compras.dto.ts`.
 */
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  MovimientoInsumoEntity,
  MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES,
  MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA,
  MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
  normalizarMotivoMovimiento,
} from '../../domain/entities/movimiento-insumo.entity';
import {
  TipoAjusteInsumo,
  TipoMovimientoInsumo,
  TIPOS_AJUSTE_INSUMO,
} from '../../domain/entities/tipo-movimiento-insumo';
import { EstadoReposicionInsumo } from '../../domain/entities/estado-reposicion-insumo';
import { StockDeInsumo } from '../../application/use-cases/consultar-stock-insumo.use-case';

/**
 * Normaliza el motivo con la función del dominio: recorta los espacios de
 * borde y colapsa el vacío a `null`. Deja pasar intacto lo que no es un string
 * ni un nulo para que `@IsString` sea quien reporte el error de tipo.
 *
 * El colapso a `null` es lo que le permite a la entidad exigir CONTENIDO y no
 * solo presencia en el ajuste: si el borde dejara pasar `'   '` intacto, un
 * ajuste con tres espacios de motivo llegaría al dominio como un motivo
 * presente.
 *
 * @param value Valor crudo del campo `motivo`, tal como llega del body.
 * @returns El motivo recortado, `null` si no tiene contenido, o el valor intacto si no es string.
 */
function transformarMotivo({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarMotivoMovimiento(value) : value;
}

/**
 * Body de `POST /insumos/:insumoId/movimientos/entrada` y de
 * `POST /insumos/:insumoId/movimientos/salida`.
 *
 * UNA sola clase para las dos rutas porque es el MISMO asiento con otro tipo:
 * el tipo lo fija la ruta, no el body. Ver el JSDoc de
 * `MovimientosInsumoController` para por qué el tipo no viaja acá.
 */
export class RegistrarMovimientoInsumoHttpDto {
  /**
   * Cantidad movida, SIEMPRE positiva: el signo lo da el tipo del movimiento.
   *
   * Los tres decoradores espejan las tres precondiciones que
   * `MovimientoInsumoEntity` lanza como `throw`, y los tres números salen del
   * dominio:
   *
   * - `@IsPositive` en vez de `@Min(0)`: el cero no es un movimiento, y `@Min`
   *   lo dejaría pasar. No hay constante que importar porque el piso es el cero
   *   exclusivo, que es la definición misma de `isPositive`.
   * - `maxDecimalPlaces` no es una formalidad: Postgres NO falla ante un tercer
   *   decimal en un `DECIMAL(10,2)`, lo REDONDEA en silencio. Acá ese redondeo
   *   no se queda en una fila: se acumula sobre el stock, que ES la suma de
   *   todas ellas. `@IsNumber` además rechaza `NaN` e `Infinity`, que no caen
   *   en ninguna comparación de rango.
   * - `@Max` importa el techo de NEGOCIO, no el límite físico de la columna.
   */
  @IsNumber({ maxDecimalPlaces: MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES })
  @IsPositive()
  @Max(MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA)
  cantidad!: number;

  /**
   * Explicación del asiento. OPCIONAL en el borde para las cuatro direcciones,
   * incluido el ajuste: que el ajuste lo exija es una regla de NEGOCIO que vive
   * en `MovimientoInsumoEntity.create()` y sale como `MotivoAjusteRequeridoError`
   * → 422. Duplicarla acá como un 400 de forma le daría dos dueños a la misma
   * regla, y le mostraría al usuario dos errores distintos para el mismo
   * problema.
   *
   * El `@MaxLength` mide DESPUÉS del `@Transform`, y eso importa en los dos
   * sentidos: el recorte solo achica, así que un texto que solo pasa el tope
   * por sus espacios de borde se acepta en vez de rechazarse por algo que la
   * columna guarda sin problema.
   */
  @IsOptional()
  @IsString()
  @Transform(transformarMotivo)
  @MaxLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH)
  motivo?: string | null;

  /**
   * A qué equipo fue lo que se movió. Trazabilidad, no stock: no participa de
   * la suma.
   *
   * Viaja en el BODY, así que `ParseUUIDPipe` no lo alcanza: sin `@IsUUID` el
   * id crudo llega a Prisma contra una columna `@db.Uuid`, Postgres tira
   * `22P02` y sale un 500 en vez de un 400. Mismo criterio que `familiaId` en
   * `insumos.dto.ts`.
   */
  @IsOptional()
  @IsUUID()
  equipoId?: string | null;

  /** A qué sector fue lo que se movió. Mismo criterio que `equipoId`. */
  @IsOptional()
  @IsUUID()
  sectorId?: string | null;
}

/**
 * Body de `POST /insumos/:insumoId/movimientos/ajuste`.
 *
 * Es el ÚNICO body de este módulo que lleva el `tipo`, y se puede permitir
 * justamente porque las dos direcciones del ajuste comparten el gate
 * `INSUMOS:AJUSTAR`: el campo discrimina la operación sin cambiar el permiso
 * que hace falta para ejecutarla. Un discriminador que SÍ cambiara el permiso
 * no podría vivir en el body, porque un decorador no puede leerlo.
 *
 * El `@IsIn` es parte del gate, no una validación de forma: si admitiera
 * `ENTRADA` o `SALIDA`, quien solo tiene `AJUSTAR` registraría la operación
 * cotidiana por esta puerta, y el gate de `ALTAS` quedaría esquivable. El
 * catálogo se importa del dominio para que no pueda desincronizarse.
 */
export class RegistrarAjusteInsumoHttpDto extends RegistrarMovimientoInsumoHttpDto {
  @IsIn(TIPOS_AJUSTE_INSUMO)
  tipo!: TipoAjusteInsumo;
}

/**
 * Response shape de un asiento de la bitácora.
 *
 * **Sin `updatedAt`, a propósito.** `MovimientoInsumoEntity` lo hereda de
 * `BaseEntity` y lo espeja de `createdAt`, pero `movimientos_insumo` no tiene
 * esa columna: publicarlo inventaría un dato de "última modificación" sobre una
 * tabla append-only, donde un movimiento no se edita nunca —se corrige con otro
 * movimiento—.
 *
 * **Con `itemCompraId`, y por una razón simétrica** (insumos-entrega-3): la
 * entrada que genera la recepción de una compra va deliberadamente SIN
 * `motivo`, porque el origen ya está dicho con un dato estructurado y con FK en
 * vez de una frase. Ese dato es este campo; sin publicarlo, un asiento nacido
 * de una recepción se ve exactamente igual que una carga manual sin motivo y la
 * trazabilidad que la base guarda no llega nunca a quien la necesita.
 */
export interface MovimientoInsumoResponseDto {
  id: string;
  insumoId: string;
  tipo: TipoMovimientoInsumo;
  cantidad: number;
  usuarioId: string;
  motivo: string | null;
  equipoId: string | null;
  sectorId: string | null;
  /** Ítem de compra cuya recepción originó el asiento; `null` si la carga fue manual. */
  itemCompraId: string | null;
  createdAt: string;
}

/**
 * Response shape del stock de un insumo.
 *
 * `stockMinimo` viaja además del estado porque la ficha lo muestra —"quedan 3,
 * el punto es 10" dice bastante más que "reponer"—, y el `null` explícito es lo
 * que le permite al consumidor distinguir el insumo sin configurar sin tener
 * que interpretar el estado.
 */
export interface StockInsumoResponseDto {
  insumoId: string;
  stock: number;
  stockMinimo: number | null;
  estadoReposicion: EstadoReposicionInsumo;
}

/**
 * Convierte un `MovimientoInsumoEntity` de dominio al shape de respuesta HTTP.
 *
 * @param entidad Asiento de dominio recién registrado.
 * @returns El DTO de respuesta, con la fecha en ISO-8601 y sin `updatedAt`.
 */
export function toMovimientoInsumoResponseDto(
  entidad: MovimientoInsumoEntity,
): MovimientoInsumoResponseDto {
  return {
    id: entidad.id,
    insumoId: entidad.insumoId,
    tipo: entidad.tipo,
    cantidad: entidad.cantidad,
    usuarioId: entidad.usuarioId,
    motivo: entidad.motivo,
    equipoId: entidad.equipoId,
    sectorId: entidad.sectorId,
    itemCompraId: entidad.itemCompraId,
    createdAt: entidad.createdAt.toISOString(),
  };
}

/**
 * Convierte el resultado de `ConsultarStockInsumoUseCase` al shape de respuesta
 * HTTP.
 *
 * Se escribe campo por campo aunque hoy los dos tipos coincidan: el mapeo
 * explícito es lo que hace que un campo nuevo en la capa de aplicación no se
 * publique solo, sin que nadie decida publicarlo.
 *
 * @param stock Saldo del insumo con su punto de reposición y su estado ya resuelto.
 * @returns El DTO de respuesta.
 */
export function toStockInsumoResponseDto(stock: StockDeInsumo): StockInsumoResponseDto {
  return {
    insumoId: stock.insumoId,
    stock: stock.stock,
    stockMinimo: stock.stockMinimo,
    estadoReposicion: stock.estadoReposicion,
  };
}
