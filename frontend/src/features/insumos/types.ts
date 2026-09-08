/**
 * Tipos del catálogo de Insumos — espejo de los DTO reales del backend
 * (`backend/src/insumos/interface/dtos/insumos.dto.ts`).
 */

/**
 * Espejo de `InsumoResponseDto`, RECORTADO a los campos que el frontend
 * consume hoy: el catálogo se lee para poblar un `<select>`.
 *
 * `codigosAlternativos` y `compatibilidad` quedan deliberadamente afuera. Son
 * listas de objetos anidados que ninguna pantalla actual muestra, y declararlas
 * obligaría a cada fixture a construirlas sin que ningún assert las mire.
 * Cuando una pantalla las necesite, se agregan acá con su forma completa.
 */
export interface Insumo {
  id: string;
  codigo: string;
  nombre: string;
  familiaId: string;
  unidadMedidaId: string;
  stockMinimo: number | null;
  /**
   * `false` es DESHABILITADO, no eliminado: `GET /insumos` devuelve los
   * insumos vigentes habilitados y deshabilitados por igual, y el backend
   * acepta que un ítem de compra apunte a uno deshabilitado.
   */
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body de `POST /insumos` (`CreateInsumoDto`), RECORTADO al scope de esta
 * entrega: sin `codigosAlternativos`/`compatibilidad`. El backend trata
 * "ausente" como "lista vacía" para las dos, así que omitirlas es
 * equivalente a mandarlas vacías — nunca se manda `[]` ni `null` a propósito
 * (`null` es rechazo directo, 400, `@ValidateIf`). Se gestionan desde la
 * ficha en una entrega posterior.
 */
export interface CreateInsumoDto {
  codigo: string;
  nombre: string;
  familiaId: string;
  unidadMedidaId: string;
  /** Ausente es "sin punto de reposición definido", que NO es cero. */
  stockMinimo?: number;
}

/**
 * Body de `PATCH /insumos/:id` (`EditInsumoDto`) — PATCH parcial, mismo
 * recorte de scope que `CreateInsumoDto`. `stockMinimo` es la ÚNICA
 * excepción de esta entrega donde `null` SÍ viaja: es la orden explícita de
 * borrar el punto de reposición (`undefined` deja el campo intacto).
 */
export interface EditInsumoDto {
  codigo?: string;
  nombre?: string;
  familiaId?: string;
  unidadMedidaId?: string;
  stockMinimo?: number | null;
}

/** Body de `PATCH /insumos/:id/estado` (`CambiarEstadoActivoInsumoDto`). */
export interface CambiarEstadoActivoInsumoDto {
  activo: boolean;
}

/**
 * Espejo de `FamiliaInsumoResponseDto`
 * (`backend/src/insumos/interface/dtos/familias-insumo.dto.ts`). Forma
 * completa, con `codigo`/`activo`/timestamps: el ABM del catálogo (Admin >
 * Insumos) los edita y los muestra.
 */
export interface FamiliaInsumo {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body de `POST /familias-insumo` (`CreateFamiliaInsumoDto`). */
export interface CreateFamiliaInsumoDto {
  codigo: string;
  nombre: string;
}

/** Body de `PATCH /familias-insumo/:id` (`EditFamiliaInsumoDto`) — PATCH parcial. */
export interface EditFamiliaInsumoDto {
  codigo?: string;
  nombre?: string;
}

/** Body de `PATCH /familias-insumo/:id/estado` (`CambiarEstadoActivoFamiliaInsumoDto`). */
export interface CambiarEstadoActivoFamiliaInsumoDto {
  activo: boolean;
}

/**
 * Espejo de `UnidadMedidaResponseDto`
 * (`backend/src/insumos/interface/dtos/unidades-medida.dto.ts`). Forma
 * completa, con `codigo`/`activo`/timestamps: el ABM del catálogo (Admin >
 * Insumos) los edita y los muestra. Las dos respuestas tienen el MISMO shape
 * en el backend, pero se declaran por separado: son catálogos distintos, y un
 * alias compartido haría que agregarle un campo a uno se lo agregue al otro
 * sin que nadie lo decida.
 */
export interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body de `POST /unidades-medida` (`CreateUnidadMedidaDto`). */
export interface CreateUnidadMedidaDto {
  codigo: string;
  nombre: string;
}

/** Body de `PATCH /unidades-medida/:id` (`EditUnidadMedidaDto`) — PATCH parcial. */
export interface EditUnidadMedidaDto {
  codigo?: string;
  nombre?: string;
}

/** Body de `PATCH /unidades-medida/:id/estado` (`CambiarEstadoActivoUnidadMedidaDto`). */
export interface CambiarEstadoActivoUnidadMedidaDto {
  activo: boolean;
}

/**
 * Catálogo CERRADO de estados de reposición, espejo exacto de
 * `ESTADOS_REPOSICION_INSUMO` del backend
 * (`backend/src/insumos/domain/entities/estado-reposicion-insumo.ts`).
 *
 * Se declara como array `as const` y la unión se DERIVA de él, que es la forma
 * con la que este repo modela un conjunto cerrado de valores: así el listado de
 * etiquetas de la ficha puede tiparse como `Record<EstadoReposicionInsumo, …>`
 * y un estado nuevo rompe el typecheck en vez de renderizar vacío.
 *
 * Son TRES y no un booleano a propósito: `stockMinimo` es `number | null`, y el
 * `null` significa "sin punto de reposición definido", que NO es lo mismo que
 * "tiene punto y está por encima". Colapsarlos escondería justo los insumos a
 * los que falta configurarles el punto.
 */
export const ESTADOS_REPOSICION_INSUMO = [
  "SIN_PUNTO_DEFINIDO",
  "SUFICIENTE",
  "BAJO_MINIMO",
] as const;

/** Estado de reposición de un insumo, derivado de `ESTADOS_REPOSICION_INSUMO`. */
export type EstadoReposicionInsumo = (typeof ESTADOS_REPOSICION_INSUMO)[number];

/**
 * Espejo de `StockInsumoResponseDto` — lo que devuelve
 * `GET /insumos/:insumoId/stock`.
 *
 * `estadoReposicion` llega YA RESUELTO y la ficha solo lo traduce a una
 * etiqueta: la regla de cuándo hay que reponer es de negocio (`evaluarReposicion`
 * compara en centésimas enteras, con `<=`, para que el punto en cero avise), y
 * repetirla acá sería una SEGUNDA definición de "bajo el mínimo" que puede
 * discrepar de la del servidor sin que nadie se entere.
 *
 * `stockMinimo` viaja igual, además del estado, porque la ficha lo muestra:
 * "quedan 3, el punto es 10" dice bastante más que "reponer".
 */
export interface StockInsumo {
  insumoId: string;
  /** Saldo actual derivado de la bitácora. Es una FOTO: sirve para mostrar, no para decidir. */
  stock: number;
  /** Punto de reposición del insumo, o `null` si no tiene uno definido. */
  stockMinimo: number | null;
  /** Lectura del saldo contra el punto de reposición, resuelta por el backend. */
  estadoReposicion: EstadoReposicionInsumo;
}

/**
 * Catálogo CERRADO de tipos de movimiento, espejo exacto de
 * `TIPOS_MOVIMIENTO_INSUMO` del backend
 * (`backend/src/insumos/domain/entities/tipo-movimiento-insumo.ts`).
 *
 * Se declara como array `as const` y la unión se DERIVA de él, igual que
 * `ESTADOS_REPOSICION_INSUMO`: así la tabla de etiquetas de la bitácora puede
 * tiparse como `Record<TipoMovimientoInsumo, …>` y un quinto tipo rompe el
 * typecheck en vez de renderizar una celda vacía.
 *
 * Son CUATRO y no dos con signo porque el ajuste no es una entrada ni una
 * salida: corrige la existencia contra un conteo físico, y confundirlo con un
 * movimiento real de mercadería falsearía la lectura de la bitácora.
 */
export const TIPOS_MOVIMIENTO_INSUMO = [
  "ENTRADA",
  "SALIDA",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO",
] as const;

/** Tipo de un asiento de la bitácora, derivado de `TIPOS_MOVIMIENTO_INSUMO`. */
export type TipoMovimientoInsumo = (typeof TIPOS_MOVIMIENTO_INSUMO)[number];

/**
 * Las dos direcciones que puede llevar el discriminador `tipo` del ajuste
 * (`RegistrarAjusteInsumoHttpDto`, backend). Se DERIVA de `TipoMovimientoInsumo`
 * con `Extract`, nunca se redeclara: si esos dos nombres cambiaran en
 * `TIPOS_MOVIMIENTO_INSUMO`, este tipo rompe el typecheck en vez de quedar
 * desincronizado en silencio.
 */
export type TipoAjusteInsumo = Extract<TipoMovimientoInsumo, "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO">;

/**
 * Espejo de `MovimientoInsumoResponseDto` — un asiento de la bitácora que
 * devuelve `GET /insumos/:insumoId/movimientos`.
 *
 * **`cantidad` SIEMPRE es positiva**, y el backend lo garantiza con un CHECK:
 * la dirección del asiento la dice `tipo`, nunca el número. Cualquier signo que
 * la pantalla muestre tiene que derivarse del tipo — inventarlo a partir de la
 * cantidad sería una segunda definición de "salida" que puede discrepar de la
 * del servidor sin que nadie se entere.
 *
 * **`itemCompraId` es el punto de esta lectura.** Con valor, el asiento nació de
 * la recepción de una compra; en `null`, fue una carga manual. Esa entrada
 * automática viaja deliberadamente SIN `motivo` —el origen ya está dicho con un
 * dato estructurado, no con una frase—, así que sin este campo los dos casos se
 * ven idénticos en pantalla.
 */
export interface MovimientoInsumo {
  id: string;
  insumoId: string;
  tipo: TipoMovimientoInsumo;
  /** Magnitud del asiento, siempre positiva. El signo lo da `tipo`. */
  cantidad: number;
  /** Quién firmó el asiento. Es un identificador: la pantalla NUNCA lo muestra crudo. */
  usuarioId: string;
  motivo: string | null;
  equipoId: string | null;
  sectorId: string | null;
  /** Ítem de compra cuya recepción originó el asiento; `null` si la carga fue manual. */
  itemCompraId: string | null;
  createdAt: string;
}

/**
 * Espejo de `ListarMovimientosInsumoResponseDto`, mismo shape que
 * `ListarComprasResponse`.
 *
 * **`total` es el universo COMPLETO del insumo, no el tamaño de la página**: es
 * lo único con lo que el paginador puede saber cuántas páginas hay. Derivarlo
 * de `items.length` daría siempre una sola página y escondería toda la historia
 * anterior del insumo.
 *
 * `pagina` y `porPagina` vuelven porque son la ventana EFECTIVA —la que el
 * servidor aplicó, no la que se pidió—, así que el paginador se dibuja con
 * ellas y no con el estado local que originó la request.
 */
export interface ListarMovimientosInsumoResponse {
  items: MovimientoInsumo[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Ventana pedida a `GET /insumos/:insumoId/movimientos`. Ausente = default del servidor. */
export interface MovimientosInsumoFiltros {
  pagina?: number;
  porPagina?: number;
}
