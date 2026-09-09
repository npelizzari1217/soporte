import { ISlaTicketWriteRepository } from '../../domain/ports/i-sla-ticket-write.repository';
import { CalcularSlaVenceService } from '../../domain/services/calcular-sla-vence.service';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IPrioridadRepository } from '../../../tickets/domain/ports/i-prioridad.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TIPO_CODIGO_PREVENTIVO } from '../../../tickets/domain/tipos-ticket.constants';
import { ESTADOS_TERMINALES } from '../../../tickets/domain/state-machine/estados.constants';

// Estados sin arcos de salida — un ticket en uno de estos códigos NO
// recalcula su SLA al repriorizarse (S3). Se DERIVA de la fuente única de
// `tickets/domain/state-machine/`, la misma que usa `TicketEntity`: antes
// estaba redeclarado acá con el argumento de que este módulo solo importaba
// puertos, y ese argumento dejó de valer al importar `TIPO_CODIGO_PREVENTIVO`
// arriba. Un guard de dominio espejado en dos capas se declara una sola vez.

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
 * Fuente de las horas de SLA: `IPrioridadRepository` (`prioridad.slaHoras`/
 * `slaActivo`) — antes leía la tabla separada `sla_config` (`ISlaConfigRepository`,
 * eliminada). El CÁLCULO no cambió, solo el origen de los datos: el SLA es
 * un atributo de la prioridad, editable desde Catálogos.
 *
 * issue #135: los tickets de tipo `PREVENTIVO` (el barrido de mantenimiento
 * preventivo) quedan FUERA de `cumplimientoSla` — `aplicar()` corta antes de
 * calcular nada si el `tipoId` del ticket resuelve al código `PREVENTIVO`
 * (`TIPO_TICKET_REPOSITORY`, mismo puerto que ya usa `GenerarPreventivosUseCase`).
 * Si el tenant todavía no tiene el tipo sembrado (`findIdByCodigo` → null),
 * la comparación no iguala nunca y el cálculo sigue normal — a diferencia
 * del throw defensivo del preventivo, este módulo NO puede romper la
 * creación de tickets por un catálogo desactualizado.
 *
 * Ref spec: sdd/premium/spec S2, S3. Ref design: ADR-P2, ADR-P4. Tarea: SA12.
 */
export class AplicarSlaUseCase {
  constructor(
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findById'>,
    private readonly slaTicketWriteRepo: Pick<ISlaTicketWriteRepository, 'setSlaVenceAt'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly calculador: Pick<CalcularSlaVenceService, 'venceAt'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findIdByCodigo'>,
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
    await this.aplicar(ticket.id, ticket.tipoId, dto.prioridadId, ticket.createdAt);
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

    await this.aplicar(ticket.id, ticket.tipoId, dto.prioridadId, ticket.createdAt);
  }

  /**
   * Cálculo + persistencia compartidos por ambos flujos (S2/S3): sin
   * `slaHoras` configurado, o `slaActivo=false`, o prioridad inexistente
   * (defensivo) → `sla_vence_at = null` (sin SLA aplicable).
   *
   * issue #135 (corte de SLA para preventivo): PRIMERO resuelve el `tipoId`
   * del código `PREVENTIVO` — si coincide con el `tipoId` del ticket, corta
   * en este punto, sin consultar la prioridad ni calcular nada: `sla_vence_at = null`
   * siempre para un ticket generado por el barrido de mantenimiento
   * preventivo. Con el tipo sin sembrar (`findIdByCodigo` → null) la
   * comparación no iguala y sigue el cálculo normal: este módulo no puede
   * romper la creación/repriorización de un ticket por un catálogo
   * desactualizado (criterio distinto al throw defensivo del preventivo).
   */
  private async aplicar(
    ticketId: string,
    tipoId: string,
    prioridadId: string,
    creadoEn: Date,
  ): Promise<void> {
    const tipoPreventivoId = await this.tipoTicketRepo.findIdByCodigo(TIPO_CODIGO_PREVENTIVO);
    // Sin guarda explícita contra `null`: `tipoId` es `string`, así que un
    // catálogo sin el tipo sembrado (`findIdByCodigo` → null) nunca iguala y
    // cae solo al cálculo normal. La guarda extra sería infalsificable.
    if (tipoId === tipoPreventivoId) {
      await this.slaTicketWriteRepo.setSlaVenceAt(ticketId, null);
      return;
    }

    const prioridad = await this.prioridadRepo.findById(prioridadId);
    const venceAt =
      prioridad && prioridad.slaHoras !== null && prioridad.slaActivo
        ? this.calculador.venceAt(creadoEn, prioridad.slaHoras)
        : null;
    await this.slaTicketWriteRepo.setSlaVenceAt(ticketId, venceAt);
  }
}
