/**
 * Tipos del catálogo MASTER de ciclos — ABM exclusivo de ROOT
 * (sdd/ciclos-abm-root). Espejo de
 * `backend/src/clientes/interface/dtos/ciclo-vigente.dto.ts`.
 *
 * Distinto de `features/ciclos` (que consume el mismo catálogo pero solo
 * para LEER ciclos activos y adoptarlos desde el lado del tenant,
 * `/admin/ciclos`) — acá se agrega alta/edición/baja del catálogo en sí.
 */

/** Respuesta de `POST /ciclos-vigentes` y `PATCH /ciclos-vigentes/:id`. */
export interface CicloVigente {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
}

/**
 * Respuesta de `GET /ciclos-vigentes/admin` — agrega `eliminado` (soft-delete)
 * para que la tabla ABM pueda deshabilitar editar/eliminar sobre ciclos ya
 * dados de baja.
 */
export interface CicloVigenteAdmin extends CicloVigente {
  eliminado: boolean;
}

export interface CreateCicloVigenteDto {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

/** PATCH semántico — campos ausentes no se tocan. */
export interface EditarCicloVigenteDto {
  nombre?: string;
  fechaInicio?: string;
  fechaFin?: string;
}
