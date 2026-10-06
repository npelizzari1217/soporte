import { IRelojSlaRepository } from '../../domain/ports/i-reloj-sla.repository';
import { RelojSla } from '../../domain/entities/reloj-sla';
import { MedidorCorrido } from '../../domain/services/medidor-corrido';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IPrioridadRepository } from '../../../tickets/domain/ports/i-prioridad.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TIPO_CODIGO_PREVENTIVO } from '../../../tickets/domain/tipos-ticket.constants';
import { ESTADOS_TERMINALES } from '../../../tickets/domain/state-machine/estados.constants';
import { CalcularSlaHabilVenceService } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ICalendarioLaboralSemanalRepository } from '../../../calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository';
import { IFeriadosLaboralesRepository } from '../../../calendario-laboral/domain/ports/i-feriados-laborales.repository';

/** DTO de entrada de `AplicarSlaUseCase` (S2/S3) — datos mínimos del evento consumido. */
export interface AplicarSlaDto {
  ticketId: string;
  prioridadId: string;
}

/**
 * AplicarSlaUseCase — fija la meta del ticket y deriva `sla_vence_at` al crear o repriorizar
 * (sdd/sla-primera-respuesta-y-pausa, ADR-4; sla-reloj-activo R2, R3, R7). Consumido por los
 * listeners `ticket.creado` / `ticket.reprioritizado`.
 *
 * Una sola escritura con el CAS de versión del reloj (absorbe el viejo `setSlaVenceAt`):
 * 1. pliega lo pendiente (incorpora al previo con `acumulado = 0` y su vencimiento intacto);
 * 2. fija `sla_meta_s` desde la prioridad — null para preventivos, sin `slaHoras` o con
 *    `slaActivo=false` (`slaActivo` solo condiciona la resolución, nunca el reloj);
 * 3. con el reloj corriendo deriva `sla_vence_at` con el acumulado conservado (reprioritizar no
 *    pierde las pausas); detenido lo deja como está;
 * 4. en RESUELTO recalcula `sla_cumplido` con la meta nueva.
 *
 * Editar las horas de una prioridad no pasa por acá: la meta de un ticket existente solo cambia
 * al repriorizarlo. La cohorte (`slaRegla`) se lee de la fila y nunca se reescribe. Sin fallback
 * silencioso: si el calendario o los feriados fallan, el error se propaga al listener.
 */
export class AplicarSlaUseCase {
  constructor(
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findById'>,
    private readonly relojRepo: IRelojSlaRepository,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findIdByCodigo'>,
    private readonly calculoHabil: CalcularSlaHabilVenceService,
    private readonly calendarioRepo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>,
    private readonly feriadosRepo: Pick<IFeriadosLaboralesRepository, 'obtener'>,
  ) {}

  /** `ticket.creado` (S2). */
  async alCrear(dto: AplicarSlaDto): Promise<void> {
    await this.aplicar(dto, false);
  }

  /** `ticket.reprioritizado` (S3): un ticket CERRADO/CANCELADO no recalcula. */
  async alReprioritizar(dto: AplicarSlaDto): Promise<void> {
    await this.aplicar(dto, true);
  }

  private async aplicar(dto: AplicarSlaDto, omitirTerminales: boolean): Promise<void> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) return;

    // issue #135: un preventivo queda siempre sin meta, sin consultar la prioridad. Con el tipo sin
    // sembrar (`null`) la comparación no iguala y el cálculo sigue normal.
    const tipoPreventivoId = await this.tipoTicketRepo.findIdByCodigo(TIPO_CODIGO_PREVENTIVO);
    let metaS: number | null = null;
    if (ticket.tipoId !== tipoPreventivoId) {
      const prioridad = await this.prioridadRepo.findById(dto.prioridadId);
      if (prioridad && prioridad.slaHoras !== null && prioridad.slaActivo) {
        metaS = Math.round(prioridad.slaHoras * 3600);
      }
    }

    // El calendario se carga antes de leer el reloj: ninguna lectura de MASTER queda entre la
    // lectura y el CAS. `CORRIDO` no toca el calendario.
    const medidor =
      ticket.slaRegla === 'CORRIDO'
        ? new MedidorCorrido()
        : RelojSla.medidorPara(
            ticket.slaRegla,
            this.calculoHabil,
            ...(await Promise.all([this.calendarioRepo.obtener(), this.feriadosRepo.obtener()])),
          );

    for (let intento = 0; intento < 2; intento += 1) {
      const fila = await this.relojRepo.leer(dto.ticketId);
      if (!fila) return;
      if (omitirTerminales && ESTADOS_TERMINALES.has(fila.estadoCodigo)) return;

      const plegado = RelojSla.plegar({
        fila,
        medidor,
        historialSinSecuencia:
          fila.acumuladoS === null ? await this.relojRepo.historialSinSecuencia(fila.ticketId) : [],
        transiciones: await this.relojRepo.transicionesDesde(fila.ticketId, fila.seqHasta),
      });
      const reloj = RelojSla.conMeta(
        plegado,
        { metaS, estadoCodigo: fila.estadoCodigo, vencimientoActual: fila.slaVenceAt },
        medidor,
      );
      if (await this.relojRepo.guardarSiVersion(fila.ticketId, fila.version, reloj)) return;
    }
    throw new Error(`SLA_RELOJ_CONFLICTO | ticket=${dto.ticketId}`);
  }
}
