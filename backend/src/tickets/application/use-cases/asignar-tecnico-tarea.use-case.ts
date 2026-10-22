import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import {
  TareaNoEncontradaError,
  TecnicoTareaNoElegibleError,
} from '../../domain/errors/tareas.errors';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { VerificadorTicketEditable } from '../services/ticket-editable-para-tareas';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import {
  ActorTarea,
  autorizarGestion,
  cargarTareaDelTicket,
  mapearErrorDeTarea,
  operacionDeTarea,
  resolverTipoOperacion,
  TicketRepoDeTareas,
} from '../services/tareas-ticket.reglas';

export interface AsignarTecnicoTareaDto {
  ticketId: string;
  tareaId: string;
  actor: ActorTarea;
  /** `cliente_id` del JWT, para resolver en master el rol y la membresía del técnico. */
  clienteId: string;
  /** Técnico nuevo, o `null` para dejar la tarea sin técnico. */
  tecnicoId: string | null;
}

/**
 * AsignarTecnicoTareaUseCase — asigna el técnico de una tarea o lo quita (odd/tareas-con-tecnico,
 * CA2, CA3, CA8).
 *
 * El técnico tiene que ser elegible con la regla del punto 9: TECNICO o COLABORADOR con `LECTURA`
 * sobre el tipo del ticket (`ElegibilidadAsignado.esAgenteDeTipo`, el mismo universo que el
 * selector; odd/permisos-por-tipo-ticket, D5 g), así que un ADMINISTRADOR o ROOT no es técnico de
 * una tarea. Quitar el técnico no consulta la elegibilidad.
 *
 * Reasignar el mismo técnico no cambia nada y no escribe historial. Cualquier otro cambio escribe
 * `TAREA_ASIGNADA` con el técnico anterior y el nuevo, en la misma transacción que la tarea.
 *
 * La escritura solo toca el técnico y exige que la tarea siga activa (T10): una asignación que
 * corre a la par de un completado no lo borra, y una tarea borrada en el medio da 404 sin
 * historial. Dos asignaciones a la par quedan con la última, como la asignación del responsable.
 */
export class AsignarTecnicoTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tareaRepo: Pick<
      ITareaTicketRepository,
      'buscarPorId' | 'asignarTecnicoSiActiva'
    >,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'esAgenteDeTipo'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly verificadorEditable: Pick<VerificadorTicketEditable, 'verificar'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async execute(dto: AsignarTecnicoTareaDto): Promise<Result<TareaTicketEntity, DomainError>> {
    const gestion = await autorizarGestion(
      { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
      dto.ticketId,
      dto.actor,
      'asignar',
    );
    if (gestion.isFail()) return Result.fail(gestion.getError());
    const { ticket } = gestion.getValue();

    const tareaResult = await cargarTareaDelTicket(this.tareaRepo, dto.ticketId, dto.tareaId);
    if (tareaResult.isFail()) return Result.fail(tareaResult.getError());
    const tarea = tareaResult.getValue();

    const editable = await this.verificadorEditable.verificar(ticket);
    if (editable.isFail()) return Result.fail(editable.getError());

    if (dto.tecnicoId !== null) {
      const elegible = await this.elegibilidad.esAgenteDeTipo(
        dto.tecnicoId,
        dto.clienteId,
        ticket.tipoId,
      );
      if (!elegible) return Result.fail(new TecnicoTareaNoElegibleError(dto.tecnicoId));
    }

    const tecnicoAnteriorId = tarea.tecnicoId;
    if (tecnicoAnteriorId === dto.tecnicoId) return Result.ok(tarea);

    const cambio = tarea.asignarTecnico(dto.tecnicoId, this.ahora());
    if (cambio.isFail()) return Result.fail(mapearErrorDeTarea(cambio.getError(), tarea.id));

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_TAREA.ASIGNADA,
    );
    const operacion = operacionDeTarea({
      tarea,
      tipoOperacionId,
      autorId: dto.actor.id,
      metadata: { tecnico_anterior_id: tecnicoAnteriorId, tecnico_nuevo_id: dto.tecnicoId },
    });

    const escrita = await this.txRunner.run(async () => {
      if (!(await this.tareaRepo.asignarTecnicoSiActiva(tarea))) return false;
      await this.operacionRepo.save(operacion);
      return true;
    });
    if (!escrita) return Result.fail(new TareaNoEncontradaError(tarea.id));

    return Result.ok(tarea);
  }
}
