import { describe, it, expect } from 'vitest';
import { TicketSoporteEntity } from './ticket-soporte.entity';

/**
 * T10.5 [U][RED→GREEN] — TicketSoporteEntity: create (equipoId nullable),
 * registrarSolucion, actualizarEquipo.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4, F3-Q5.
 */
describe('TicketSoporteEntity', () => {
  it('create() con equipoId null (soporte de red/accesos sin equipo)', () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-1',
      equipoId: null,
      descripcionProblema: 'No tiene acceso a la VPN',
    });
    expect(ticketSoporte.ticketId).toBe('ticket-1');
    expect(ticketSoporte.equipoId).toBeNull();
    expect(ticketSoporte.descripcionProblema).toBe('No tiene acceso a la VPN');
    expect(ticketSoporte.solucionAplicada).toBeNull();
  });

  it('create() con equipoId presente', () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-2',
      equipoId: 'equipo-1',
      descripcionProblema: null,
    });
    expect(ticketSoporte.equipoId).toBe('equipo-1');
  });

  it('registrarSolucion() setea solucionAplicada', () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-1',
      equipoId: null,
      descripcionProblema: null,
    });
    ticketSoporte.registrarSolucion('Se reinstaló el cliente VPN.');
    expect(ticketSoporte.solucionAplicada).toBe('Se reinstaló el cliente VPN.');
  });

  it('actualizarEquipo() cambia el equipoId (nullable)', () => {
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: 'ticket-1',
      equipoId: 'equipo-1',
      descripcionProblema: null,
    });
    ticketSoporte.actualizarEquipo('equipo-2');
    expect(ticketSoporte.equipoId).toBe('equipo-2');
    ticketSoporte.actualizarEquipo(null);
    expect(ticketSoporte.equipoId).toBeNull();
  });

  it('reconstitute() restaura estado desde persistencia', () => {
    const ticketSoporte = TicketSoporteEntity.reconstitute(
      {
        ticketId: 'ticket-1',
        equipoId: null,
        descripcionProblema: null,
        solucionAplicada: 'Ya resuelto',
      },
      'ts-1',
      new Date(),
      new Date(),
      null,
    );
    expect(ticketSoporte.id).toBe('ts-1');
    expect(ticketSoporte.solucionAplicada).toBe('Ya resuelto');
  });
});
