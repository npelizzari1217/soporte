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
