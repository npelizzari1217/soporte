import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ActorTarea, autorizarGestion } from '../services/tareas-ticket.reglas';
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
 * El universo es el mismo que valida `AsignarTecnicoTareaUseCase` (`listarTecnicosAsignables` con
 * el módulo del tipo, la regla del punto 9), así que el selector nunca ofrece a alguien que la
 * asignación rechazaría. Lo pide quien puede asignar (`autorizarGestion`), no quien tiene
 * `TICKETS:ASIGNAR`: por eso no se reusa `GET /tickets/:id/asignables`, que exige ese permiso y
 * dejaría sin selector al responsable de un ticket de Edilicia que no lo tenga.
 */
export class ListarTecnicosElegiblesTareaUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>,
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

    const tecnicos = await this.usuarioMasterChecker.listarTecnicosAsignables(
      dto.clienteId,
      gestion.getValue().modulo,
    );
    return Result.ok(tecnicos);
  }
}
