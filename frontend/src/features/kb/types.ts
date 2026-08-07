/**
 * Tipos del dominio KB — espejo de `backend/src/kb/interface/dtos/kb-articulo.dto.ts`
 * (T3.1). Prohibido `any` (regla base); estos tipos son la única fuente de
 * verdad de forma en el front, igual que `features/tickets/types.ts`.
 *
 * Nota (spec §2 / design ADR-5): el scope de lectura (artículos internos
 * visibles o no) lo resuelve el backend según `ticket:ver_todos` del actor —
 * el front NUNCA re-filtra lo que `GET /kb` devuelve, solo lo renderiza. El
 * gate de EDICIÓN (crear/editar/visibilidad/eliminar) es `kb:gestionar`.
 */

export interface KbArticulo {
  id: string;
  titulo: string;
  contenido: string;
  tipoTicketId: string | null;
  autorId: string | null;
  visibleParaSolicitante: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListKbArticulosResponse {
  items: KbArticulo[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filtros combinables de `GET /kb` (espejo de `ListKbArticulosQueryDto`). */
export interface KbFiltros {
  tipoTicketId?: string;
  busqueda?: string;
  page?: number;
  pageSize?: number;
}

export interface CrearKbArticuloDto {
  titulo: string;
  contenido: string;
  tipoTicketId?: string | null;
}

export interface EditarKbArticuloDto {
  titulo?: string;
  contenido?: string;
  tipoTicketId?: string | null;
}

export interface CambiarVisibilidadKbArticuloDto {
  visible: boolean;
}
