/**
 * [UNIT] SlaVencidoNotificacionListener: delega en `NotificadorVencimientoSla` con la plantilla de
 * `sla.vencido`. El comportamiento de la entrega se prueba en `notificador-vencimiento-sla.spec.ts`.
 */
import { SlaVencidoNotificacionListener } from './sla-vencido-notificacion.listener';
import { SlaPrimeraRespuestaVencidaNotificacionListener } from './sla-primera-respuesta-vencida-notificacion.listener';
import { SlaVencidoEvent } from '../../../sla/domain/events/sla-vencido.event';
import { SlaPrimeraRespuestaVencidaEvent } from '../../../sla/domain/events/sla-primera-respuesta-vencida.event';
import {
  templatePrimeraRespuestaVencida,
  templateSlaVencido,
} from '../../domain/templates/email-templates';

describe('listeners de vencimiento de SLA', () => {
  it('sla.vencido delega con templateSlaVencido', async () => {
    const notificador = { notificar: vi.fn().mockResolvedValue(undefined) };
    const event = new SlaVencidoEvent({ ticketId: 't', asignadoId: 'a', solicitanteId: 's' });

    await new SlaVencidoNotificacionListener(notificador).onSlaVencido(event);

    expect(notificador.notificar).toHaveBeenCalledWith(
      event,
      templateSlaVencido,
      'SlaVencidoNotificacionListener',
    );
  });

  it('sla.primera_respuesta_vencida delega con templatePrimeraRespuestaVencida', async () => {
    const notificador = { notificar: vi.fn().mockResolvedValue(undefined) };
    const event = new SlaPrimeraRespuestaVencidaEvent({
      ticketId: 't',
      asignadoId: null,
      solicitanteId: null,
    });

    await new SlaPrimeraRespuestaVencidaNotificacionListener(notificador).onPrimeraRespuestaVencida(
      event,
    );

    expect(notificador.notificar).toHaveBeenCalledWith(
      event,
      templatePrimeraRespuestaVencida,
      'SlaPrimeraRespuestaVencidaNotificacionListener',
    );
  });
});
