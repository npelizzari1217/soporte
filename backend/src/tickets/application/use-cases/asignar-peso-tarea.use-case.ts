import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import {
  PesoTareaSoloExternoError,
  PesoTareasExcedeTotalError,
  TareaNoEncontradaError,
} from '../../domain/errors/tareas.errors';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { sumaDePesosAdmitida, sumaDePesosConCambio } from '../../domain/services/pesos-tareas';
import { bloquearTicketActivo } from '../services/bloquear-ticket-activo';
import { VerificadorTicketEditable } from '../services/ticket-editable-para-tareas';
import {
  ActorTarea,
  autorizarGestion,
  cargarTareaDelTicket,
  mapearErrorDeTarea,
  TicketRepoDeTareas,
} from '../services/tareas-ticket.reglas';

export interface AsignarPesoTareaDto {
  ticketId: string;
  tareaId: string;
  actor: ActorTarea;
  /** Porcentaje entero 0..100, ya validado por el DTO. */
  peso: number;
}

/**
 * AsignarPesoTareaUseCase — fija el peso de una tarea de un ticket EXTERNA
 * (odd/edilicia-obra-externa, S4, S9, L16, L17).
 *
 * Lo pueden hacer quienes gestionan las tareas del ticket (`autorizarGestion`), con las mismas
 * reglas de estado y de bloqueo por compra que el resto de las escrituras de tareas.
 *
 * La suma de los pesos de las tareas activas nunca supera 100: el sistema no redistribuye, así que
 * para subir una tarea el usuario baja antes otras (L16). La suma se calcula DENTRO de la
 * transacción, con el lock del ticket tomado: dos ediciones a la par no pueden pasar el tope entre
 * las dos. Reenviar el mismo peso no escribe nada.
 *
 * No escribe historial: el catálogo de tipos de operación no tiene uno para el peso, y sumarlo es
 * una migración de datos que esta tarea no necesita.
 */
export class AsignarPesoTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tareaRepo: Pick<
      ITareaTicketRepository,
      'buscarPorId' | 'listarPorTicket' | 'asignarPesoSiActiva'
    >,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly verificadorEditable: Pick<
      VerificadorTicketEditable,
      'verificar' | 'verificarEstado'
    >,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * @param dto Ticket, tarea, actor y peso pedido.
   * @returns La tarea con su peso nuevo, o el error de autorización, estado, modalidad o tope.
   */
  async execute(dto: AsignarPesoTareaDto): Promise<Result<TareaTicketEntity, DomainError>> {
    const gestion = await autorizarGestion(
      { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
      dto.ticketId,
      dto.actor,
      'ponderar',
    );
    if (gestion.isFail()) return Result.fail(gestion.getError());
    const { ticket } = gestion.getValue();

    const tareaResult = await cargarTareaDelTicket(this.tareaRepo, dto.ticketId, dto.tareaId);
    if (tareaResult.isFail()) return Result.fail(tareaResult.getError());
    const tarea = tareaResult.getValue();

    const editable = await this.verificadorEditable.verificar(ticket, dto.actor.esAdministrador);
    if (editable.isFail()) return Result.fail(editable.getError());

    if (ticket.modalidad !== 'EXTERNA') return Result.fail(new PesoTareaSoloExternoError());
    if (tarea.peso === dto.peso) return Result.ok(tarea);

    const cambio = tarea.asignarPeso(dto.peso, this.ahora());
    if (cambio.isFail()) return Result.fail(mapearErrorDeTarea(cambio.getError(), tarea.id));

    const escritura = await this.txRunner.run(async (): Promise<Result<void, DomainError>> => {
      const actual = await bloquearTicketActivo(this.ticketRepo, ticket.id);
      if (!actual) return Result.fail(new TicketNoEncontradoError(ticket.id));
      const vigente = await this.verificadorEditable.verificarEstado(
        actual,
        dto.actor.esAdministrador,
      );
      if (vigente.isFail()) return vigente;

      const tareas = await this.tareaRepo.listarPorTicket(ticket.id);
      const suma = sumaDePesosConCambio(tareas, tarea.id, dto.peso);
      if (!sumaDePesosAdmitida(suma)) return Result.fail(new PesoTareasExcedeTotalError(suma));

      if (!(await this.tareaRepo.asignarPesoSiActiva(tarea))) {
        return Result.fail(new TareaNoEncontradaError(tarea.id));
      }
      return Result.ok(undefined);
    });
    if (escritura.isFail()) return Result.fail(escritura.getError());

    return Result.ok(tarea);
  }
}
