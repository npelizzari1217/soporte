import { KbArticuloEntity } from '../entities/kb-articulo.entity';

/**
 * KbFiltros — filtros de `IKbArticuloRepository.findAll` (K3). `soloVisibles`
 * e `incluirInactivos` son OBLIGATORIOS: los deriva `ListarKbArticulosUseCase`
 * del rol del actor (K4) — el caller HTTP nunca los setea directamente.
 *
 * Ref spec: sdd/premium/spec K3. Ref design: ADR-P6 (Firmas TS). Tarea: K4.
 */
export interface KbFiltros {
  /** FK opcional → tipos_ticket.id. */
  tipoTicketId?: string;
  /** true = solo `visibleParaSolicitante=true` (K3, actor sin `ticket:ver_todos`). */
  soloVisibles: boolean;
  /** true = incluye soft-deleted/`activo=false` (K3, staff en gestión). */
  incluirInactivos: boolean;
  /** Búsqueda por substring case-insensitive en `titulo` (opcional, K3). */
  busqueda?: string;
  /** Página 1-indexed. */
  page: number;
  /** Tamaño de página. */
  pageSize: number;
}

/**
 * IKbArticuloRepository — puerto de acceso a `kb_articulos` (K1-K4).
 *
 * Ref spec: sdd/premium/spec K1-K4. Ref design: ADR-P6. Tarea: K4.
 */
export interface IKbArticuloRepository {
  /** Busca un artículo por su id técnico. Retorna null si no existe. Incluye soft-deleted. */
  findById(id: string): Promise<KbArticuloEntity | null>;

  /** Retorna artículos filtrados (K3) + total (para paginación), sin aplicar `limit`/`offset` al total. */
  findAll(filtros: KbFiltros): Promise<{ items: KbArticuloEntity[]; total: number }>;

  /** Persiste un `KbArticuloEntity` (upsert por id: INSERT si nuevo, UPDATE si existe). */
  save(articulo: KbArticuloEntity): Promise<void>;

  /** Baja lógica: setea `deleted_at` + `activo=false`. NO elimina la fila. */
  softDelete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IKbArticuloRepository en NestJS. */
export const KB_ARTICULO_REPOSITORY = Symbol('KB_ARTICULO_REPOSITORY');
