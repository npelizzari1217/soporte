import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { IUsuarioTiposTicketRepository } from '../../domain/ports/i-usuario-tipos-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import {
  TicketNoEncontradoError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
} from '../../domain/errors/tickets.errors';

/**
 * DTO de entrada de `AsignarTicketUseCase`.
 *
 * - `asignadoId`: UUID del usuario que recibirá la asignación (soft ref a
 *   master.usuarios). Puede ser el propio `autorId` (un agente "toma" un
 *   ticket) o un tercero (un COLABORADOR/TECNICO+ con `ticket:asignar` se
 *   lo asigna a otro) — el use case no distingue ambos casos, ambos son
 *   asignación MANUAL (T14). Lo único prohibido es la auto-asignación
 *   AUTOMÁTICA por el sistema (sin acción humana), que este flujo nunca
 *   dispara por sí mismo.
 * - `clienteId`: `cliente_id` del JWT — usado SOLO para la validación
 *   cross-DB del asignado (`IUsuarioMasterChecker.estaActivoEnTenant`).
 * - `autorId`: `sub` del JWT del actor que ejecuta la acción (quien tiene
 *   `ticket:asignar`, verificado por `PermissionsGuard` en la capa de
 *   interface) — se registra como autor de la operación de timeline.
 */
export interface AsignarTicketDto {
  ticketId: string;
  asignadoId: string;
  clienteId: string;
  autorId: string;
}

/**
 * AsignarTicketUseCase — asignación manual de un responsable a un ticket
 * (T14, T15).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe o está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Valida que el asignado existe en `master.usuarios` con `activo=true` y
 *    pertenece (vía membresía activa) al tenant activo (cross-DB,
 *    `IUsuarioMasterChecker.estaActivoEnTenant`). Si no → `AsignadoInvalidoError` (422).
 * 3. Valida elegibilidad: el asignado debe tener fila en `usuario_tipos_ticket`
 *    para el `tipoId` ACTUAL del ticket (T3, routing — dato, NO permiso RBAC).
 *    Si no → `AsignadoNoElegibleError` (422). Esta validación es ORTOGONAL al
 *    permiso `ticket:asignar` del actor (T15): un actor con el permiso puede
 *    intentar asignar a alguien no elegible y de todos modos falla acá.
 * 4. Resuelve el id del tipo de operación `ASIGNACION` del catálogo tenant
 *    (catálogo FIJO garantizado por el seed — su ausencia es un fallo de
 *    infraestructura, no un error del caller: `throw` defensivo, mismo
 *    patrón que `CrearTicketUseCase`/`TransicionarEstadoUseCase`).
 * 5. **DENTRO de la transacción** (`ITenantTransactionRunner.run`, T24):
 *    `ticket.assignTo(asignadoId)`, crea la operación `ASIGNACION` del
 *    timeline (sin `estadoAnterior`/`estadoNuevo` — no es un cambio de
 *    estado, T9/T12 siguen siendo el único camino para transicionar), y
 *    persiste ambos.
 *
 * DELIBERADAMENTE NO transiciona el estado del ticket (ej. NUEVO→ASIGNADO):
 * ni la spec (T14/T15) ni el design/tasks de esta fase piden acoplar
 * asignación con transición de estado — son conceptos ortogonales, igual
 * que T9 (máquina de estados, PR7) y T14 (asignación, PR8) lo son en la
 * SPEC. Si se necesitara ese acoplamiento, el caller debe invocar
 * `TransicionarEstadoUseCase` por separado (PATCH .../estado).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/tickets-core/spec T14, T15. Tarea: T8.1, T8.2.
 */
export class AsignarTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'estaActivoEnTenant'>,
    private readonly usuarioTiposTicketRepo: Pick<
      IUsuarioTiposTicketRepository,
      'isUserEligibleForType'
    >,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AsignarTicketDto): Promise<Result<TicketEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const asignadoActivo = await this.usuarioMasterChecker.estaActivoEnTenant(
      dto.asignadoId,
      dto.clienteId,
    );
    if (!asignadoActivo) {
      return Result.fail(new AsignadoInvalidoError(dto.asignadoId));
    }

    const esElegible = await this.usuarioTiposTicketRepo.isUserEligibleForType(
      dto.asignadoId,
      ticket.tipoId,
    );
    if (!esElegible) {
      return Result.fail(new AsignadoNoElegibleError(dto.asignadoId, ticket.tipoId));
    }

    // Catálogo FIJO garantizado por el seed — su ausencia es un bug de
    // infraestructura, no un error del caller: throw defensivo (mismo
    // patrón que CrearTicketUseCase/TransicionarEstadoUseCase).
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('ASIGNACION');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "ASIGNACION" en el tenant activo.',
      );
    }

    await this.txRunner.run(async () => {
      ticket.assignTo(dto.asignadoId);

      const operacion = OperacionTicketEntity.create({
        ticketId: ticket.id,
        tipoOperacionId,
        descripcion: null,
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: dto.autorId,
        esInterno: false,
        metadata: null,
      });

      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
