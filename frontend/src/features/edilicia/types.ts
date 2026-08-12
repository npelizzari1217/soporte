/**
 * Tipos del dominio Edilicia — espejo de los DTOs reales del backend
 * (`backend/src/reparaciones/interface/dtos/reparaciones.dto.ts`).
 *
 * `GET /reparaciones` ahora embebe `subtareas[]` por ítem (item 1
 * backend-gaps — cierra G7): `ReparacionesList` pasa esa lista real como
 * dato inicial a `SubtareasDialog`, que la usa para sembrar su cache local
 * (`["subtareas", reparacionId]`) — las mutaciones (agregar/completar/
 * eliminar) siguen reflejándose ahí optimistamente. `porcentajeAvance` (en
 * el ticket edilicio) sigue siendo la fuente confiable de avance agregado.
 */

/** Shape unificado de un ticket edilicio (`TicketEdiliciaConTicketResponseDto`). `id` = id del satélite `ticket_edilicia`. */
export interface TicketEdilicia {
  id: string;
  ticketId: string;
  numero: string;
  titulo: string;
  estadoId: string;
  /** Ubicación física de la reparación, texto libre (ex-catálogo Ubicacion removido). */
  ubicacion: string | null;
  personalAsignadoId: string | null;
  porcentajeAvance: number;
  createdAt: string;
  updatedAt: string;
}

/** Ítem del listado de `GET /reparaciones` (extiende `TicketEdilicia` + subtareas embebidas). */
export interface ReparacionListItem extends TicketEdilicia {
  subtareas: SubtareaEdilicia[];
}

export interface SubtareaEdilicia {
  id: string;
  ticketEdiliciaId: string;
  descripcion: string;
  completada: boolean;
  completadaEn: string | null;
  completadaPorId: string | null;
  orden: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrearTicketEdilicioDto {
  titulo: string;
  descripcion?: string | null;
  prioridadId: string;
  /** Texto libre, opcional. */
  ubicacion?: string | null;
}

export interface CreateSubtareaDto {
  descripcion: string;
  orden?: number;
}
