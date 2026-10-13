import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { TecnicoTareaNoElegibleError } from '../../domain/errors/tareas.errors';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { evaluarResponsableRegla } from '../services/elegibilidad-responsable-regla';
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
  /** `cliente_id` del JWT, para resolver los técnicos elegibles en master. */
  clienteId: string;
  /** Técnico nuevo, o `null` para dejar la tarea sin técnico. */
  tecnicoId: string | null;
}

/**
 * AsignarTecnicoTareaUseCase — asigna el técnico de una tarea o lo quita (odd/tareas-con-tecnico,
 * CA2, CA3, CA8).
 *
 * El técnico tiene que ser elegible con la regla del punto 9: TECNICO o COLABORADOR con el módulo
 * del tipo del ticket. Se reusa `evaluarResponsableRegla`, que pide a master el mismo universo que
 * el selector (`listarTecnicosAsignables`), así que un ADMINISTRADOR o ROOT no es técnico de una
 * tarea. Quitar el técnico no consulta master.
 *
 * Reasignar el mismo técnico no cambia nada y no escribe historial. Cualquier otro cambio escribe
 * `TAREA_ASIGNADA` con el técnico anterior y el nuevo, en la misma transacción que la tarea.
 */
export class AsignarTecnicoTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId' | 'guardar'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
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
    const { modulo } = gestion.getValue();

    const tareaResult = await cargarTareaDelTicket(this.tareaRepo, dto.ticketId, dto.tareaId);
    if (tareaResult.isFail()) return Result.fail(tareaResult.getError());
    const tarea = tareaResult.getValue();

    if (dto.tecnicoId !== null) {
      const elegible = await evaluarResponsableRegla(
        dto.tecnicoId,
        dto.clienteId,
        modulo,
        this.usuarioMasterChecker,
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

    await this.txRunner.run(async () => {
      await this.tareaRepo.guardar(tarea);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(tarea);
  }
}
