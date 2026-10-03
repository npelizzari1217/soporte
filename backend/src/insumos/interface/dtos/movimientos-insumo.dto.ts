/**
 * DTOs de entrada/salida de `MovimientosInsumoController` — la bitácora de
 * existencias y la consulta de stock.
 *
 * **Ningún tope de un campo del ASIENTO declara su número: todos lo IMPORTAN
 * de `MovimientoInsumoEntity`**, que es la autoridad del límite. Acá el tope
 * solo se adelanta al borde HTTP para devolver un 400 que nombra el campo, en
 * vez de la violación de precondición que la entidad lanza como `throw` —y
 * que, sin este espejo, llegaría al usuario como un 500 crudo: es la clase 1
 * de fallo de topes que el `AGENTS.md` de este repo describe—.
 *
 * La excepción son los topes de PAGINACIÓN (`@Min(1)`, `@Max(100)` en
 * `ListarMovimientosInsumoQueryDto`), que sí van con literales: no espejan
 * ninguna regla de negocio ni ninguna columna, sino el tamaño de página que el
 * borde acepta. Mismo criterio y mismo número que `ListarComprasQueryDto`,
 * `ListTicketsQueryDto` y `ListKbArticulosQueryDto` —este último nombra sus
 * campos `page`/`pageSize`, así que comparte el criterio y no el molde—. No
 * hay constante de dominio que importar porque no hay dominio del otro lado.
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
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EsNumeroConDecimales } from '../../../shared/interface/validators/es-numero-con-decimales';
import { EsSerialDeUnidad } from '../validators/es-serial-de-unidad';
import {
  MovimientoInsumoEntity,
  MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES,
  MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA,
  MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
  normalizarMotivoMovimiento,
} from '../../domain/entities/movimiento-insumo.entity';
import {
  CondicionStock,
  CONDICIONES_STOCK,
  TipoAjusteInsumo,
  TipoMovimientoInsumo,
  TIPOS_AJUSTE_INSUMO,
} from '../../domain/entities/tipo-movimiento-insumo';
import { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import { EstadoReposicionInsumo } from '../../domain/entities/estado-reposicion-insumo';
import { StockDeInsumo } from '../../application/use-cases/consultar-stock-insumo.use-case';
import { ListarMovimientosInsumoResult } from '../../application/use-cases/listar-movimientos-insumo.use-case';

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
export function transformarMotivo({ value }: { value: unknown }): unknown {
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
/** Tope de seriales por request: el mismo que el de piezas de una entrada por lote. */
export const MOVIMIENTO_INSUMO_SERIALES_MAX = 100;

/**
 * Recorta cada serial del arreglo; deja intacto lo que no es un arreglo de
 * strings para que `@IsArray`/`@EsSerialDeUnidad` reporten el error de forma.
 *
 * @param value Valor crudo del campo `seriales`.
 * @returns El arreglo con cada string recortado, o el valor intacto.
 */
