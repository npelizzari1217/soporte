/**
 * Tipos del dominio Edilicia — espejo de los DTOs reales del backend
 * (`backend/src/reparaciones/interface/dtos/reparaciones.dto.ts`).
 *
 * `GET /reparaciones` embebe `subtareas[]` por ítem. Desde
 * odd/tareas-con-tecnico (T12) `SubtareasDialog` lee siempre las tareas del
 * ticket por `GET /tickets/:id/tareas`, y el frontend ya no lee el contenido de
 * las embebidas. `porcentajeAvance` lo calcula el backend al leer, sobre las
 * tareas activas del ticket.
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
  /**
   * Sector del ticket base (odd/ubicacion-sector-ticket). La ubicación general
   * del ticket no viaja acá: Edilicia usa su propia `ubicacion`.
   */
  sectorId: string | null;
  /** Nombre del sector, resuelto por el backend aunque esté desactivado. */
  sectorNombre: string | null;
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
  /** Sector del cliente, opcional (odd/ubicacion-sector-ticket). Sin la ubicación general. */
  sectorId?: string | null;
}

/**
 * Body de `POST /reparaciones/:reparacionId/compras` (`VincularCompraHttpDto`,
 * sdd/reparacion-bloqueada-por-compra WU6). El backend exige, ADEMÁS del
 * permiso implícito en la ruta, `EDILICIA:ALTAS` **y** `COMPRAS:LECTURA`
 * (`@RequiereAcciones` con los dos argumentos, WU5) — el diálogo del frontend
 * gatea la EXPERIENCIA con `<Can>`, nunca la autorización real.
 */
export interface VincularCompraDto {
  compraId: string;
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
