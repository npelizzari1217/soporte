import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import { calcularAvanceTareas } from '../../../tickets/domain/services/avance-tareas';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { IComentarioReparacionRepository } from '../../domain/ports/i-comentario-reparacion.repository';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { CompraVinculada, comprasQueBloquean } from '../../domain/services/bloqueo-reparacion';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import {
  AlcanceActorTicket,
  alcanceDeListado,
  alcanceListadoVacio,
} from '../../../tickets/application/services/visibilidad-ticket';

/** Un ticket edilicio resuelto junto a su ticket base y subtareas (para listados). */
export interface ReparacionConTicket {
  ticket: TicketEntity;
  ticketEdilicia: TicketEdiliciaEntity;
  /**
   * Subtareas ACTIVAS del checklist (sdd/beta-frontend item 1 — G7, embebido). Desde
   * odd/tareas-con-tecnico (T3) son las tareas del ticket base (`tareas_ticket`).
   */
  subtareas: TareaTicketEntity[];
  /**
   * Avance calculado al leer, con `calcularAvanceTareas` sobre esas tareas (CA7). Reemplaza a la
   * columna `ticket_edilicia.porcentaje_avance`, que ya nadie actualiza: las tareas se completan
   * desde los casos de uso de tickets, que no conocen el satélite de Edilicia.
   */
  porcentajeAvance: number;
  /** Cantidad de comentarios de la reparación. Siempre un número: `0` cuando no tiene ninguno. */
  cantidadComentarios: number;
  /** `true` si tiene al menos una compra vinculada cuyo grupo derivado es `ACTIVAS` (WU3). */
  bloqueada: boolean;
  /** Compras vinculadas que HOY frenan la reparación. Ausencia de bloqueo = `[]`, nunca `undefined`. */
  comprasQueBloquean: CompraVinculada[];
  /**
   * Nombre del sector del ticket base (odd/ubicacion-sector-ticket), incluso si el sector está
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
 * ListarReparacionesUseCase — caso de uso de consulta para los tickets
 * edilicios del tenant (F3-E1).
 *
 * Obtiene los `TicketEdiliciaEntity` activos que el actor puede ver y resuelve
 * el `Ticket` base y las subtareas de cada uno (join en memoria — mismo patrón que
 * `ListarComprasUseCase`, T4.5). `ubicacion` viaja embebida como texto libre
 * en el propio `TicketEdiliciaEntity` (ex-catálogo Ubicacion removido — no
 * requiere resolución aparte). Embeber subtareas (item 1, G7) evita depender
 * SOLO del cache de sesión poblado por mutaciones — antes se perdía al
 * recargar la página. Satélites sin ticket base asociado (registros
 * huérfanos, no debería pasar en producción) se omiten silenciosamente.
 *
 * COSTO EN CONSULTAS: CONSTANTE — 5 consultas para toda la página, sin
 * importar cuántas reparaciones haya (`findAll` + tickets base + subtareas +
 * conteo de comentarios + compras vinculadas), más UNA de nombres de sector si
 * algún ticket tiene sector (odd/ubicacion-sector-ticket). Esa va en una
 * segunda vuelta porque los ids salen de los tickets base. Las cuatro resoluciones por id
 * se piden POR LOTE y ANTES del loop; el loop sólo lee de los `Map` que
 * devuelven. Antes esto era un N+1 de `1 + 2N` consultas (ticket base y
 * subtareas fila por fila). El listado paginado aplica esto solo a la página
 * y, con filtro de bloqueo, suma UNA consulta de compras vinculadas sobre todas.
 *
 * Alcance (odd/permisos-por-tipo-ticket, S6, D5 e): entran solo las
 * reparaciones cuyo ticket base es de un tipo con `LECTURA`; en los tipos sin
 * `VER_TODOS`, solo las que cumplen la regla de fila. Lo filtra la base en
 * `findAll`, antes de contar y paginar. Sin ningún tipo con `LECTURA` no se
 * consulta nada. Hasta los permisos por tipo, este listado no tenía scope (L14).
 *
 * Tarea: T8.5, WU3 (sdd/reparacion-bloqueada-por-compra).
 */
export class ListarReparacionesUseCase {
  constructor(
    private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findAll'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findByIds'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTickets'>,
    private readonly comentarioRepo: Pick<
      IComentarioReparacionRepository,
      'contarPorTicketEdilicia'
    >,
    private readonly reparacionCompraRepo: Pick<
      IReparacionCompraRepository,
      'findComprasVinculadasByTicketEdiliciaIds'
    >,
    private readonly sectorRepo: Pick<ISectorRepository, 'findNombres'>,
  ) {}

  /**
   * Listado COMPLETO, hidratado. Lo usa la exportación, que siempre trae todas
   * las reparaciones que el actor ve (odd/reparaciones-paginadas, S4).
   *
   * @param alcance Permisos por tipo del actor.
   * @returns Las reparaciones visibles, la más reciente primero.
   */
  async execute(alcance: AlcanceActorTicket): Promise<Result<ReparacionConTicket[], DomainError>> {
    const satelites = await this.satelitesVisibles(alcance);
    return Result.ok(await this.hidratar(satelites));
  }