export function transformarSeriales({ value }: { value: unknown }): unknown {
  return Array.isArray(value)
    ? value.map((serial: unknown) => (typeof serial === 'string' ? serial.trim() : serial))
    : value;
}

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
   * - El tope de decimales no es una formalidad: Postgres NO falla ante un
   *   tercer decimal en un `DECIMAL(10,2)`, lo REDONDEA en silencio. Acá ese
   *   redondeo no se queda en una fila: se acumula sobre el stock, que ES la
   *   suma de todas ellas. `@EsNumeroConDecimales` además rechaza `NaN` e
   *   `Infinity`, que no caen en ninguna comparación de rango; ver su JSDoc
   *   para por qué cuenta los decimales por su cuenta en vez de delegar en
   *   `@IsNumber({ maxDecimalPlaces })`.
   * - `@Max` importa el techo de NEGOCIO, no el límite físico de la columna.
   */
  @EsNumeroConDecimales(MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES)
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

  /**
   * Condición del stock que se mueve. OPCIONAL: ausente equivale a `NUEVO`, y
   * ese default lo resuelve cada caso de uso, su único dueño. El catálogo se
   * importa del dominio; un valor fuera de él es un 400 que nombra el campo.
   * Que `USADO` solo se admita en repuestos es una regla de negocio (422), no
   * de forma. Lo hereda `RegistrarAjusteInsumoHttpDto`.
   *
   * La recepción de una compra NO tiene este campo: no hay DTO HTTP de
   * recepción que lo declare, y con `whitelist: true` un `condicion` sobrante
   * se descarta; la recepción siempre asienta `NUEVO`.
   */
  @IsOptional()
  @IsIn(CONDICIONES_STOCK)
  condicion?: CondicionStock;

  /**
   * Seriales de las unidades que ENTRAN (entrada y ajuste positivo de un insumo
   * `SERIE`). Cada uno se recorta y se valida por su largo recortado Y
   * normalizado (1 a 255): la entidad lanza ante el desborde, y sin este espejo
   * saldría un 500. Que el insumo admita seriales o que cuadren con la cantidad
   * es regla de negocio (422), no de forma.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MOVIMIENTO_INSUMO_SERIALES_MAX)
  @Transform(transformarSeriales)
  @EsSerialDeUnidad({ each: true })
  seriales?: string[];

  /**
   * Unidad que SALE (salida y ajuste negativo de un insumo `SERIE`). Viaja en
   * el body, así que necesita `@IsUUID`: sin él un id mal formado llegaría a
   * Postgres como `22P02` y saldría un 500.
   */
  @IsOptional()
  @IsUUID()
  unidadId?: string;
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
  /** Condición del stock que movió el asiento. */
  condicion: CondicionStock;
  /** Unidad por número de serie que movió el asiento; `null` si fue por cantidad. */
  unidadId: string | null;
  /** Serial de esa unidad hoy (puede ser `null` si quedó pendiente); `null` si fue por cantidad. */
  numeroSerie: string | null;
  createdAt: string;
}

/**
 * Response de una entrada o un ajuste: el PRIMER asiento con la forma de
 * siempre (los consumidores previos siguen leyéndolo), más `movimientos` con
 * TODOS los asentados —uno por unidad en un insumo `SERIE`—.
 */
export interface MovimientosRegistradosResponseDto extends MovimientoInsumoResponseDto {
  movimientos: MovimientoInsumoResponseDto[];
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
  /** Total: la suma de los saldos de todas las condiciones. */
  stock: number;
  /** Saldo por condición; la reposición se evalúa sobre `NUEVO`. */
  saldos: Record<CondicionStock, number>;
  /** Si el insumo admite stock USADO (familia vigente de repuestos), ya resuelto por el backend. */
  admiteUsado: boolean;
  /** Si devolver o recuperar una pieza admite USADO (exención G2: familia no vigente sí, no repuesto no). */
  admiteUsadoEnReingreso: boolean;
  stockMinimo: number | null;
  estadoReposicion: EstadoReposicionInsumo;
  /** Cómo se lleva el insumo: `NINGUNO` (por cantidad) o `SERIE` (por unidad). */
  seguimiento: SeguimientoInsumo;
  /** Unidades `SERIE` en depósito sin número de serie cargado; `0` en `NINGUNO`. */
  pendientesDeSerie: number;
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
    condicion: entidad.condicion,
    unidadId: entidad.unidadId,
    numeroSerie: entidad.numeroSerie,
    createdAt: entidad.createdAt.toISOString(),
  };
}

/**
 * Convierte los asientos de una entrada o un ajuste al shape de respuesta: el
 * primero con la forma de siempre y la lista completa en `movimientos`.
 *
 * @param entidades Asientos registrados; al menos uno.
 * @returns El DTO de respuesta.
 */
export function toMovimientosRegistradosResponseDto(
  entidades: MovimientoInsumoEntity[],
): MovimientosRegistradosResponseDto {
  const movimientos = entidades.map(toMovimientoInsumoResponseDto);
  return { ...movimientos[0], movimientos };
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
    saldos: { NUEVO: stock.saldos.NUEVO, USADO: stock.saldos.USADO },
    admiteUsado: stock.admiteUsado,
    admiteUsadoEnReingreso: stock.admiteUsadoEnReingreso,
    stockMinimo: stock.stockMinimo,
    estadoReposicion: stock.estadoReposicion,
    seguimiento: stock.seguimiento,
    pendientesDeSerie: stock.pendientesDeSerie,
  };
}

