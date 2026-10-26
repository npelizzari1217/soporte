import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import { calcularAvanceTareas } from '../../../tickets/domain/services/avance-tareas';
import { IConteoComentariosTicketRepository } from '../../domain/ports/i-conteo-comentarios-ticket.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { CompraVinculada, comprasQueBloquean } from '../../domain/services/bloqueo-reparacion';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import {
  AlcanceActorTicket,
  alcanceDeListado,
  alcanceListadoVacio,
  tieneAccionSobreTipo,
} from '../../../tickets/application/services/visibilidad-ticket';

/** Un ticket de la grilla de Edilicia, resuelto con sus tareas, comentarios, compras y sector. */
export interface ReparacionConTicket {
  ticket: TicketEntity;
  /**
   * Tareas ACTIVAS del ticket (sdd/beta-frontend item 1 — G7, embebidas). Desde
   * odd/tareas-con-tecnico (T3) son las tareas del ticket (`tareas_ticket`).
   */
  subtareas: TareaTicketEntity[];
  /** Avance calculado al leer, con `calcularAvanceTareas` sobre esas tareas (CA7). */
  porcentajeAvance: number;
  /**
   * Cantidad de comentarios del ticket que el actor ve: los públicos, más los internos si tiene
   * `OBSERVAR` sobre el tipo (la misma visibilidad que el timeline). Siempre un número.
   */
  cantidadComentarios: number;
  /** `true` si tiene al menos una compra vinculada cuyo grupo derivado es `ACTIVAS` (WU3). */
  bloqueada: boolean;
  /** Compras vinculadas que HOY frenan el ticket. Ausencia de bloqueo = `[]`, nunca `undefined`. */
  comprasQueBloquean: CompraVinculada[];
  /**
   * Nombre del sector del ticket (odd/ubicacion-sector-ticket), incluso si el sector está
   * desactivado. `null` si el ticket no tiene sector.
   */
  sectorNombre: string | null;
}

/** Filtro de bloqueo del listado paginado (odd/reparaciones-paginadas, S1). */
export const FILTROS_BLOQUEO = ['TODAS', 'BLOQUEADAS', 'NO_BLOQUEADAS'] as const;
export type FiltroBloqueo = (typeof FILTROS_BLOQUEO)[number];

/** Pedido de una página del listado. */
export interface PedidoPaginaReparaciones {
  pagina: number;
  porPagina: number;
  bloqueo: FiltroBloqueo;
  /**
   * Tipo elegido en el selector de la pantalla (odd/ticket-unificado, S2). `null`: los tipos del
   * módulo EDILICIA, que es lo que la pantalla mostraba antes de tener selector.
   */
  tipoId: string | null;
  /** Permisos por tipo del actor (odd/permisos-por-tipo-ticket, D5 e). */
  alcance: AlcanceActorTicket;
}

/** Una página del listado, con el total de las que cumplen el filtro. */
export interface PaginaReparaciones {
  items: ReparacionConTicket[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * ListarReparacionesUseCase — la grilla de la pantalla de Edilicia (F3-E1).
 *
 * Desde odd/ticket-unificado (S1, S2) se arma sobre los TICKETS, no sobre el satélite
 * `ticket_edilicia`: cualquier ticket tiene tareas, compras, ubicación y sector, así que la pantalla
 * lista los de un tipo elegido, o, sin tipo, los del módulo EDILICIA (lo que mostraba antes). Un
 * ticket abierto desde Tickets aparece igual que uno abierto desde Edilicia.
 *
 * Alcance (odd/permisos-por-tipo-ticket, S6, D5 e): el MISMO que el listado de tickets. Entran solo
 * los tipos con `LECTURA` y, en los que no tienen `VER_TODOS`, la regla de fila; pedir un tipo
 * nunca amplía el alcance (`alcanceDeListado` se queda con la intersección). Lo filtra la base en
 * `findAll`, antes de contar y paginar. Sin ningún tipo visible no se consulta nada.
 *
 * COSTO EN CONSULTAS: CONSTANTE — la lista de tickets, más, para la página, tareas, conteo de
 * comentarios y compras vinculadas por lote, y UNA de nombres de sector si algún ticket tiene
 * sector. Con filtro de bloqueo, UNA consulta de compras vinculadas sobre todos los candidatos. Las
 * resoluciones por id se piden POR LOTE y ANTES del loop; el loop sólo lee de los `Map`.
 *
 * Tarea: T8.5, WU3 (sdd/reparacion-bloqueada-por-compra).
 */
export class ListarReparacionesUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findAll'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findIdsByModulos'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTickets'>,
    private readonly comentarioRepo: Pick<IConteoComentariosTicketRepository, 'contarPorTickets'>,
    private readonly reparacionCompraRepo: Pick<
      ITicketCompraRepository,
      'findComprasVinculadasByTicketIds'
    >,
    private readonly sectorRepo: Pick<ISectorRepository, 'findNombres'>,
  ) {}

