/**
 * WebhookEncoladoListener (odd/webhooks, T4): mapea cada evento de ticket a su evento de webhook,
 * toma el cliente del `TenantContext` y nunca propaga un fallo hacia el emisor.
 */
import { TicketAsignadoEvent } from '../../tickets/domain/events/ticket-asignado.event';
import { TicketComentadoEvent } from '../../tickets/domain/events/ticket-comentado.event';
import { TicketCreadoEvent } from '../../tickets/domain/events/ticket-creado.event';
import { TicketEstadoModificadoEvent } from '../../tickets/domain/events/ticket-estado-modificado.event';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { TenantContextData } from '../../shared/tenancy/tenant-context';
import { EncolarWebhookEntrada } from '../application/encolar-webhook.use-case';
import { WebhookEncoladoListener } from './webhook-encolado.listener';

const OCURRIDO = new Date('2026-10-13T12:00:00.000Z');
const CTX: TenantContextData = { prismaClient: {}, dbName: 'soporte_a', clienteId: 'cliente-a' };

function armar(opciones: { ctx?: TenantContextData; falla?: boolean } = {}) {
  const llamadas: EncolarWebhookEntrada[] = [];
  const errores: string[] = [];
  const listener = new WebhookEncoladoListener(
    {
      ejecutar: async (entrada) => {
        llamadas.push(entrada);
        if (opciones.falla) throw new Error('base caída');
        return { omitida: 'SIN_DESTINO' };
      },
    },
    { get: () => ('ctx' in opciones ? opciones.ctx : CTX) },
    { error: (mensaje: string) => errores.push(mensaje) },
  );
  return { listener, llamadas, errores };
}

describe('WebhookEncoladoListener (odd/webhooks T4)', () => {
  it('mapea los cuatro eventos con el cliente del contexto y la fecha del evento', async () => {
    const { listener, llamadas } = armar();
    const base = { ticketId: 't-1', occurredAt: OCURRIDO };

    await listener.onTicketCreado(new TicketCreadoEvent({ ...base, prioridadId: 'p' }));
    await listener.onTicketEstadoModificado(new TicketEstadoModificadoEvent(base));
    await listener.onTicketAsignado(
      new TicketAsignadoEvent({ ...base, asignadoId: 'tec', origen: 'MANUAL', autorId: 'u' }),
    );
    await listener.onTicketComentado(
      new TicketComentadoEvent({ ...base, operacionId: 'op', autorId: 'u' }),
    );

    expect(llamadas).toEqual(
      ['TICKET_CREADO', 'TICKET_ESTADO_CAMBIADO', 'TICKET_ASIGNADO', 'TICKET_COMENTADO'].map(
        (evento) => ({ clienteId: 'cliente-a', evento, ticketId: 't-1', ocurridoEn: OCURRIDO }),
      ),
    );
  });

  it('el cambio de estado escucha ticket.estado_modificado (todo cambio), no ticket.estado_cambiado (solo los que avisan por correo) — defectos-ayuda S6', () => {
    const eventos = Object.getOwnPropertyNames(WebhookEncoladoListener.prototype).flatMap(
      (nombre) => {
        const metodo: unknown = Reflect.get(WebhookEncoladoListener.prototype, nombre);
        if (typeof metodo !== 'function') return [];
        const meta: unknown = Reflect.getMetadata(EVENT_LISTENER_METADATA, metodo);
        return Array.isArray(meta) ? meta.map((m: { event: string }) => m.event) : [];
      },
    );

    expect(eventos).toContain('ticket.estado_modificado');
    expect(eventos).not.toContain('ticket.estado_cambiado');
  });

  it('sin TenantContext no encola y lo registra', async () => {
    const { listener, llamadas, errores } = armar({ ctx: undefined });

    await listener.onTicketCreado(
      new TicketCreadoEvent({ ticketId: 't-1', prioridadId: 'p', occurredAt: OCURRIDO }),
    );

    expect(llamadas).toEqual([]);
    expect(errores).toEqual([expect.stringContaining('sin TenantContext')]);
  });

  it('un fallo al encolar se registra y no se propaga hacia el emisor', async () => {
    const { listener, errores } = armar({ falla: true });

    await expect(
      listener.onTicketComentado(
        new TicketComentadoEvent({ ticketId: 't-1', operacionId: 'op', autorId: 'u' }),
      ),
    ).resolves.toBeUndefined();
    expect(errores).toEqual([
      'WebhookEncoladoListener: fallo al encolar TICKET_COMENTADO (ticketId=t-1): base caída',
    ]);
  });
});
