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
  /**
   * Cantidad de comentarios de la reparación; `0` cuando no tiene ninguno.
   *
   * Los comentarios NO viajan embebidos (a diferencia de las subtareas): el
   * listado trae sólo el conteo, que el backend resuelve en una consulta
   * agregada por página. El contenido se pide aparte al abrir el diálogo.
   */
  cantidadComentarios: number;
  /**
   * `true` si hay al menos una compra vinculada cuyo grupo de estado
   * derivado es `ACTIVAS` (sdd/reparacion-bloqueada-por-compra). Se deriva
   * en el backend a partir de `comprasQueBloquean`; nunca es una marca
   * manual y NO afecta `porcentajeAvance`.
   */
  bloqueada: boolean;
  /**
   * Las compras que HOY frenan la reparación (subset mínimo: `id` + `numero`,
   * sin montos ni ítems). `[]` cuando `bloqueada` es `false`. El chip del
   * listado NO muestra la cantidad (decisión de producto): este campo existe
   * para poder abrir/navegar hacia esas compras, no para contarlas.
   */
  comprasQueBloquean: { id: string; numero: string }[];
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

/**
 * Comentario a nivel de REPARACIÓN (`ComentarioReparacionResponseDto`).
 *
 * A diferencia de las subtareas, los comentarios SÍ tienen `GET` propio
 * (`GET /reparaciones/:id/comentarios`, más nuevo primero) — no viajan
 * embebidos en `GET /reparaciones`.
 *
 * Sin `updatedAt`/`deletedAt`: la tabla es append-only, los comentarios no se
 * editan ni se borran. `autorNombre`/`autorApellido` los resuelve el backend
 * contra la base MASTER y viajan `null` si el usuario fue dado de baja — en
 * ese caso la UI cae al `autorId`.
 */
export interface ComentarioReparacion {
  id: string;
  ticketEdiliciaId: string;
  texto: string;
  autorId: string;
  autorNombre: string | null;
  autorApellido: string | null;
  createdAt: string;
}

export interface CrearComentarioReparacionDto {
  texto: string;
}
