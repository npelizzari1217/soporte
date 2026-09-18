/**
 * Tipos del catálogo de Modelos de Equipo — espejo de los DTO reales del
 * backend (`backend/src/insumos/interface/dtos/modelos-equipo.dto.ts`).
 */

/**
 * Espejo de `ModeloEquipoResponseDto`. Sin `codigo`: la identidad es el PAR
 * `marca` + `modelo` (`backend/src/insumos/domain/entities/modelo-equipo.entity.ts:10-14`,
 * `UNIQUE (marca, modelo)` en `schema.prisma`), a diferencia de
 * `FamiliaInsumo`/`UnidadMedida`, que sí tienen `codigo`.
 */
export interface ModeloEquipo {
  id: string;
  /** Normalizada a MAYÚSCULA por el backend (`normalizarMarcaModeloEquipo`). */
  marca: string;
  /** Solo `trim()`: se muestra tal como la escribió el fabricante ("LaserJet Pro M404"). */
  modelo: string;
  /**
   * `false` es DESHABILITADO, no eliminado: no hay borrado duro para este
   * catálogo (`modelos_equipo` referenciada por `equipos_informaticos` y
   * `insumos_modelo_equipo`) y `GET /modelos-equipo` devuelve ambos estados.
   */
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body de `POST /modelos-equipo` (`CreateModeloEquipoDto`). */
export interface CreateModeloEquipoDto {
  marca: string;
  modelo: string;
}

/** Body de `PATCH /modelos-equipo/:id` (`EditModeloEquipoDto`) — PATCH parcial. */
export interface EditModeloEquipoDto {
  marca?: string;
  modelo?: string;
}

/** Body de `PATCH /modelos-equipo/:id/estado` (`CambiarEstadoActivoModeloEquipoDto`). */
export interface CambiarEstadoActivoModeloEquipoDto {
  activo: boolean;
}
