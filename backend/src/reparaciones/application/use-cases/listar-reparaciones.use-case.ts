import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { IComentarioReparacionRepository } from '../../domain/ports/i-comentario-reparacion.repository';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { CompraVinculada, comprasQueBloquean } from '../../domain/services/bloqueo-reparacion';

/** Un ticket edilicio resuelto junto a su ticket base y subtareas (para listados). */
export interface ReparacionConTicket {
  ticket: TicketEntity;
  ticketEdilicia: TicketEdiliciaEntity;
  /** Subtareas ACTIVAS del checklist (sdd/beta-frontend item 1 — G7, embebido). */
  subtareas: SubtareaEdiliciaEntity[];
  /** Cantidad de comentarios de la reparación. Siempre un número: `0` cuando no tiene ninguno. */
  cantidadComentarios: number;
  /** `true` si tiene al menos una compra vinculada cuyo grupo derivado es `ACTIVAS` (WU3). */
  bloqueada: boolean;
  /** Compras vinculadas que HOY frenan la reparación. Ausencia de bloqueo = `[]`, nunca `undefined`. */
  comprasQueBloquean: CompraVinculada[];
}

/**
 * ListarReparacionesUseCase — caso de uso de consulta para los tickets
 * edilicios del tenant (F3-E1).
 *
 * Obtiene todos los `TicketEdiliciaEntity` activos y resuelve el `Ticket`
 * base y las subtareas de cada uno (join en memoria — mismo patrón que
 * `ListarComprasUseCase`, T4.5). `ubicacion` viaja embebida como texto libre
 * en el propio `TicketEdiliciaEntity` (ex-catálogo Ubicacion removido — no
 * requiere resolución aparte). Embeber subtareas (item 1, G7) evita depender
 * SOLO del cache de sesión poblado por mutaciones — antes se perdía al
 * recargar la página. Satélites sin ticket base asociado (registros
 * huérfanos, no debería pasar en producción) se omiten silenciosamente.
 *
 * COSTO EN CONSULTAS: CONSTANTE — 5 consultas para toda la página, sin
 * importar cuántas reparaciones haya (`findAll` + tickets base + subtareas +
 * conteo de comentarios + compras vinculadas). Las cuatro resoluciones por id
 * se piden POR LOTE y ANTES del loop; el loop sólo lee de los `Map` que
 * devuelven. Antes esto era un N+1 de `1 + 2N` consultas (ticket base y
 * subtareas fila por fila).
 *
 * Tarea: T8.5, WU3 (sdd/reparacion-bloqueada-por-compra).
 */
export class ListarReparacionesUseCase {
  constructor(
    private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findAll'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findByIds'>,
    private readonly subtareaRepo: Pick<
      ISubtareaEdiliciaRepository,
      'findActiveByTicketEdiliciaIds'
    >,
    private readonly comentarioRepo: Pick<
      IComentarioReparacionRepository,
      'contarPorTicketEdilicia'
    >,
    private readonly reparacionCompraRepo: Pick<
      IReparacionCompraRepository,
      'findComprasVinculadasByTicketEdiliciaIds'
    >,
  ) {}

  async execute(): Promise<Result<ReparacionConTicket[], DomainError>> {
    const satelites = await this.ediliciaRepo.findAll();
    if (satelites.length === 0) {
      return Result.ok([]);
    }

    const ediliciaIds = satelites.map((satelite) => satelite.id);

    // Las cuatro, una sola vez y FUERA del loop: mover cualquiera adentro
    // devolvería el listado a una consulta por fila, que es justo lo que las
    // firmas por lote evitan. Van en paralelo porque son independientes entre
    // sí — ninguna necesita el resultado de las otras.
    const [
      ticketsPorId,
      subtareasPorReparacion,
      comentariosPorReparacion,
      comprasVinculadasPorReparacion,
    ] = await Promise.all([
      this.ticketRepo.findByIds(satelites.map((satelite) => satelite.ticketId)),
      this.subtareaRepo.findActiveByTicketEdiliciaIds(ediliciaIds),
      this.comentarioRepo.contarPorTicketEdilicia(ediliciaIds),
      this.reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds(ediliciaIds),
    ]);

    const items: ReparacionConTicket[] = [];

    // El orden del resultado es el de `findAll`: se recorren los satélites,
    // no las claves de los Map.
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
      items.push({
        ticket,
        ticketEdilicia,
        // Sin subtareas activas el lote no trae entrada: la ausencia es `[]`,
        // nunca `undefined` — el consumidor itera esta lista sin chequear.
        subtareas: subtareasPorReparacion.get(ticketEdilicia.id) ?? [],
        // Sin comentarios el `GROUP BY` no emite fila: la ausencia es `0`.
        cantidadComentarios: comentariosPorReparacion.get(ticketEdilicia.id) ?? 0,
        bloqueada: bloqueantes.length > 0,
        comprasQueBloquean: [...bloqueantes],
      });
    }

    return Result.ok(items);
  }
}
