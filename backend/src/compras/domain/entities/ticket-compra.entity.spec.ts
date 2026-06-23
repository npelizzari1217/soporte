import { TicketCompraEntity } from './ticket-compra.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('TicketCompraEntity', () => {
  const TICKET_ID = 'a1a1a1a1-0000-7000-a000-000000000001';

  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      expect(tc.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'b2b2b2b2-0000-7000-a000-000000000002';
      const tc = TicketCompraEntity.create(TICKET_ID, id);
      expect(tc.id).toBe(id);
    });

    it('almacena el ticketId correctamente', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      expect(tc.ticketId).toBe(TICKET_ID);
    });

    it('aprobadoPorId es null inicialmente', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      expect(tc.aprobadoPorId).toBeNull();
    });

    it('aprobadoEn es null inicialmente', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      expect(tc.aprobadoEn).toBeNull();
    });

    it('motivoRechazo es null inicialmente', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      expect(tc.motivoRechazo).toBeNull();
    });

    it('no está soft-deleted al crear', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      expect(tc.isDeleted()).toBe(false);
      expect(tc.deletedAt).toBeNull();
    });
  });

  describe('aprobar()', () => {
    it('setea aprobadoPorId y aprobadoEn', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      const aprobadorId = 'c3c3c3c3-0000-7000-a000-000000000003';
      const ahora = new Date();

      tc.aprobar(aprobadorId, ahora);

      expect(tc.aprobadoPorId).toBe(aprobadorId);
      expect(tc.aprobadoEn).toBe(ahora);
    });

    it('no setea motivoRechazo al aprobar', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      tc.aprobar('user-id', new Date());
      expect(tc.motivoRechazo).toBeNull();
    });
  });

  describe('rechazar()', () => {
    it('setea aprobadoPorId, aprobadoEn y motivoRechazo', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      const aprobadorId = 'd4d4d4d4-0000-7000-a000-000000000004';
      const ahora = new Date();
      const motivo = 'Presupuesto excede el límite aprobado';

      tc.rechazar(aprobadorId, ahora, motivo);

      expect(tc.aprobadoPorId).toBe(aprobadorId);
      expect(tc.aprobadoEn).toBe(ahora);
      expect(tc.motivoRechazo).toBe(motivo);
    });
  });

  describe('softDelete()', () => {
    it('setea deletedAt y marca isDeleted() = true', () => {
      const tc = TicketCompraEntity.create(TICKET_ID);
      tc.softDelete();
      expect(tc.isDeleted()).toBe(true);
      expect(tc.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');
      const deletedAt = new Date('2026-01-03T10:00:00Z');
      const aprobadoPorId = 'e5e5e5e5-0000-7000-a000-000000000005';
      const aprobadoEn = new Date('2026-01-02T12:00:00Z');

      const tc = TicketCompraEntity.reconstitute(
        {
          ticketId: TICKET_ID,
          aprobadoPorId,
          aprobadoEn,
          motivoRechazo: 'sin fondos',
        },
        'f6f6f6f6-0000-7000-a000-000000000006',
        createdAt,
        updatedAt,
        deletedAt,
      );

      expect(tc.ticketId).toBe(TICKET_ID);
      expect(tc.aprobadoPorId).toBe(aprobadoPorId);
      expect(tc.aprobadoEn).toBe(aprobadoEn);
      expect(tc.motivoRechazo).toBe('sin fondos');
      expect(tc.createdAt).toBe(createdAt);
      expect(tc.updatedAt).toBe(updatedAt);
      expect(tc.deletedAt).toBe(deletedAt);
      expect(tc.isDeleted()).toBe(true);
    });

    it('reconstitute con deletedAt null → isDeleted() false', () => {
      const tc = TicketCompraEntity.reconstitute(
        { ticketId: TICKET_ID, aprobadoPorId: null, aprobadoEn: null, motivoRechazo: null },
        'id-fixed',
        new Date(),
        new Date(),
        null,
      );
      expect(tc.isDeleted()).toBe(false);
    });
  });
});
