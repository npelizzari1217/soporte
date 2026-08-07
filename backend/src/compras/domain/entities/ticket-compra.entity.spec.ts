/**
 * T2.5/T2.6 [UNIT] — RED→GREEN: `TicketCompraEntity`.
 *
 * Satélite 1:0..1 del `Ticket` base (ADR-1): la aprobación es un gate de
 * negocio sobre ESTE satélite, NUNCA un estado del ticket. `create()`
 * inicializa los 3 campos de decisión en `null`. `aprobar()`/`rechazar()`
 * retornan `Result` — doble decisión (ya aprobado o rechazado) →
 * `CompraYaDecididaError`; rechazo sin motivo → `MotivoRechazoRequeridoError`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1, F3-C4, F3-C5. Ref design:
 * ADR-1, "Firmas TS clave" (TicketCompraEntity). Tarea: T2.5, T2.6.
 */
import { TicketCompraEntity } from './ticket-compra.entity';
import { CompraYaDecididaError, MotivoRechazoRequeridoError } from '../errors/compras.errors';

describe('TicketCompraEntity', () => {
  describe('create()', () => {
    it('crea el satélite con los 3 campos de decisión en null', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });

      expect(ticketCompra.ticketId).toBe('ticket-uuid');
      expect(ticketCompra.aprobadoPorId).toBeNull();
      expect(ticketCompra.aprobadoEn).toBeNull();
      expect(ticketCompra.motivoRechazo).toBeNull();
      expect(ticketCompra.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' }, 'explicit-id');
      expect(ticketCompra.id).toBe('explicit-id');
    });
  });

  describe('getters de estado (estaDecidida/aprobada/rechazada)', () => {
    it('recién creado: estaDecidida=false, aprobada=false, rechazada=false', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });
      expect(ticketCompra.estaDecidida).toBe(false);
      expect(ticketCompra.aprobada).toBe(false);
      expect(ticketCompra.rechazada).toBe(false);
    });
  });

  describe('aprobar()', () => {
    it('setea aprobadoPorId/aprobadoEn y NO toca motivoRechazo', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });
      const ahora = new Date('2026-02-01T10:00:00Z');

      const result = ticketCompra.aprobar('aprobador-uuid', ahora);

      expect(result.isOk()).toBe(true);
      expect(ticketCompra.aprobadoPorId).toBe('aprobador-uuid');
      expect(ticketCompra.aprobadoEn).toEqual(ahora);
      expect(ticketCompra.motivoRechazo).toBeNull();
      expect(ticketCompra.estaDecidida).toBe(true);
      expect(ticketCompra.aprobada).toBe(true);
      expect(ticketCompra.rechazada).toBe(false);
    });

    it('doble aprobación → CompraYaDecididaError, sin mutar la decisión previa', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });
      ticketCompra.aprobar('aprobador-1', new Date('2026-02-01T10:00:00Z'));

      const result = ticketCompra.aprobar('aprobador-2', new Date('2026-02-02T10:00:00Z'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraYaDecididaError);
      expect(ticketCompra.aprobadoPorId).toBe('aprobador-1');
    });

    it('aprobar tras un rechazo previo → CompraYaDecididaError', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });
      ticketCompra.rechazar(
        'aprobador-1',
        new Date('2026-02-01T10:00:00Z'),
        'Presupuesto excedido',
      );

      const result = ticketCompra.aprobar('aprobador-2', new Date('2026-02-02T10:00:00Z'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraYaDecididaError);
    });
  });

  describe('rechazar()', () => {
    it('setea aprobadoPorId/aprobadoEn/motivoRechazo', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });
      const ahora = new Date('2026-02-01T10:00:00Z');

      const result = ticketCompra.rechazar('aprobador-uuid', ahora, 'Presupuesto excedido');

      expect(result.isOk()).toBe(true);
      expect(ticketCompra.aprobadoPorId).toBe('aprobador-uuid');
      expect(ticketCompra.aprobadoEn).toEqual(ahora);
      expect(ticketCompra.motivoRechazo).toBe('Presupuesto excedido');
      expect(ticketCompra.estaDecidida).toBe(true);
      expect(ticketCompra.aprobada).toBe(false);
      expect(ticketCompra.rechazada).toBe(true);
    });

    it('motivo vacío → MotivoRechazoRequeridoError, sin mutar la entidad', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });

      const result = ticketCompra.rechazar('aprobador-uuid', new Date(), '');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MotivoRechazoRequeridoError);
      expect(ticketCompra.aprobadoPorId).toBeNull();
      expect(ticketCompra.estaDecidida).toBe(false);
    });

    it('motivo solo espacios → MotivoRechazoRequeridoError', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });

      const result = ticketCompra.rechazar('aprobador-uuid', new Date(), '   ');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MotivoRechazoRequeridoError);
    });

    it('doble rechazo → CompraYaDecididaError', () => {
      const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-uuid' });
      ticketCompra.rechazar('aprobador-1', new Date('2026-02-01T10:00:00Z'), 'Motivo 1');

      const result = ticketCompra.rechazar(
        'aprobador-2',
        new Date('2026-02-02T10:00:00Z'),
        'Motivo 2',
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraYaDecididaError);
      expect(ticketCompra.motivoRechazo).toBe('Motivo 1');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad decidida desde persistencia', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const ticketCompra = TicketCompraEntity.reconstitute(
        {
          ticketId: 'ticket-uuid',
          aprobadoPorId: 'aprobador-uuid',
          aprobadoEn: new Date('2026-01-02T00:00:00Z'),
          motivoRechazo: null,
        },
        'db-uuid-ticket-compra',
        createdAt,
        updatedAt,
        null,
      );

      expect(ticketCompra.id).toBe('db-uuid-ticket-compra');
      expect(ticketCompra.estaDecidida).toBe(true);
      expect(ticketCompra.aprobada).toBe(true);
    });
  });
});
