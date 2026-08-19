/**
 * Tipos del dominio KB — espejo de `backend/src/kb/interface/dtos/kb-articulo.dto.ts`
 * (T3.1). Prohibido `any` (regla base); estos tipos son la única fuente de
 * verdad de forma en el front, igual que `features/tickets/types.ts`.
 *
 * La Ayuda es única y global (vive en master), no una por cliente.
 *
 * Scope de lectura: lo resuelve el backend según `KB:VER_TODOS` del actor — el
 * front NUNCA re-filtra lo que `GET /kb` devuelve, solo lo renderiza. El gate
 * de EDICIÓN (crear/editar/visibilidad/eliminar) es ROOT (`<SoloRoot>`), no
 * una celda de la matriz.
 *
 * Sin `tipoTicketId`: era una FK al catálogo del TENANT y no sobrevivió al
 * cruce a master. La pantalla nunca lo usó.
 */

export interface KbArticulo {
  id: string;
  titulo: string;
  contenido: string;
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
  busqueda?: string;
  page?: number;
  pageSize?: number;
}

export interface CrearKbArticuloDto {
  titulo: string;
  contenido: string;
}

export interface EditarKbArticuloDto {
  titulo?: string;
  contenido?: string;
}

export interface CambiarVisibilidadKbArticuloDto {
  visible: boolean;
}
