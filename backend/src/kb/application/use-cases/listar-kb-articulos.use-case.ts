import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { IKbArticuloRepository } from '../../domain/ports/i-kb-articulo.repository';

const PAGINA_DEFAULT = 1;
const POR_PAGINA_DEFAULT = 20;
const POR_PAGINA_MAX = 100;

/**
 * DTO de entrada de `ListarKbArticulosUseCase`. `tienePermisoVerTodos` lo
 * calcula el controller con `puedeEjecutar(user, 'KB:VER_TODOS')`
 * (sdd/matriz-permisos-por-usuario, R11; antes K3).
 */
export interface ListarKbArticulosDto {
  tienePermisoVerTodos: boolean;
  busqueda?: string;
  /** Página 1-indexed. Default 1. */
  page?: number;
  /** Tamaño de página. Default 20, clamp ≤100. */
  pageSize?: number;
}

/** Resultado paginado de `ListarKbArticulosUseCase`. */
export interface ListarKbArticulosResult {
  items: KbArticuloEntity[];
  total: number;
}

/**
 * ListarKbArticulosUseCase — listado de artículos de KB con scope de
 * lectura por rol (K3).
 *
 * - staff (`KB:VER_TODOS`) ve TODOS los artículos (internos + inactivos,
 *   para gestión): `soloVisibles=false`, `incluirInactivos=true`.
 * - USUARIO (sin el permiso) solo ve artículos publicados y activos:
 *   `soloVisibles=true`, `incluirInactivos=false`.
 *
 * Ref spec: sdd/premium/spec K3. Ref design: ADR-P6. Tarea: K3/K4.
 */
export class ListarKbArticulosUseCase {
  constructor(private readonly repo: Pick<IKbArticuloRepository, 'findAll'>) {}

  async execute(dto: ListarKbArticulosDto): Promise<ListarKbArticulosResult> {
    const page = dto.page ?? PAGINA_DEFAULT;
    const pageSize = Math.min(dto.pageSize ?? POR_PAGINA_DEFAULT, POR_PAGINA_MAX);

    return this.repo.findAll({
      soloVisibles: !dto.tienePermisoVerTodos,
      incluirInactivos: dto.tienePermisoVerTodos,
      busqueda: dto.busqueda,
      page,
      pageSize,
    });
  }
}
