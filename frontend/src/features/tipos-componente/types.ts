/**
 * Tipos del catálogo MASTER de tipos de componente — ABM exclusivo de ROOT
 * (PR5, sdd/tipos-componente-master). Espejo de
 * `backend/src/tipos-componente/interface/dtos/tipos-componente.dto.ts`
 * (`TipoComponenteResponseDto`, `CrearTipoComponenteDto`,
 * `RenombrarTipoComponenteDto`).
 */

/** Respuesta de `GET /tipos-componente/admin`, `POST /tipos-componente`, etc. */
export interface TipoComponente {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

/** Body de `POST /tipos-componente`. */
export interface CrearTipoComponenteDto {
  codigo: string;
  nombre: string;
}

/**
 * Body de `PATCH /tipos-componente/:id`. `codigo` es INMUTABLE — el backend
 * no lo acepta en este DTO, por eso tampoco existe acá.
 */
export interface RenombrarTipoComponenteDto {
  nombre: string;
}
