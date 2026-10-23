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
import { ReparacionNoEditableError } from '../../domain/errors/reparaciones.errors';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { comprasQueBloquean } from '../../domain/services/bloqueo-reparacion';
import {
  AlcanceActorTicket,
  puedeOperarTicket,
} from '../../../tickets/application/services/visibilidad-ticket';

/** Entrada de `EditarReparacionUseCase`. Un campo ausente no se toca; `null` limpia. */
export interface EditarReparacionDto {
  /** Id del ticket (las rutas de reparaciones lo resuelven desde el satélite, `ResolutorReparacion`). */
  ticketId: string;
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  /** Ubicación del ticket: desde odd/ticket-unificado (S1) es una sola, la de `tickets.ubicacion`. */
  ubicacion?: string | null;
  sectorId?: string | null;
  /** ROOT (`is_global_admin`): salta la regla "no se empezó a trabajar", nunca el bloqueo por compra. */
  actorEsRoot: boolean;
  /** Permisos por tipo del actor: exige ver el ticket base y `MODIFICACION` sobre su tipo (D5 c). */
  alcance: AlcanceActorTicket;
}

/** Resultado de la edición: el ticket guardado y el nombre de su sector vigente. */
export interface ReparacionEditada {
  ticket: TicketEntity;
  sectorNombre: string | null;
}

/**
 * EditarReparacionUseCase — edita un ticket desde Edilicia (odd/detalle-ticket-legible, S4-S5):
 * título, descripción, prioridad, sector y ubicación, todos del ticket (odd/ticket-unificado, S1:
 * la ubicación del satélite quedó congelada). Vale para un ticket de cualquier tipo.
 *
 * Regla "no se empezó a trabajar" (decisión del dueño): se edita si el ticket está NUEVO o ASIGNADO y
 * ninguna tarea activa está completada; fuera de eso, solo ROOT. Una reparación **bloqueada** (con
 * una compra activa vinculada) no la edita nadie, ROOT incluido.
 *
 * Flujo:
 * 1. Validaciones de catálogo fuera de la transacción: prioridad y sector tienen que existir (un
 *    sector desactivado sigue siendo válido, como al editar el ticket).
 * 2. Dentro de la transacción, con la fila del ticket bloqueada ANTES de leer
 *    (odd/escrituras-manuales-con-lock): carga el ticket, evalúa la regla sobre el estado vigente,
 *    las compras vinculadas y las tareas actuales, y lo guarda. Con la fila ya
 *    bloqueada exige además ver el ticket base (404 si no) y `MODIFICACION` sobre su tipo (403;
 *    odd/permisos-por-tipo-ticket, D5 c), así que una reasignación concurrente no cambia la decisión.
 * 3. Post-commit: si cambió la prioridad, publica `TicketReprioritizadoEvent` (el módulo SLA recalcula
 *    el vencimiento), igual que `EditarTicketUseCase`.
 */
export class EditarReparacionUseCase {
  constructor(
    private readonly ticketRepo: Pick<
      ITicketRepository,
      'findById' | 'bloquear' | 'save' | 'esVisiblePara'
    >,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly reparacionCompraRepo: Pick<
      IReparacionCompraRepository,
      'findComprasVinculadasByTicketIds'
    >,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findById'>,
    private readonly sectorRepo: Pick<ISectorRepository, 'findById'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run' | 'alCommitear'>,
  ) {}

  /**
   * @param dto Ticket, campos a cambiar y actor.
   * @returns El ticket editado; 404, 403 o 422 según corresponda.
   */
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
    const { ticket, cambioPrioridad } = edicion.getValue();

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
    return Result.ok({ ticket, sectorNombre });
  }

  /** Lock, carga, regla y guardado del ticket, dentro de la transacción. */
  private async editarBloqueada(
    dto: EditarReparacionDto,
  ): Promise<Result<{ ticket: TicketEntity; cambioPrioridad: boolean }, DomainError>> {
    await this.ticketRepo.bloquear(dto.ticketId);
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }
    const acceso = await puedeOperarTicket(this.ticketRepo, ticket, dto.alcance, 'MODIFICACION');
    if (acceso.isFail()) {
      return Result.fail(acceso.getError());
    }

    // El bloqueo por compra no lo salta nadie: se evalúa antes que la regla de ROOT.
    const vinculadas =
      (await this.reparacionCompraRepo.findComprasVinculadasByTicketIds([ticket.id])).get(
        ticket.id,
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
      ubicacion: dto.ubicacion,
      sectorId: dto.sectorId,
    });

    await this.ticketRepo.save(ticket);
    return Result.ok({ ticket, cambioPrioridad });
  }
}
