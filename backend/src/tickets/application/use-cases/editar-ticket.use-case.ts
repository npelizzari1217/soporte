import { DomainError, Result } from '../../../shared/domain/result';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketReprioritizadoEvent } from '../../domain/events/ticket-reprioritizado.event';
import {
  TicketNoEncontradoError,
  PrioridadNoEncontradaError,
  SectorTicketInexistenteError,
  TicketBloqueadoParaEdicionError,
} from '../../domain/errors/tickets.errors';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ESTADOS_PRE_PROCESO } from '../../domain/state-machine/estados.constants';

/**
 * DTO de entrada de `EditarTicketUseCase` (T8 — PATCH semántico).
 *
 * `tipoId` está deliberadamente EXCLUIDO (no forma parte del contrato de
 * edición de datos — spec T8 solo menciona titulo/descripcion/prioridadId).
 * `estado` NUNCA se edita por esta vía — es una transición (T9, PR7).
 */
export interface EditarTicketDto {
  ticketId: string;
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  /** Ubicación general (odd/ubicacion-sector-ticket). `null` limpia; ausente no toca. */
  ubicacion?: string | null;
  /** Sector del cliente (odd/ubicacion-sector-ticket). `null` limpia; ausente no toca. */
  sectorId?: string | null;
  /**
   * `true` si el actor es ROOT (`is_global_admin`). ROOT edita SIEMPRE,
   * incluso con el ticket EN_PROCESO o posterior. El resto solo puede editar
   * mientras el ticket esté en NUEVO/ASIGNADO (`ESTADOS_PRE_PROCESO`).
   */
  actorEsRoot: boolean;
}

/**
 * EditarTicketUseCase — edita los campos de datos de un ticket (T8).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe o está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Si `prioridadId` viene definido, valida que exista en el catálogo del
 *    tenant → `PrioridadNoEncontradaError` (422) si no.
 * 2b. Si `sectorId` viene con valor, valida que exista en el catálogo
 *    → `SectorTicketInexistenteError` (422). No se exige activo: un ticket viejo
 *    con un sector desactivado se sigue pudiendo editar (odd/ubicacion-sector-ticket).
 * 3. Aplica `TicketEntity.actualizarDatos()` (PATCH parcial — campos
 *    `undefined` no se tocan).
 * 4. Persiste.
 *
 * A diferencia de `CrearTicketUseCase`/`TransicionarEstadoUseCase`, NO
 * registra una operación de timeline ni usa `ITenantTransactionRunner`: la
 * spec T8 y la matriz de tests del design NO incluyen edición de datos
 * entre las mutaciones que requieren atomicidad con el timeline (T24 solo
 * lista crear/transicionar/asignar/adjuntar). Editar ubicación o sector
 * tampoco deja entrada en el historial.
 *
 * Ref spec: sdd/tickets-core/spec T8. Tarea: T6.5.
 */
export class EditarTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly prioridadRepo: IPrioridadRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly sectorRepo: Pick<ISectorRepository, 'findById'>,
  ) {}

  async execute(dto: EditarTicketDto): Promise<Result<TicketEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // Regla de bloqueo por estado: una vez que el ticket sale de
    // NUEVO/ASIGNADO (entra EN_PROCESO o posterior), SOLO ROOT puede editar
    // los datos. ROOT bypassa SIEMPRE. El catálogo de estados es FIJO (ADR-1)
    // — su ausencia es un bug de infraestructura, no un error del caller:
    // throw defensivo (mismo criterio que `TransicionarEstadoUseCase`).
    if (!dto.actorEsRoot) {
      const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
      if (!estadoActual) {
        throw new Error(
          `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
        );
      }
      if (!ESTADOS_PRE_PROCESO.has(estadoActual.codigo)) {
        return Result.fail(new TicketBloqueadoParaEdicionError(estadoActual.codigo));
      }
    }

    if (dto.prioridadId !== undefined) {
      const prioridad = await this.prioridadRepo.findById(dto.prioridadId);
      if (!prioridad) {
        return Result.fail(new PrioridadNoEncontradaError(dto.prioridadId));
      }
    }

    if (dto.sectorId) {
      const sector = await this.sectorRepo.findById(dto.sectorId);
      if (!sector) {
        return Result.fail(new SectorTicketInexistenteError(dto.sectorId));
      }
    }

    // Fase 4 (S3, GATE G3): detecta el cambio REAL de prioridad ANTES de
    // mutar la entidad — necesario para no publicar el evento cuando el
    // caller reenvía la misma prioridadId (sin cambio efectivo).
    const cambioPrioridad = dto.prioridadId !== undefined && dto.prioridadId !== ticket.prioridadId;

    ticket.actualizarDatos({
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      prioridadId: dto.prioridadId,
      ubicacion: dto.ubicacion,
      sectorId: dto.sectorId,
    });

    await this.ticketRepo.save(ticket);

    // POST-COMMIT (Fase 4, S3 — GATE G3, aditivo): publica
    // TicketReprioritizadoEvent para que el módulo SLA recalcule
    // sla_vence_at (AplicarSlaUseCase) desde el createdAt ORIGINAL del
    // ticket (ancla fija). Mismo criterio ADR-6: log-and-swallow.
    if (cambioPrioridad) {
      try {
        this.eventPublisher.publish(
          new TicketReprioritizadoEvent({ ticketId: ticket.id, prioridadId: ticket.prioridadId }),
        );
      } catch {
        // log-and-swallow (ADR-6).
      }
    }

    return Result.ok(ticket);
  }
}
