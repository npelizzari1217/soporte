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
 * Espejo de `FamiliaInsumoResponseDto`, RECORTADO con el mismo criterio que
 * `Insumo`: solo lo que la pantalla consume hoy, que es resolver el
 * `familiaId` del listado a un nombre legible.
 *
 * `codigo`, `activo` y los timestamps quedan afuera a propósito. Cuando el ABM
 * de familias los muestre, se agregan acá con su forma completa; declararlos
 * ahora obligaría a cada fixture a construirlos sin que ningún assert los mire.
 */
export interface FamiliaInsumo {
  id: string;
  nombre: string;
}

/**
 * Espejo de `UnidadMedidaResponseDto`, recortado con el mismo criterio que
 * `FamiliaInsumo`. Las dos respuestas tienen el MISMO shape en el backend, pero
 * se declaran por separado: son catálogos distintos, y un alias compartido haría
 * que agregarle un campo a uno se lo agregue al otro sin que nadie lo decida.
 */
export interface UnidadMedida {
  id: string;
  nombre: string;
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
