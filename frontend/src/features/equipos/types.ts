/**
 * Tipos del dominio Equipos IT — espejo de los DTOs reales del backend
 * (`backend/src/equipos/interface/dtos/equipos.dto.ts`).
 *
 * `GET /equipos/:id` ahora embebe `componentes[]` (item 1 backend-gaps —
 * cierra G7): `EquipoDetailView` pasa esa lista real como dato inicial a
 * `EquipoComponentesSection`, que la usa para sembrar su cache local
 * (`["componentes", equipoId]`) — las mutaciones (agregar/eliminar) siguen
 * reflejándose ahí optimistamente.
 *
 * PR6 (sdd/tipos-componente-master): `tipoComponenteId` desaparece —
 * `Componente` espeja `ComponenteResponseDto` (`tipoComponenteCodigo`,
 * shape básico sin enriquecer). El componente EMBEBIDO en
 * `EquipoDetalle.componentes` espeja `ComponenteConTipoResponseDto`
 * (`ComponenteConTipo`): además trae `tipoNombre`/`tipoActivo` resueltos
 * del catálogo MASTER — el único lugar confiable para mostrar el nombre de
 * un componente ya asignado (soporta tipos dados de baja, que el selector
 * de alta NO lista). El selector `TipoComponente` (catálogo de activos,
 * `GET /equipos/tipos-componente`) ya no expone `id` ni `activo` (PR3).
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
  tipoComponenteCodigo: string;
  descripcion: string | null;
  numeroSerie: string | null;
  capacidad: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Componente EMBEBIDO en `GET /equipos/:id` — `Componente` + `tipoNombre`/
 * `tipoActivo` resueltos en batch desde el catálogo MASTER
 * (`ComponenteConTipoResponseDto`).
 */
export interface ComponenteConTipo extends Componente {
  tipoNombre: string | null;
  tipoActivo: boolean;
}

/** Shape de `GET /equipos/:id` (`EquipoDetalleResponseDto`, item 1 — cierra G7). */
export interface EquipoDetalle extends Equipo {
  componentes: ComponenteConTipo[];
}

/** Catálogo READ-ONLY de tipos de componente ACTIVOS (`GET /equipos/tipos-componente`, PR3: sin `id` ni `activo`). */
export interface TipoComponente {
  codigo: string;
  nombre: string;
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
  tipoComponenteCodigo: string;
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
