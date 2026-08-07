/**
 * Tipos del dominio Equipos IT — espejo de los DTOs reales del backend
 * (`backend/src/equipos/interface/dtos/equipos.dto.ts`).
 *
 * `GET /equipos/:id` ahora embebe `componentes[]` (item 1 backend-gaps —
 * cierra G7): `EquipoDetailView` pasa esa lista real como dato inicial a
 * `EquipoComponentesSection`, que la usa para sembrar su cache local
 * (`["componentes", equipoId]`) — las mutaciones (agregar/eliminar) siguen
 * reflejándose ahí optimistamente.
 */

export interface Equipo {
  id: string;
  nombre: string;
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaAdquisicion: string | null;
  ubicacionId: string | null;
  asignadoAId: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Componente {
  id: string;
  equipoId: string;
  tipoComponenteId: string;
  descripcion: string | null;
  numeroSerie: string | null;
  capacidad: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape de `GET /equipos/:id` (`EquipoDetalleResponseDto`, item 1 — cierra G7). */
export interface EquipoDetalle extends Equipo {
  componentes: Componente[];
}

export interface TipoComponente {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface CreateEquipoDto {
  nombre: string;
  numeroSerie?: string | null;
  marca?: string | null;
  modelo?: string | null;
  fechaAdquisicion?: string | null;
  ubicacionId?: string | null;
}

export interface EditarEquipoDto {
  nombre?: string;
  numeroSerie?: string | null;
  marca?: string | null;
  modelo?: string | null;
  fechaAdquisicion?: string | null;
  ubicacionId?: string | null;
}

export interface AsignarEquipoDto {
  asignadoAId?: string | null;
}

export interface CreateComponenteDto {
  tipoComponenteId: string;
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}

/** Shape unificado del ticket de soporte (`TicketSoporteConTicketResponseDto`). `equipoId` OPCIONAL — vínculo ticket↔equipo. */
export interface TicketSoporte {
  id: string;
  ticketId: string;
  numero: string;
  titulo: string;
  estadoId: string;
  equipoId: string | null;
  descripcionProblema: string | null;
  solucionAplicada: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrearTicketSoporteDto {
  titulo: string;
  descripcion?: string | null;
  prioridadId: string;
  equipoId?: string | null;
  descripcionProblema?: string | null;
}
