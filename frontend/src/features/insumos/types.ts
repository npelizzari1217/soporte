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
