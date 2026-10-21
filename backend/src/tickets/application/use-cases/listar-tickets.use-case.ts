import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import {
  AlcanceActorTicket,
  alcanceDeListado,
  alcanceListadoVacio,
} from '../services/visibilidad-ticket';

const PAGINA_DEFAULT = 1;
const POR_PAGINA_DEFAULT = 20;

/**
 * DTO de entrada de `ListarTicketsUseCase`.
 *
 * `filtros` excluye `alcance`/`limit`/`offset`: esos tres los calcula el use case (alcance por
 * tipo y paginación), nunca el caller.
 */
export interface ListarTicketsDto {
  filtros?: Omit<TicketFiltros, 'alcance' | 'limit' | 'offset'>;
  /**
   * Permisos por tipo del actor (odd/permisos-por-tipo-ticket, D5 e). Lo carga la capa de
   * interface por request; `permisosPorTipo: null` = sin restricción (ROOT y ADMINISTRADOR).
   */
  alcance: AlcanceActorTicket;
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
 * combinables, alcance por tipo y ciclo efectivo (T7).
 *
 * - Ciclo efectivo: `filtros.cicloId` explícito (histórico) tiene prioridad;
 *   si no viene, se resuelve el ciclo ACTIVO del tenant. Sin cicloId
 *   explícito NI activo → `{ items: [], total: 0 }` (invariante "siempre
 *   por ciclo", nunca "todos").
 * - Alcance por tipo (odd/permisos-por-tipo-ticket, S6, D5 e): entran solo los
 *   tipos con `LECTURA`; en los que además tienen `VER_TODOS`, todas sus filas, y
 *   en el resto, la regla de fila (`alcanceDeListado`). `filtros.tiposIds` se
 *   intersecta con esos tipos: pedir un tipo nunca amplía el alcance. Sin ningún
 *   tipo en el alcance → `{ items: [], total: 0 }` sin consultar la base. La
 *   base aplica el alcance en la misma consulta que pagina y cuenta.
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
    const pagina = dto.pagina ?? PAGINA_DEFAULT;
    const porPagina = dto.porPagina ?? POR_PAGINA_DEFAULT;
    const vacio = Result.ok<ListarTicketsResult, DomainError>({
      items: [],
      total: 0,
      pagina,
      porPagina,
    });

    const alcance = alcanceDeListado(dto.alcance, dto.filtros?.tiposIds);
    if (alcanceListadoVacio(alcance)) {
      return vacio;
    }

    const cicloEfectivoId = dto.filtros?.cicloId ?? (await this.cicloClienteRepo.findActive())?.id;
    if (!cicloEfectivoId) {
      return vacio;
    }

    const filtrosBase: TicketFiltros = {
      ...dto.filtros,
      cicloId: cicloEfectivoId,
      alcance: alcance ?? undefined,
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
