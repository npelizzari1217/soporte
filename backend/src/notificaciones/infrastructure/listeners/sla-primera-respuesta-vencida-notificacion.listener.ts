/**
 * SlaPrimeraRespuestaVencidaNotificacionListener — adapter @OnEvent de `sla.primera_respuesta_vencida`
 * (`sla-primera-respuesta` R4): avisa al asignado y a los administradores con la entrega común.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SlaPrimeraRespuestaVencidaEvent } from '../../../sla/domain/events/sla-primera-respuesta-vencida.event';
import { templatePrimeraRespuestaVencida } from '../../domain/templates/email-templates';
import { NotificadorVencimientoSla } from '../notificador-vencimiento-sla';

@Injectable()
export class SlaPrimeraRespuestaVencidaNotificacionListener {
  constructor(private readonly notificador: Pick<NotificadorVencimientoSla, 'notificar'>) {}

  @OnEvent('sla.primera_respuesta_vencida')
  async onPrimeraRespuestaVencida(event: SlaPrimeraRespuestaVencidaEvent): Promise<void> {
    await this.notificador.notificar(
      event,
      templatePrimeraRespuestaVencida,
      'SlaPrimeraRespuestaVencidaNotificacionListener',
    );
  }
}
