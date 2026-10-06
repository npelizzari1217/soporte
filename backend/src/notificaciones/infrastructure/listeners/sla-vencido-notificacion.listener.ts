/**
 * SlaVencidoNotificacionListener — adapter @OnEvent que conecta `sla.vencido` (S4,
 * `MarcarVencidosUseCase`) con el aviso por email al ASIGNADO + ADMINISTRADORES del tenant (N3/N4).
 * La entrega (destinatarios deduplicados, aislamiento por destinatario, ALS) vive en
 * `NotificadorVencimientoSla`; acá solo se elige la plantilla.
 *
 * Ref spec: sdd/premium/spec S4, N3, N4. Ref design: ADR-P4, ADR-P8.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SlaVencidoEvent } from '../../../sla/domain/events/sla-vencido.event';
import { templateSlaVencido } from '../../domain/templates/email-templates';
import { NotificadorVencimientoSla } from '../notificador-vencimiento-sla';

@Injectable()
export class SlaVencidoNotificacionListener {
  constructor(private readonly notificador: Pick<NotificadorVencimientoSla, 'notificar'>) {}

  @OnEvent('sla.vencido')
  async onSlaVencido(event: SlaVencidoEvent): Promise<void> {
    await this.notificador.notificar(event, templateSlaVencido, 'SlaVencidoNotificacionListener');
  }
}
