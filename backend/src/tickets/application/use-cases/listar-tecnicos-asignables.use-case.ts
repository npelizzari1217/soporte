import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { AgenteAsignable, ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

/**
 * DTO de entrada de `ListarTecnicosAsignablesUseCase`. El alcance del actor (`AlcanceActorTicket`)
 * lo carga la capa de interface (odd/permisos-por-tipo-ticket, D5 c).
 */
export interface ListarTecnicosAsignablesDto extends AlcanceActorTicket {
  ticketId: string;
  clienteId: string;
}

/**
 * Agente (rol TECNICO o COLABORADOR) elegible para el combo de asignación
 * (proyección mínima de presentación). El nombre `TecnicoAsignable` se
 * mantiene sin renombrar aunque el universo ya incluye COLABORADOR: el
 * renombre cruza back y front.
 */
export type TecnicoAsignable = AgenteAsignable;

/**
 * ListarTecnicosAsignablesUseCase — arma el universo de AGENTES (TÉCNICOS y
 * COLABORADORES, ambos cumplen funciones de técnico) elegibles para atender
 * un ticket, para el combo del control unificado "Asignar y poner en
 * proceso".
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe, está soft-deleted o el actor no lo ve
 *    (`esTicketAccesiblePara`: `LECTURA` sobre el tipo y fila) → `TicketNoEncontradoError` (404);
 *    si lo ve sin `ASIGNAR` sobre el tipo → `AccionSobreTipoNoPermitidaError` (403).
 * 2. Delega en `ElegibilidadAsignado.listarAgentesDeTipo(clienteId, tipoId)`: TECNICO o
 *    COLABORADOR con `LECTURA` sobre el tipo del ticket (odd/permisos-por-tipo-ticket, D5 g).
 *
 * Solo LECTURA: no muta ni abre transacción. Sin throw para fallos esperados.
 */
export class ListarTecnicosAsignablesUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'listarAgentesDeTipo'>,
  ) {}

  async execute(
    dto: ListarTecnicosAsignablesDto,
  ): Promise<Result<TecnicoAsignable[], DomainError>> {
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto,
      'ASIGNAR',
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const tecnicos = await this.elegibilidad.listarAgentesDeTipo(dto.clienteId, ticket.tipoId);
    return Result.ok(tecnicos);
  }
}
