import { DomainError, Result } from '../../../shared/domain/result';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import { ActorTarea, autorizarGestion, TicketRepoDeTareas } from '../services/tareas-ticket.reglas';
import { TecnicoAsignable } from './listar-tecnicos-asignables.use-case';

export interface ListarTecnicosElegiblesTareaDto {
  ticketId: string;
  actor: ActorTarea;
  /** `cliente_id` del JWT. */
  clienteId: string;
}

/**
 * ListarTecnicosElegiblesTareaUseCase — técnicos que pueden ser técnico de una tarea del ticket
 * (odd/tareas-con-tecnico, CA3), para el selector de la sección "Tareas".
 *
 * El universo es el mismo que valida `AsignarTecnicoTareaUseCase` (TECNICO o COLABORADOR con
 * `LECTURA` sobre el tipo del ticket, `ElegibilidadAsignado`), así que el selector nunca ofrece a
 * alguien que la asignación rechazaría. Lo pide quien puede asignar (`autorizarGestion`), no quien tiene
 * `TICKETS:ASIGNAR`: por eso no se reusa `GET /tickets/:id/asignables`, que exige ese permiso y
 * dejaría sin selector al responsable de un ticket de Edilicia que no lo tenga.
 */
export class ListarTecnicosElegiblesTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'listarAgentesDeTipo'>,
  ) {}

  async execute(
    dto: ListarTecnicosElegiblesTareaDto,
  ): Promise<Result<TecnicoAsignable[], DomainError>> {
    const gestion = await autorizarGestion(
      { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
      dto.ticketId,
      dto.actor,
      'asignar',
    );
    if (gestion.isFail()) return Result.fail(gestion.getError());

    const tecnicos = await this.elegibilidad.listarAgentesDeTipo(
      dto.clienteId,
      gestion.getValue().ticket.tipoId,
    );
    return Result.ok(tecnicos);
  }
}
