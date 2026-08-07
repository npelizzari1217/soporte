import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

const PAGINA_DEFAULT = 1;
const POR_PAGINA_DEFAULT = 20;

/**
 * DTO de entrada de `ListarTicketsUseCase`.
 *
 * `filtros` excluye `soloSolicitante`/`limit`/`offset` — esos tres los
 * calcula el use case (scope de rol T6/T7 y paginación), nunca el caller.
 */
export interface ListarTicketsDto {
  filtros?: Omit<TicketFiltros, 'soloSolicitante' | 'limit' | 'offset'>;
  actorId: string;
  tienePermisoVerTodos: boolean;
  /** Página 1-indexed. Default 1. */
  pagina?: number;
  /** Tamaño de página. Default 20. */
  porPagina?: number;
}

/** Resultado paginado de `ListarTicketsUseCase`. */
export interface ListarTicketsResult {
  items: TicketEntity[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * ListarTicketsUseCase — listado de tickets del tenant con filtros
 * combinables, scope por rol y ciclo efectivo (T7).
 *
 * - Ciclo efectivo: `filtros.cicloId` explícito (histórico) tiene prioridad;
 *   si no viene, se resuelve el ciclo ACTIVO del tenant. Sin cicloId
 *   explícito NI activo → `{ items: [], total: 0 }` (invariante "siempre
 *   por ciclo", nunca "todos").
 * - Scope de rol (T6): sin `ticket:ver_todos` se deriva
 *   `soloSolicitante = actorId`; con el permiso, `soloSolicitante`
 *   queda `undefined` (ve todos).
 * - Paginación (PR6): `pagina`/`porPagina` se traducen a `limit`/`offset`.
 *   `count()` se consulta con los MISMOS filtros pero SIN paginación, para
 *   que `total` refleje el universo completo, no la página actual.
 *
 * Ref spec: sdd/tickets-core/spec T6, T7. Tarea: T6.4.
 */
export class ListarTicketsUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly cicloClienteRepo: ICicloClienteRepository,
  ) {}

  async execute(dto: ListarTicketsDto): Promise<Result<ListarTicketsResult, DomainError>> {
    const cicloEfectivoId = dto.filtros?.cicloId ?? (await this.cicloClienteRepo.findActive())?.id;

    const pagina = dto.pagina ?? PAGINA_DEFAULT;
    const porPagina = dto.porPagina ?? POR_PAGINA_DEFAULT;

    if (!cicloEfectivoId) {
      return Result.ok({ items: [], total: 0, pagina, porPagina });
    }

    const soloSolicitante = dto.tienePermisoVerTodos ? undefined : dto.actorId;
    const filtrosBase: TicketFiltros = {
      ...dto.filtros,
      cicloId: cicloEfectivoId,
      soloSolicitante,
    };

    const [items, total] = await Promise.all([
      this.ticketRepo.findAll({
        ...filtrosBase,
        limit: porPagina,
        offset: (pagina - 1) * porPagina,
      }),
      this.ticketRepo.count(filtrosBase),
    ]);

    return Result.ok({ items, total, pagina, porPagina });
  }
}