  /**
   * Listado COMPLETO, hidratado. Lo usa la exportación, que siempre trae todos los tickets que el
   * actor ve (odd/reparaciones-paginadas, S4).
   *
   * @param alcance Permisos por tipo del actor.
   * @param tipoId Tipo elegido, o `null` para los del módulo EDILICIA.
   * @returns Los tickets visibles, el más reciente primero.
   */
  async execute(
    alcance: AlcanceActorTicket,
    tipoId: string | null = null,
  ): Promise<Result<ReparacionConTicket[], DomainError>> {
    const tickets = await this.ticketsVisibles(alcance, tipoId);
    return Result.ok(await this.hidratar(tickets, alcance));
  }

  /**
   * Una página del listado (odd/reparaciones-paginadas, S1-S3).
   *
   * Se traen todos los tickets candidatos para poder contar y filtrar; lo caro —tareas,
   * comentarios, compras y sectores— se resuelve solo para la página. El bloqueo no es una
   * columna: se deriva de las compras vinculadas, así que con un filtro de bloqueo se consulta el
   * vínculo de todos ANTES de cortar; filtrar después de paginar dejaría páginas cortas y un
   * `total` falso.
   *
   * @param pedido Página, tamaño, filtros y alcance del actor.
   * @returns La página pedida y el total de tickets que cumplen el filtro.
   */
  async executePaginado(
    pedido: PedidoPaginaReparaciones,
  ): Promise<Result<PaginaReparaciones, DomainError>> {
    const { pagina, porPagina, bloqueo } = pedido;
    const tickets = await this.ticketsVisibles(pedido.alcance, pedido.tipoId);

    let candidatos = tickets;
    if (bloqueo !== 'TODAS' && tickets.length > 0) {
      const vinculadas = await this.reparacionCompraRepo.findComprasVinculadasByTicketIds(
        tickets.map((ticket) => ticket.id),
      );
      const quiereBloqueadas = bloqueo === 'BLOQUEADAS';
      candidatos = tickets.filter(
        (ticket) =>
          comprasQueBloquean(vinculadas.get(ticket.id) ?? []).length > 0 === quiereBloqueadas,
      );
    }

    const desde = (pagina - 1) * porPagina;
    const items = await this.hidratar(candidatos.slice(desde, desde + porPagina), pedido.alcance);
    return Result.ok({ items, total: candidatos.length, pagina, porPagina });
  }

  /**
   * Tickets activos del tipo pedido (o del módulo EDILICIA) que el actor ve, el más reciente
   * primero; sin ningún tipo visible, ninguno y sin consultar.
   */
  private async ticketsVisibles(
    alcance: AlcanceActorTicket,
    tipoId: string | null,
  ): Promise<TicketEntity[]> {
    const tiposIds =
      tipoId !== null ? [tipoId] : await this.tipoTicketRepo.findIdsByModulos(['EDILICIA']);
    // `findAll` lee una lista vacía de tipos como "todos los tipos": cortar acá.
    if (tiposIds.length === 0) return [];
    const filtro = alcanceDeListado(alcance, tiposIds);
    if (alcanceListadoVacio(filtro)) return [];
    return this.ticketRepo.findAll({ tiposIds, ...(filtro !== null && { alcance: filtro }) });
  }

  /** Resuelve tareas, comentarios, compras y sector de los tickets dados, en el orden recibido. */
  private async hidratar(
    tickets: TicketEntity[],
    alcance: AlcanceActorTicket,
  ): Promise<ReparacionConTicket[]> {
    if (tickets.length === 0) {
      return [];
    }

    const ticketIds = tickets.map((ticket) => ticket.id);

    // Las tres, una sola vez y FUERA del loop: mover cualquiera adentro devolvería el listado a una
    // consulta por fila, que es justo lo que las firmas por lote evitan. Van en paralelo porque son
    // independientes entre sí.
    const [tareasPorTicket, comentariosPorTicket, comprasVinculadasPorTicket] = await Promise.all([
      this.tareaRepo.listarPorTickets(ticketIds),
      this.comentarioRepo.contarPorTickets(ticketIds),
      this.reparacionCompraRepo.findComprasVinculadasByTicketIds(ticketIds),
    ]);

    // Un solo lote con los sectores de todos los tickets (odd/ubicacion-sector-ticket).
    const idsSectores = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.sectorId) idsSectores.add(ticket.sectorId);
    }
    const nombresSectores =
      idsSectores.size > 0
        ? await this.sectorRepo.findNombres([...idsSectores])
        : new Map<string, string>();

    return tickets.map((ticket) => {
      // Sin compras, tareas o comentarios el lote no trae entrada: la ausencia es `[]` o `0`,
      // nunca `undefined`.
      const bloqueantes = comprasQueBloquean(comprasVinculadasPorTicket.get(ticket.id) ?? []);
      const tareas = tareasPorTicket.get(ticket.id) ?? [];
      const comentarios = comentariosPorTicket.get(ticket.id) ?? { publicos: 0, internos: 0 };
      const veInternos = tieneAccionSobreTipo(alcance, ticket.tipoId, 'OBSERVAR');
      return {
        ticket,
        subtareas: tareas,
        porcentajeAvance: calcularAvanceTareas(tareas).porcentaje,
        cantidadComentarios: comentarios.publicos + (veInternos ? comentarios.internos : 0),
        bloqueada: bloqueantes.length > 0,
        comprasQueBloquean: [...bloqueantes],
        sectorNombre: ticket.sectorId ? (nombresSectores.get(ticket.sectorId) ?? null) : null,
      };
    });
  }
}
