import { ISlaTicketWriteRepository } from '../../domain/ports/i-sla-ticket-write.repository';
import { CalcularSlaVenceService } from '../../domain/services/calcular-sla-vence.service';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IPrioridadRepository } from '../../../tickets/domain/ports/i-prioridad.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TIPO_CODIGO_PREVENTIVO } from '../../../tickets/domain/tipos-ticket.constants';
import { ESTADOS_TERMINALES } from '../../../tickets/domain/state-machine/estados.constants';
import { SlaRegla } from '../../../tickets/domain/entities/ticket.entity';
import { CalcularSlaHabilVenceService } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ICalendarioLaboralSemanalRepository } from '../../../calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository';
import { IFeriadosLaboralesRepository } from '../../../calendario-laboral/domain/ports/i-feriados-laborales.repository';

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
 * sdd/sla-habil WU-3 — discriminador de cohortes: el corte PREVENTIVO de
 * arriba corre PRIMERO, sin importar `ticket.slaRegla` (un preventivo queda
 * en `null` siempre). Para todo lo demás, `aplicar()` elige el calculador
 * por `ticket.slaRegla` — nunca por un estado global — y NUNCA lo escribe:
 * ningún caso de uso elige esa cohorte (de dónde sale su valor, ver el
 * docstring de `SlaRegla` en `tickets/domain/entities/ticket.entity.ts`).
 * Un ticket `CORRIDO` sigue con `CalcularSlaVenceService` (24/7, sin
 * cambios); uno `HABIL` usa `CalcularSlaHabilVenceService` sobre el
 * calendario semanal propio del cliente (tenant, sdd/horario-laboral-por-cliente)
 * y los feriados que aplican al cliente del ticket: los globales de MASTER
 * unidos a los propios de la base del tenant (`CalendarioLaboralModule`).
 * Sin fallback silencioso: si
 * `calendarioRepo`/`feriadosRepo` lanzan — incluido el fail-closed cuando no
 * hay `TenantContext` —, el error se propaga tal cual y
 * `AplicarSlaListener` lo registra (`SLA_APLICAR_ERROR`) sin revertir el
 * ticket ya committeado.
 *
 * Costo (documentado, sin optimizar — no hay evidencia de que sea un cuello
 * de botella, y un caché se desactualizaría cuando alguien edite feriados
 * desde los ABM): un ticket `HABIL` suma el calendario del cliente (tenant)
 * más los feriados (MASTER y tenant, en paralelo) a la consulta que ya hacía este use
 * case (`findIdByCodigo` del tipo PREVENTIVO), por creación o
 * repriorización. Los tickets ya abiertos no se recalculan al cambiar un
 * feriado; solo al repriorizarse.
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
    private readonly calculadorHabil: Pick<CalcularSlaHabilVenceService, 'venceAt'>,
    private readonly calendarioRepo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>,
    private readonly feriadosRepo: Pick<IFeriadosLaboralesRepository, 'obtener'>,
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
    await this.aplicar(
      ticket.id,
      ticket.tipoId,
      dto.prioridadId,
      ticket.createdAt,
      ticket.slaRegla,
    );
  }

  /**
   * Consume `ticket.reprioritizado` (S3): recalcula `sla_vence_at` desde el
   * `createdAt` ORIGINAL del ticket (ancla fija — nunca la fecha de
   * repriorización). Si el ticket ya está en estado terminal
   * (CERRADO/CANCELADO), NO recalcula.
   *
   * sdd/sla-habil WU-3: recalcula con `ticket.slaRegla` — la cohorte con la
   * que el ticket NACIÓ, leída de la fila persistida y nunca reescrita por
   * este use case. Es la garantía de que repriorizar un ticket `CORRIDO`
   * jamás lo "sube" a horas hábiles.
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

    await this.aplicar(
      ticket.id,
      ticket.tipoId,
      dto.prioridadId,
      ticket.createdAt,
      ticket.slaRegla,
    );
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
   * preventivo, SIN IMPORTAR su `slaRegla`. Con el tipo sin sembrar
   * (`findIdByCodigo` → null) la comparación no iguala y sigue el cálculo
   * normal: este módulo no puede romper la creación/repriorización de un
   * ticket por un catálogo desactualizado (criterio distinto al throw
   * defensivo del preventivo).
   */
  private async aplicar(
    ticketId: string,
    tipoId: string,
    prioridadId: string,
    creadoEn: Date,
    slaRegla: SlaRegla,
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
    if (!prioridad || prioridad.slaHoras === null || !prioridad.slaActivo) {
      await this.slaTicketWriteRepo.setSlaVenceAt(ticketId, null);
      return;
    }

    const venceAt = await this.calcularVenceAt(slaRegla, creadoEn, prioridad.slaHoras);
    await this.slaTicketWriteRepo.setSlaVenceAt(ticketId, venceAt);
  }

  /**
   * Enruta al calculador según la cohorte del ticket (WU-3, discriminador).
   * `CORRIDO` (24/7) no toca MASTER. `HABIL` lee el calendario propio del
   * cliente (tenant, sdd/horario-laboral-por-cliente) y los feriados de
   * MASTER+tenant (WU-2) — sin try/catch: un fallo de cualquiera de los dos
   * puertos propaga tal cual, nunca degrada a `CalcularSlaVenceService`
   * (eso daría un vencimiento incorrecto sin que nadie se entere).
   */
  private async calcularVenceAt(slaRegla: SlaRegla, creadoEn: Date, horas: number): Promise<Date> {
    if (slaRegla === 'CORRIDO') {
      return this.calculador.venceAt(creadoEn, horas);
    }
    const [calendario, feriados] = await Promise.all([
      this.calendarioRepo.obtener(),
      this.feriadosRepo.obtener(),
    ]);
    return this.calculadorHabil.venceAt(creadoEn, horas, calendario, feriados);
  }
}
