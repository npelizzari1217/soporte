import { DomainError, Result } from '../../../shared/domain/result';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketReprioritizadoEvent } from '../../../tickets/domain/events/ticket-reprioritizado.event';
import {
  PrioridadNoEncontradaError,
  SectorTicketInexistenteError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IPrioridadRepository } from '../../../tickets/domain/ports/i-prioridad.repository';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ESTADOS_PRE_PROCESO } from '../../../tickets/domain/state-machine/estados.constants';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import {
  ReparacionNoEditableError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { comprasQueBloquean } from '../../domain/services/bloqueo-reparacion';

/** Entrada de `EditarReparacionUseCase`. Un campo ausente no se toca; `null` limpia. */
export interface EditarReparacionDto {
  reparacionId: string;
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  /** Ubicación propia de Edilicia (`ticket_edilicia.ubicacion`), no la general del ticket. */
  ubicacion?: string | null;
  sectorId?: string | null;
  /** ROOT (`is_global_admin`): salta la regla "no se empezó a trabajar", nunca el bloqueo por compra. */
  actorEsRoot: boolean;
}

export interface ReparacionEditada {
  ticket: TicketEntity;
  ticketEdilicia: TicketEdiliciaEntity;
  sectorNombre: string | null;
}

/**
 * EditarReparacionUseCase — edita una reparación desde Edilicia (odd/detalle-ticket-legible, S4-S5):
 * título, descripción, prioridad y sector del ticket base, y la ubicación propia del satélite.
 *
 * Regla "no se empezó a trabajar" (decisión del dueño): se edita si el ticket está NUEVO o ASIGNADO y
 * ninguna tarea activa está completada; fuera de eso, solo ROOT. Una reparación **bloqueada** (con
 * una compra activa vinculada) no la edita nadie, ROOT incluido.
 *
 * Flujo:
 * 1. Validaciones de catálogo fuera de la transacción: prioridad y sector tienen que existir (un
 *    sector desactivado sigue siendo válido, como al editar el ticket).
 * 2. Dentro de la transacción, con la fila del ticket bloqueada ANTES de leer
 *    (odd/escrituras-manuales-con-lock): carga satélite y ticket, evalúa la regla sobre el estado
 *    vigente y las tareas actuales, muta las dos entidades y las guarda juntas.
 * 3. Post-commit: si cambió la prioridad, publica `TicketReprioritizadoEvent` (el módulo SLA recalcula
 *    el vencimiento), igual que `EditarTicketUseCase`.
 */
export class EditarReparacionUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById' | 'save'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'bloquear' | 'save'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly reparacionCompraRepo: Pick<
      IReparacionCompraRepository,
      'findComprasVinculadasByTicketEdiliciaIds'
    >,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findById'>,
    private readonly sectorRepo: Pick<ISectorRepository, 'findById'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run' | 'alCommitear'>,
  ) {}

  async execute(dto: EditarReparacionDto): Promise<Result<ReparacionEditada, DomainError>> {
    if (dto.prioridadId !== undefined) {
      const prioridad = await this.prioridadRepo.findById(dto.prioridadId);
      if (!prioridad) return Result.fail(new PrioridadNoEncontradaError(dto.prioridadId));
    }
    let sectorNombre: string | null = null;
    if (dto.sectorId) {
      const sector = await this.sectorRepo.findById(dto.sectorId);
      if (!sector) return Result.fail(new SectorTicketInexistenteError(dto.sectorId));
      sectorNombre = sector.nombre;
    }

    const edicion = await this.txRunner.run(() => this.editarBloqueada(dto));
    if (edicion.isFail()) return Result.fail(edicion.getError());
    const { ticket, ticketEdilicia, cambioPrioridad } = edicion.getValue();

    if (cambioPrioridad) {
      this.txRunner.alCommitear(() =>
        this.eventPublisher.publish(
          new TicketReprioritizadoEvent({ ticketId: ticket.id, prioridadId: ticket.prioridadId }),
        ),
      );
    }

    // Si no se tocó el sector, el nombre vigente lo resuelve el caller del listado; acá solo se
    // conoce el del sector recién elegido. Con `null` explícito el sector queda vacío.
    if (dto.sectorId === undefined && ticket.sectorId) {
      const vigente = await this.sectorRepo.findById(ticket.sectorId);
      sectorNombre = vigente?.nombre ?? null;
    }
    return Result.ok({ ticket, ticketEdilicia, sectorNombre });
  }

  /** Lock, carga, regla y guardado de las dos entidades, dentro de la transacción. */
  private async editarBloqueada(
    dto: EditarReparacionDto,
  ): Promise<
    Result<
      { ticket: TicketEntity; ticketEdilicia: TicketEdiliciaEntity; cambioPrioridad: boolean },
      DomainError
    >
  > {
    const satelite = await this.ticketEdiliciaRepo.findById(dto.reparacionId);
    if (!satelite || satelite.isDeleted()) {
      return Result.fail(new TicketEdiliciaNoEncontradoError(dto.reparacionId));
    }

    await this.ticketRepo.bloquear(satelite.ticketId);
    const ticket = await this.ticketRepo.findById(satelite.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(satelite.ticketId));
    }

    // El bloqueo por compra no lo salta nadie: se evalúa antes que la regla de ROOT.
    const vinculadas =
      (await this.reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds([satelite.id])).get(
        satelite.id,
      ) ?? [];
    if (comprasQueBloquean(vinculadas).length > 0) {
      return Result.fail(new ReparacionNoEditableError('BLOQUEADA'));
    }

    if (!dto.actorEsRoot) {
      const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
      if (!estadoActual) {
        throw new Error(
          `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
        );
      }
      if (!ESTADOS_PRE_PROCESO.has(estadoActual.codigo)) {
        return Result.fail(new ReparacionNoEditableError('EN_PROCESO'));
      }
      const tareas = await this.tareaRepo.listarPorTicket(ticket.id);
      if (tareas.some((t) => !t.isDeleted() && t.completada)) {
        return Result.fail(new ReparacionNoEditableError('TAREAS_COMPLETADAS'));
      }
    }

    const cambioPrioridad = dto.prioridadId !== undefined && dto.prioridadId !== ticket.prioridadId;
    ticket.actualizarDatos({
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      prioridadId: dto.prioridadId,
      sectorId: dto.sectorId,
    });
    if (dto.ubicacion !== undefined) satelite.actualizarUbicacion(dto.ubicacion);

    await this.ticketRepo.save(ticket);
    await this.ticketEdiliciaRepo.save(satelite);
    return Result.ok({ ticket, ticketEdilicia: satelite, cambioPrioridad });
  }
}
