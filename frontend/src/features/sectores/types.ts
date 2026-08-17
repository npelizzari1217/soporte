/**
 * Tipos del catálogo Sectores — espejo de los DTOs reales del backend
 * (`backend/src/sectores/interface/dtos/sectores.dto.ts`, WU-07/WU-31,
 * `compras-tres-etapas-y-sectores` R10).
 */

/** Espejo de `SectorResponseDto`. */
export interface Sector {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body de `POST /sectores` (`CreateSectorDto`). */
export interface CreateSectorDto {
  codigo: string;
  nombre: string;
}

/** Body de `PATCH /sectores/:id` (`EditSectorDto`) — PATCH parcial. */
export interface EditSectorDto {
  codigo?: string;
  nombre?: string;
}

/** Body de `PATCH /sectores/:id/estado` (`CambiarEstadoActivoSectorDto`). */
export interface CambiarEstadoActivoSectorDto {
  activo: boolean;
}
