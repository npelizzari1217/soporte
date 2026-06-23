import { TicketEdiliciaEntity } from './ticket-edilicia.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('TicketEdiliciaEntity', () => {
  const TICKET_ID = 'a1a1a1a1-0000-7000-a000-000000000001';
  const UBICACION_ID = 'b2b2b2b2-0000-7000-a000-000000000002';

  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      expect(te.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'c3c3c3c3-0000-7000-a000-000000000003';
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID, id);
      expect(te.id).toBe(id);
    });

    it('almacena ticketId correctamente', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      expect(te.ticketId).toBe(TICKET_ID);
    });

    it('almacena ubicacionId correctamente', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      expect(te.ubicacionId).toBe(UBICACION_ID);
    });

    it('porcentaje_avance inicial es 0 (invariante de dominio)', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      expect(te.porcentajeAvance).toBe(0);
    });

    it('personalAsignadoId es null inicialmente', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      expect(te.personalAsignadoId).toBeNull();
    });

    it('no está soft-deleted al crear', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      expect(te.isDeleted()).toBe(false);
      expect(te.deletedAt).toBeNull();
    });
  });

  describe('actualizarAvance()', () => {
    it('actualiza el porcentaje de avance con un valor válido', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      te.actualizarAvance(33.33);
      expect(te.porcentajeAvance).toBe(33.33);
    });

    it('acepta 0 como valor válido', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      te.actualizarAvance(0);
      expect(te.porcentajeAvance).toBe(0);
    });

    it('acepta 100 como valor válido', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      te.actualizarAvance(100);
      expect(te.porcentajeAvance).toBe(100);
    });
  });

  describe('asignarPersonal()', () => {
    it('setea personalAsignadoId correctamente', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      const personalId = 'd4d4d4d4-0000-7000-a000-000000000004';
      te.asignarPersonal(personalId);
      expect(te.personalAsignadoId).toBe(personalId);
    });
  });

  describe('softDelete()', () => {
    it('setea deletedAt y marca isDeleted() = true', () => {
      const te = TicketEdiliciaEntity.create(TICKET_ID, UBICACION_ID);
      te.softDelete();
      expect(te.isDeleted()).toBe(true);
      expect(te.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const personalId = 'e5e5e5e5-0000-7000-a000-000000000005';
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');
      const deletedAt = new Date('2026-01-03T10:00:00Z');

      const te = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: TICKET_ID,
          ubicacionId: UBICACION_ID,
          personalAsignadoId: personalId,
          porcentajeAvance: 66.67,
        },
        'f6f6f6f6-0000-7000-a000-000000000006',
        createdAt,
        updatedAt,
        deletedAt,
      );

      expect(te.ticketId).toBe(TICKET_ID);
      expect(te.ubicacionId).toBe(UBICACION_ID);
      expect(te.personalAsignadoId).toBe(personalId);
      expect(te.porcentajeAvance).toBe(66.67);
      expect(te.createdAt).toBe(createdAt);
      expect(te.updatedAt).toBe(updatedAt);
      expect(te.deletedAt).toBe(deletedAt);
      expect(te.isDeleted()).toBe(true);
    });

    it('reconstitute con deletedAt null → isDeleted() false', () => {
      const te = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: TICKET_ID,
          ubicacionId: UBICACION_ID,
          personalAsignadoId: null,
          porcentajeAvance: 0,
        },
        'id-fixed',
        new Date(),
        new Date(),
        null,
      );
      expect(te.isDeleted()).toBe(false);
    });
  });
});
