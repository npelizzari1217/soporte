import { TicketEstadoCambiado, TICKET_ESTADO_CAMBIADO } from './ticket-estado-cambiado.event';

/**
 * 1.5 — RED: forma de TicketEstadoCambiado — 10 campos no nulos.
 *
 * Ref spec: R9 Scenario "El evento publicado contiene todos los campos requeridos".
 * Ref design: §5 (firma real), D4 (estadoAnteriorCodigo/estadoNuevoCodigo).
 * Tarea: PR1 1.5
 */
describe('TicketEstadoCambiado', () => {
  it('expone TICKET_ESTADO_CAMBIADO como eventName de la constante', () => {
    expect(TICKET_ESTADO_CAMBIADO).toBe('ticket.estado.cambiado');
  });

  it('construye el evento con los 10 campos requeridos, todos no nulos', () => {
    const occurredAt = new Date('2026-07-29T12:00:00.000Z');

    const event = new TicketEstadoCambiado(
      'ticket-uuid',
      'SOPORTE',
      'estado-anterior-uuid',
      'estado-nuevo-uuid',
      'EN_PROGRESO',
      'RESUELTO',
      'solicitante-uuid',
      'autor-uuid',
      'tenant-uuid',
      occurredAt,
    );

    expect(event.eventName).toBe(TICKET_ESTADO_CAMBIADO);
    expect(event.ticketId).toBe('ticket-uuid');
    expect(event.tipoCodigo).toBe('SOPORTE');
    expect(event.estadoAnteriorId).toBe('estado-anterior-uuid');
    expect(event.estadoNuevoId).toBe('estado-nuevo-uuid');
    expect(event.estadoAnteriorCodigo).toBe('EN_PROGRESO');
    expect(event.estadoNuevoCodigo).toBe('RESUELTO');
    expect(event.solicitanteId).toBe('solicitante-uuid');
    expect(event.autorId).toBe('autor-uuid');
    expect(event.tenantId).toBe('tenant-uuid');
    expect(event.occurredAt).toBe(occurredAt);

    // Ningún campo requerido es null/undefined.
    const camposRequeridos = [
      event.ticketId,
      event.tipoCodigo,
      event.estadoAnteriorId,
      event.estadoNuevoId,
      event.estadoAnteriorCodigo,
      event.estadoNuevoCodigo,
      event.solicitanteId,
      event.autorId,
      event.tenantId,
      event.occurredAt,
    ];
    camposRequeridos.forEach((campo) => {
      expect(campo).not.toBeNull();
      expect(campo).not.toBeUndefined();
    });
  });
});
