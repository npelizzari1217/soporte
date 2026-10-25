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

/**
 * Shape unificado de un ticket edilicio (`TicketEdiliciaConTicketResponseDto`). Desde
 * odd/ticket-unificado `id` = id del ticket, igual que `ticketId`; desde T4a las rutas
 * `/reparaciones/:id` aceptan solo el id del ticket.
 */
export interface TicketEdilicia {
  id: string;
  ticketId: string;
  /** Tipo del ticket base: decide qué acciones se ofrecen en la fila (odd/permisos-por-tipo-ticket, S6). */
  tipoId: string;
  numero: string;
  titulo: string;
  /** Descripción y prioridad del ticket base, para precargar la edición (odd/detalle-ticket-legible). */
  descripcion: string | null;
  prioridadId: string;
  estadoId: string;
  /** Ubicación del ticket, texto libre (odd/ticket-unificado: una sola, la del ticket). */
  ubicacion: string | null;
  /** Sector del ticket base (odd/ubicacion-sector-ticket). */
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

/** Body de `PATCH /reparaciones/:id` (odd/detalle-ticket-legible): ausente no toca, `null` limpia. */
export interface EditarReparacionDto {
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  /** Ubicación del ticket (odd/ticket-unificado). */
  ubicacion?: string | null;
  sectorId?: string | null;
}

export interface CrearTicketEdilicioDto {
  titulo: string;
  descripcion?: string | null;
  prioridadId: string;
  /** Tipo de ticket del módulo EDILICIA; ausente = EDILICIA (odd/tasks/tipos-ticket-por-modulo.md). */
  tipoId?: string | null;
  /** Texto libre, opcional. */
  ubicacion?: string | null;
  /** Sector del cliente, opcional (odd/ubicacion-sector-ticket). Sin la ubicación general. */
  sectorId?: string | null;
}

/**
 * Comentario de Edilicia (`ComentarioReparacionResponseDto`): desde
 * odd/ticket-unificado es un COMENTARIO del timeline del ticket, y el que se
 * publica desde Edilicia es interno (L19). `ticketEdiliciaId` lleva el id del
 * ticket.
 *
 * A diferencia de las subtareas, los comentarios SÍ tienen `GET` propio
 * (`GET /reparaciones/:id/comentarios`, más nuevo primero) — no viajan
 * embebidos en `GET /reparaciones`.
 *
 * Sin `updatedAt`/`deletedAt`: los comentarios no se editan ni se borran. `autorNombre`/`autorApellido` los resuelve el backend
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

/** Filtro de bloqueo del listado; lo resuelve el servidor (odd/reparaciones-paginadas). */
export type FiltroBloqueo = "TODAS" | "BLOQUEADAS" | "NO_BLOQUEADAS";

/** Filtros de `GET /reparaciones`, espejo de la URL del listado. */
export interface ReparacionesFiltros {
  pagina: number;
  porPagina: number;
  bloqueo?: FiltroBloqueo;
  /**
   * Id del tipo elegido en el selector de la pantalla (odd/ticket-unificado, S2). Ausente: los
   * tipos del módulo EDILICIA, como hasta ahora.
   */
  tipo?: string;
}

/** Response de `GET /reparaciones`: una página y su metadata (misma forma que tickets). */
export interface ListReparacionesResponse {
  items: ReparacionListItem[];
  total: number;
  pagina: number;
  porPagina: number;
}
