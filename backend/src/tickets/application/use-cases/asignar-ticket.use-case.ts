import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { IUsuarioTiposTicketRepository } from '../../domain/ports/i-usuario-tipos-ticket.repository';

/**
 * DTO de entrada para la asignación de un ticket.
 *
 * - `ticketId`: UUID del ticket a asignar.
 * - `asignadoId`: UUID del usuario que recibirá la asignación (soft ref a master.usuarios).
 * - `clienteId`: viene del JWT claim; se usa para validar la pertenencia del
 *   asignado al tenant sin pasar el JWT directamente al use case.
 * - `autorId`: viene del JWT claim; se registra en la operacion de timeline.
 */
export interface AsignarTicketDto {
  ticketId: string;
  asignadoId: string;
  /** UUID del cliente (tenant), extraído del JWT. */
  clienteId: string;
  /** UUID del autor que realiza la acción, extraído del JWT. */
  autorId: string;
}

/**
 * AsignarTicketUseCase — caso de uso para asignar un responsable a un ticket.
 *
 * Flujo:
 * 1. Carga el ticket por id → 404 si no existe.
 * 2. Verifica que el asignado existe en master.usuarios con activo = TRUE y
 *    pertenece al tenant del JWT (cross-DB validation). Sin ello → 422.
 * 3. Verifica elegibilidad: existe fila en usuario_tipos_ticket con
 *    usuario_id = asignadoId y tipo_ticket_id = ticket.tipoId. Sin ello → 422.
 * 4. Resuelve el id del tipo de operación ASIGNACION del catálogo tenant.
 * 5. Llama ticket.assignTo(asignadoId) para mutar la entidad.
 * 6. Crea OperacionTicketEntity de tipo ASIGNACION.
 * 7. Persiste ticket + operacion en la MISMA transacción vía ITenantTransactionRunner.
 * 8. Retorna Result.ok(ticket).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:tickets-core/Asignado debe ser elegible para el tipo de ticket]
 * Ref spec: [SPEC:tickets-core/Elegibilidad de asignación separada de permisos]
 * Tarea: 3.C.4
 */
export class AsignarTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly usuarioTiposTicketRepo: IUsuarioTiposTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AsignarTicketDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Cargar el ticket
    // WARNING-1 fix: findById también devuelve tickets soft-deleted; tratarlos como no encontrados.
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Validar que el asignado existe en master con activo = TRUE y pertenece al tenant.
    //    Diferente del solicitante (que solo requiere deleted_at IS NULL): el asignado
    //    debe estar activo para poder recibir nuevas asignaciones.
    const asignadoActivo = await this.usuarioMasterChecker.estaActivoEnTenant(
      dto.asignadoId,
      dto.clienteId,
    );
    if (!asignadoActivo) {
      return Result.fail(new AsignadoInvalidoError(dto.asignadoId));
    }

    // 3. Validar elegibilidad: el asignado debe tener un registro en usuario_tipos_ticket
    //    para el tipo de ticket del ticket a asignar. Esta validación es SEPARADA de los
    //    permisos RBAC: es enrutamiento de trabajo, no autorización de acción.
    const esElegible = await this.usuarioTiposTicketRepo.isUserEligibleForType(
      dto.asignadoId,
      ticket.tipoId,
    );
    if (!esElegible) {
      return Result.fail(new AsignadoNoElegibleError(dto.asignadoId, ticket.tipoId));
    }

    // 4. Resolver el id del tipo de operación ASIGNACION del catálogo tenant
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('ASIGNACION');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('ASIGNACION'));
    }

    // 5. Mutar la entidad ticket con el nuevo asignado
    ticket.assignTo(dto.asignadoId);

    // 6. Crear la operación de timeline ASIGNACION
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      metadata: null,
    });

    // 7. Persistir ticket actualizado + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