/**
 * Query params de `GET /insumos/:insumoId/movimientos`. Mismo molde que
 * `ListarComprasQueryDto`: es la forma de pedir una página en este
 * repositorio, y una segunda forma sería una diferencia que nadie decidió.
 *
 * **El `@Type(() => Number)` no es decorativo**: un query param llega SIEMPRE
 * como texto, y sin la conversión previa `@IsInt` rechazaría toda paginación
 * válida — el listado quedaría con un 400 permanente. `class-transformer` corre
 * la transformación ANTES de que `class-validator` mida nada, así que los tres
 * decoradores de abajo evalúan el número ya convertido.
 *
 * **Los dos `@Min(1)` son reglas de CORRECTITUD, no de higiene**, y atajan dos
 * fallas distintas, las dos silenciosas de distinta manera:
 *
 * - `porPagina` viaja hasta el `take` de Prisma, y **un `take` negativo
 *   INVIERTE el orden**: la respuesta serían los movimientos más VIEJOS
 *   presentados como los más nuevos, con un 200 de cara limpia, sin error y sin
 *   log. Es exactamente la clase de falla que el `AGENTS.md` de este repo
 *   describe como la peor —el resultado equivocado sin síntoma—.
 * - `pagina` se traduce a `offset: (pagina - 1) * porPagina` en el caso de uso,
 *   así que una página menor a 1 da un `skip` NEGATIVO y Prisma revienta con un
 *   error de validación del cliente: un **500 crudo** que no nombra el campo
 *   que vino mal.
 *
 * Una miente y la otra explota; las dos las ataja el mismo `@Min(1)`, y el
 * borde es la única capa que puede devolver un 400 que nombre el parámetro.
 *
 * El `@Max(100)` es el tope de página, igual que en compras: acota lo que una
 * sola respuesta puede traer de una bitácora que crece con cada movimiento.
 *
 * Los dos son OPCIONALES y su ausencia no es un error: los defaults los
 * resuelve `ListarMovimientosInsumoUseCase`, que es su único dueño.
 */
export class ListarMovimientosInsumoQueryDto {
  /** Página 1-indexed. Ausente = la primera, por el default del caso de uso. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  /** Tamaño de página. Ausente = el default del caso de uso. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}

/**
 * Response de `GET /insumos/:insumoId/movimientos` — envoltorio con la
 * metadata de paginación, mismo shape que `ListarComprasResponseDto`.
 *
 * **`total` es el universo COMPLETO del insumo, no el tamaño de la página**:
 * es lo que le permite al paginador saber cuántas páginas hay, y sigue siendo
 * correcto cuando `items` vuelve vacío porque el offset se pasó del final.
 * `items.length` responde otra pregunta.
 *
 * `pagina` y `porPagina` viajan de vuelta porque son la ventana EFECTIVA, ya
 * con los defaults del caso de uso aplicados: sin ellas, quien no mandó nada no
 * tendría cómo saber sobre qué ventana está mirando esas filas.
 */
export interface ListarMovimientosInsumoResponseDto {
  items: MovimientoInsumoResponseDto[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * Convierte el resultado paginado de `ListarMovimientosInsumoUseCase` al shape
 * de respuesta HTTP.
 *
 * Cada fila pasa por `toMovimientoInsumoResponseDto`, el MISMO mapper que usan
 * las tres rutas de escritura, y no por una copia: dos mapeos del asiento
 * derivarían, y el que se olvidara de un campo nuevo lo dejaría de publicar
 * solo en el listado. Es además el que publica `itemCompraId`, que es el dato
 * que distingue una entrada nacida de una recepción de una carga manual.
 *
 * @param resultado Página de movimientos con el total del insumo y la ventana efectiva.
 * @returns El DTO de respuesta, con cada asiento ya mapeado.
 */
export function toListarMovimientosInsumoResponseDto(
  resultado: ListarMovimientosInsumoResult,
): ListarMovimientosInsumoResponseDto {
  return {
    items: resultado.items.map(toMovimientoInsumoResponseDto),
    total: resultado.total,
    pagina: resultado.pagina,
    porPagina: resultado.porPagina,
  };
}
