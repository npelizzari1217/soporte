/**
 * Tipos del catálogo de respuestas predefinidas — espejo de los DTOs del backend
 * (`backend/src/respuestas-predefinidas/interface/dtos/respuestas-predefinidas.dto.ts`,
 * roadmap segunda etapa, punto 4).
 */

/** Espejo de `RespuestaPredefinidaResponseDto`. */
export interface RespuestaPredefinida {
  id: string;
  titulo: string;
  texto: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body de `POST /respuestas-predefinidas`. */
export interface CreateRespuestaPredefinidaDto {
  titulo: string;
  texto: string;
}

/** Body de `PATCH /respuestas-predefinidas/:id` — PATCH parcial. */
export interface EditRespuestaPredefinidaDto {
  titulo?: string;
  texto?: string;
}

/** Body de `PATCH /respuestas-predefinidas/:id/estado`. */
export interface CambiarEstadoActivoRespuestaPredefinidaDto {
  activo: boolean;
}
