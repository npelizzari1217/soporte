import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
  tieneAccionSobreTipo,
} from '../services/visibilidad-ticket';

/**
 * DTO de entrada de `ListarTimelineUseCase`. El alcance del actor (`AlcanceActorTicket`) lo carga
 * la capa de interface por request; la capa de aplicación no conoce el JWT.
 */
export interface ListarTimelineDto extends AlcanceActorTicket {
  ticketId: string;
  /**
   * `true` excluye las operaciones internas aunque el actor tenga `OBSERVAR` sobre el tipo. Lo
   * usa el PDF, que es un documento que se reenvía y nunca lleva notas internas.
   */
  soloPublicas?: boolean;
}

/**
 * ListarTimelineUseCase — timeline tipado de un ticket con filtro de
 * visibilidad por `es_interno` (T18).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe o está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Reusa el MISMO scope de acceso que `ObtenerTicketUseCase` (T6): `LECTURA`
 *    sobre el tipo y, sin `VER_TODOS` sobre el tipo, solo el solicitante, el
 *    responsable o el técnico de una tarea activa (CA10) puede ver el timeline —
 *    cualquier otro actor recibe 404 (no revela existencia). Deviación
 *    explícita: la spec T18 no lo pide literalmente, pero sin este gate un
 *    actor ajeno sin `ticket:ver_todos` podría leer el timeline PÚBLICO de
 *    CUALQUIER ticket del tenant adivinando su UUID — el mismo hueco de
 *    seguridad que T6 ya cierra para `GET /tickets/:id` (riesgo #6 del
 *    design: "un error de scoping filtraría notas internas al solicitante").
 * 3. Obtiene el timeline completo (`operacionRepo.listByTicket`, ya
 *    ordenado cronológico ASC — T12, T18).
 * 4. Sin `OBSERVAR` sobre el tipo del ticket (odd/permisos-por-tipo-ticket,
 *    D5 c), o con `soloPublicas` → excluye toda operación `es_interno=true`.
 *    Con el permiso → retorna todo (públicas + internas).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/tickets-core/spec T18, T6. Tarea: T9.3.
 */
export class ListarTimelineUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'listByTicket'>,
  ) {}

  async execute(dto: ListarTimelineDto): Promise<Result<OperacionTicketEntity[], DomainError>> {
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto,
      'LECTURA',
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const operaciones = await this.operacionRepo.listByTicket(dto.ticketId);
    if (dto.soloPublicas !== true && tieneAccionSobreTipo(dto, ticket.tipoId, 'OBSERVAR')) {
      return Result.ok(operaciones);
    }
    return Result.ok(operaciones.filter((op) => !op.esInterno));
  }
}