  /**
   * Una página del listado (odd/reparaciones-paginadas, S1-S3).
   *
   * Los satélites son filas livianas y se traen todos para poder ordenar,
   * contar y filtrar; lo caro —ticket base, tareas, comentarios, compras y
   * sectores— se resuelve solo para la página. El bloqueo no es una columna:
   * se deriva de las compras vinculadas, así que con un filtro de bloqueo se
   * consulta el vínculo de todas ANTES de cortar; filtrar después de paginar
   * dejaría páginas cortas y un `total` falso.
   *
   * `total` cuenta satélites, así que un huérfano sin ticket base (no debería
   * existir) suma al total aunque no aparezca en su página.
   *
   * @param pedido Página, tamaño, filtro de bloqueo y alcance del actor.
   * @returns La página pedida y el total de reparaciones que cumplen el filtro.
   */
  async executePaginado(
    pedido: PedidoPaginaReparaciones,
  ): Promise<Result<PaginaReparaciones, DomainError>> {
    const { pagina, porPagina, bloqueo } = pedido;
    const satelites = await this.satelitesVisibles(pedido.alcance);

    let candidatos = satelites;
    if (bloqueo !== 'TODAS' && satelites.length > 0) {
      const vinculadas = await this.reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds(
        satelites.map((satelite) => satelite.id),
      );
      const quiereBloqueadas = bloqueo === 'BLOQUEADAS';
      candidatos = satelites.filter(
        (satelite) =>
          comprasQueBloquean(vinculadas.get(satelite.id) ?? []).length > 0 === quiereBloqueadas,
      );
    }

    const desde = (pagina - 1) * porPagina;
    const items = await this.hidratar(candidatos.slice(desde, desde + porPagina));
    return Result.ok({ items, total: candidatos.length, pagina, porPagina });
  }

  /** Satélites cuyo ticket base el actor ve; sin ningún tipo con `LECTURA`, ninguno y sin consultar. */
  private async satelitesVisibles(alcance: AlcanceActorTicket): Promise<TicketEdiliciaEntity[]> {
    const filtro = alcanceDeListado(alcance);
    if (alcanceListadoVacio(filtro)) return [];
    return this.ediliciaRepo.findAll(filtro);
  }

  /**
   * Resuelve ticket base, tareas, comentarios, compras y sector de los
   * satélites dados, en el orden recibido y salteando huérfanos.
   */
  private async hidratar(satelites: TicketEdiliciaEntity[]): Promise<ReparacionConTicket[]> {
    if (satelites.length === 0) {
      return [];
    }

    const ediliciaIds = satelites.map((satelite) => satelite.id);
    const ticketIds = satelites.map((satelite) => satelite.ticketId);

    // Las cuatro, una sola vez y FUERA del loop: mover cualquiera adentro
    // devolvería el listado a una consulta por fila, que es justo lo que las
    // firmas por lote evitan. Van en paralelo porque son independientes entre
    // sí — ninguna necesita el resultado de las otras.
    const [
      ticketsPorId,
      tareasPorTicket,
      comentariosPorReparacion,
      comprasVinculadasPorReparacion,
    ] = await Promise.all([
      this.ticketRepo.findByIds(ticketIds),
      this.tareaRepo.listarPorTickets(ticketIds),
      this.comentarioRepo.contarPorTicketEdilicia(ediliciaIds),
      this.reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds(ediliciaIds),
    ]);

    // Un solo lote con los sectores de todos los tickets base (odd/ubicacion-sector-ticket).
    const idsSectores = new Set<string>();
    for (const ticket of ticketsPorId.values()) {
      if (ticket.sectorId) idsSectores.add(ticket.sectorId);
    }
    const nombresSectores =
      idsSectores.size > 0
        ? await this.sectorRepo.findNombres([...idsSectores])
        : new Map<string, string>();

    const items: ReparacionConTicket[] = [];

    // El orden del resultado es el de los satélites recibidos: se recorren
    // ellos, no las claves de los Map.
    for (const ticketEdilicia of satelites) {
      const ticket = ticketsPorId.get(ticketEdilicia.ticketId);
      // Satélite huérfano: sin ticket base no hay item, igual que cuando esto
      // se resolvía con un `findById` que volvía `null`.
      if (!ticket) {
        continue;
      }
      // Sin compras vinculadas el lote no trae entrada: la ausencia es `[]`,
      // nunca `undefined` — mismo contrato que subtareas/comentarios.
      const vinculadas = comprasVinculadasPorReparacion.get(ticketEdilicia.id) ?? [];
      const bloqueantes = comprasQueBloquean(vinculadas);
      // Sin tareas activas el lote no trae entrada: la ausencia es `[]`, nunca `undefined` — el
      // consumidor itera esta lista sin chequear.
      const tareas = tareasPorTicket.get(ticketEdilicia.ticketId) ?? [];
      items.push({
        ticket,
        ticketEdilicia,
        subtareas: tareas,
        porcentajeAvance: calcularAvanceTareas(tareas).porcentaje,
        // Sin comentarios el `GROUP BY` no emite fila: la ausencia es `0`.
        cantidadComentarios: comentariosPorReparacion.get(ticketEdilicia.id) ?? 0,
        bloqueada: bloqueantes.length > 0,
        comprasQueBloquean: [...bloqueantes],
        sectorNombre: ticket.sectorId ? (nombresSectores.get(ticket.sectorId) ?? null) : null,
      });
    }

    return items;
  }
}
