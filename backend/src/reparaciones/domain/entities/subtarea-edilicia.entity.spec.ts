import { SubtareaEdiliciaEntity } from './subtarea-edilicia.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('SubtareaEdiliciaEntity', () => {
  const TICKET_EDILICIA_ID = 'a1a1a1a1-0000-7000-a000-000000000001';
  const DESCRIPCION = 'Revisar cañerías del baño';

  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'b2b2b2b2-0000-7000-a000-000000000002';
      const s = SubtareaEdiliciaEntity.create(
        { ticketEdiliciaId: TICKET_EDILICIA_ID, descripcion: DESCRIPCION },
        id,
      );
      expect(s.id).toBe(id);
    });

    it('almacena ticketEdiliciaId correctamente', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.ticketEdiliciaId).toBe(TICKET_EDILICIA_ID);
    });

    it('almacena la descripcion correctamente', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.descripcion).toBe(DESCRIPCION);
    });

    it('completada es false por defecto', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.completada).toBe(false);
    });

    it('completadaEn es null por defecto', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.completadaEn).toBeNull();
    });

    it('completadaPorId es null por defecto', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.completadaPorId).toBeNull();
    });

    it('orden es 0 por defecto', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.orden).toBe(0);
    });

    it('acepta orden personalizado', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
        orden: 5,
      });
      expect(s.orden).toBe(5);
    });

    it('no está soft-deleted al crear', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      expect(s.isDeleted()).toBe(false);
    });
  });

  describe('completar()', () => {
    it('setea completada = true, completadaEn y completadaPorId', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      const usuarioId = 'c3c3c3c3-0000-7000-a000-000000000003';
      const ahora = new Date('2026-06-23T12:00:00Z');

      s.completar(usuarioId, ahora);

      expect(s.completada).toBe(true);
      expect(s.completadaEn).toBe(ahora);
      expect(s.completadaPorId).toBe(usuarioId);
    });

    it('completar sin fecha explícita usa una fecha (Date instance)', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      s.completar('user-id');
      expect(s.completadaEn).toBeInstanceOf(Date);
    });

    it('completar es idempotente respecto al estado completada=true', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      s.completar('user-id-1', new Date('2026-01-01T10:00:00Z'));
      // una segunda llamada actualiza el usuario y la fecha
      s.completar('user-id-2', new Date('2026-01-02T10:00:00Z'));
      expect(s.completadaPorId).toBe('user-id-2');
    });
  });

  describe('softDelete()', () => {
    it('setea deletedAt y marca isDeleted() = true', () => {
      const s = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: TICKET_EDILICIA_ID,
        descripcion: DESCRIPCION,
      });
      s.softDelete();
      expect(s.isDeleted()).toBe(true);
      expect(s.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const usuarioId = 'd4d4d4d4-0000-7000-a000-000000000004';
      const completadaEn = new Date('2026-01-02T12:00:00Z');
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');
      const deletedAt = new Date('2026-01-03T10:00:00Z');

      const s = SubtareaEdiliciaEntity.reconstitute(
        {
          ticketEdiliciaId: TICKET_EDILICIA_ID,
          descripcion: DESCRIPCION,
          completada: true,
          completadaEn,
          completadaPorId: usuarioId,
          orden: 3,
        },
        'e5e5e5e5-0000-7000-a000-000000000005',
        createdAt,
        updatedAt,
        deletedAt,
      );

      expect(s.ticketEdiliciaId).toBe(TICKET_EDILICIA_ID);
      expect(s.descripcion).toBe(DESCRIPCION);
      expect(s.completada).toBe(true);
      expect(s.completadaEn).toBe(completadaEn);
      expect(s.completadaPorId).toBe(usuarioId);
      expect(s.orden).toBe(3);
      expect(s.createdAt).toBe(createdAt);
      expect(s.updatedAt).toBe(updatedAt);
      expect(s.deletedAt).toBe(deletedAt);
      expect(s.isDeleted()).toBe(true);
    });

    it('reconstitute con deletedAt null → isDeleted() false', () => {
      const s = SubtareaEdiliciaEntity.reconstitute(
        {
          ticketEdiliciaId: TICKET_EDILICIA_ID,
          descripcion: DESCRIPCION,
          completada: false,
          completadaEn: null,
          completadaPorId: null,
          orden: 0,
        },
        'id-fixed',
        new Date(),
        new Date(),
        null,
      );
      expect(s.isDeleted()).toBe(false);
    });
  });
});
