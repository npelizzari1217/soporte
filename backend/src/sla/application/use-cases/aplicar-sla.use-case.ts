import { ISlaConfigRepository } from '../../domain/ports/i-sla-config.repository';
import { ISlaTicketWriteRepository } from '../../domain/ports/i-sla-ticket-write.repository';
import { CalcularSlaVenceService } from '../../domain/services/calcular-sla-vence.service';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';

/**
 * Estados sin arcos de salida (mismo catálogo que `TERMINAL_STATES` de
 * `TicketEntity`, Fase 2) — un ticket en uno de estos códigos NO recalcula
 * su SLA al repriorizarse (S3). Redeclarado localmente: el módulo SLA no
 * importa constantes internas de `tickets/domain/`, solo sus puertos.
 */
const ESTADOS_TERMINALES = new Set<string>(['CERRADO', 'CANCELADO']);

/** DTO de entrada de `AplicarSlaUseCase` (S2/S3) — datos mínimos del evento consumido. */
export interface AplicarSlaDto {
  ticketId: string;
  prioridadId: string;
}

/**
 * AplicarSlaUseCase — calcula y persiste `sla_vence_at` al crear o
 * repriorizar un ticket (S2, S3). Consumido por los listeners
 * `@OnEvent('ticket.creado')`/`@OnEvent('ticket.reprioritizado')`
 * (infrastructure/listeners, ADR-P8).
 *
 * Lee `createdAt`/`estadoId` vía `ITicketRepository` (Fase 2, exportado por
 * `TicketsModule`) en vez de confiar en `occurredAt` del evento — garantiza
 * usar el `createdAt` PERSISTIDO como ancla fija (S3), no el instante en que
 * el evento se emitió/consumió.
 *
 * Ref spec: sdd/premium/spec S2, S3. Ref design: ADR-P2, ADR-P4. Tarea: SA12.
 */
export class AplicarSlaUseCase {
  constructor(
    private readonly slaConfigRepo: Pick<ISlaConfigRepository, 'findByPrioridad'>,
    private readonly slaTicketWriteRepo: Pick<ISlaTicketWriteRepository, 'setSlaVenceAt'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly calculador: Pick<CalcularSlaVenceService, 'venceAt'>,
  ) {}

  /**
   * Consume `ticket.creado` (S2): calcula `sla_vence_at` desde el
   * `createdAt` del ticket recién creado y la config activa de su prioridad.
   */
  async alCrear(dto: AplicarSlaDto): Promise<void> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket) {
      // Defensivo: el ticket referenciado por el evento debería existir
      // siempre (post-commit del mismo alta) — su ausencia no es un caso de
      // negocio a modelar, se ignora sin lanzar (listener log-and-swallow).
      return;
    }
    await this.aplicar(ticket.id, dto.prioridadId, ticket.createdAt);
  }

  /**
   * Consume `ticket.reprioritizado` (S3): recalcula `sla_vence_at` desde el
   * `createdAt` ORIGINAL del ticket (ancla fija — nunca la fecha de
   * repriorización). Si el ticket ya está en estado terminal
   * (CERRADO/CANCELADO), NO recalcula.
   */
  async alReprioritizar(dto: AplicarSlaDto): Promise<void> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return;
    }

    const estado = await this.estadoRepo.findById(ticket.estadoId);
    if (estado && ESTADOS_TERMINALES.has(estado.codigo)) {
      return;
    }

    await this.aplicar(ticket.id, dto.prioridadId, ticket.createdAt);
  }

  /**
   * Cálculo + persistencia compartidos por ambos flujos (S2/S3): sin config
   * activa para la prioridad → `sla_vence_at = null` (sin SLA aplicable).
   */
  private async aplicar(ticketId: string, prioridadId: string, creadoEn: Date): Promise<void> {
    const config = await this.slaConfigRepo.findByPrioridad(prioridadId);
    const venceAt =
      config && config.activo ? this.calculador.venceAt(creadoEn, config.horas) : null;
    await this.slaTicketWriteRepo.setSlaVenceAt(ticketId, venceAt);
  }
}
