/**
 * T6.4 [UNIT][RED→GREEN] — `SubtareaEdiliciaEntity`.
 *
 * create (completada=false); completar setea completada/completadaEn/completadaPorId.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (SubtareaEdiliciaEntity). Tarea: T6.4.
 */
import {
  SubtareaEdiliciaEntity,
  SUBTAREA_DESCRIPCION_MAX_LENGTH,
} from './subtarea-edilicia.entity';

describe('SubtareaEdiliciaEntity', () => {
  describe('create()', () => {
    it('crea la subtarea con completada=false y orden default 0', () => {
      const entity = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: 'ticket-edilicia-uuid',
        descripcion: 'Reparar cañería',
      });

      expect(entity.ticketEdiliciaId).toBe('ticket-edilicia-uuid');
      expect(entity.descripcion).toBe('Reparar cañería');
      expect(entity.completada).toBe(false);
      expect(entity.completadaEn).toBeNull();
      expect(entity.completadaPorId).toBeNull();
      expect(entity.orden).toBe(0);
    });

    it('acepta orden explícito', () => {
      const entity = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: 'ticket-edilicia-uuid',
        descripcion: 'Pintar pared',
        orden: 3,
      });
      expect(entity.orden).toBe(3);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const entity = SubtareaEdiliciaEntity.reconstitute(
        {
          ticketEdiliciaId: 'ticket-edilicia-uuid',
          descripcion: 'Cambiar lámpara',
          completada: true,
          completadaEn: updatedAt,
          completadaPorId: 'usuario-uuid',
          orden: 1,
        },
        'db-uuid',
        createdAt,
        updatedAt,
        null,
      );

      expect(entity.id).toBe('db-uuid');
      expect(entity.completada).toBe(true);
      expect(entity.deletedAt).toBeNull();
    });
  });

  describe('completar()', () => {
    it('setea completada=true, completadaEn y completadaPorId', () => {
      const entity = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: 'ticket-edilicia-uuid',
        descripcion: 'Reparar cañería',
      });
      const ahora = new Date('2026-03-01T10:00:00Z');

      entity.completar('tecnico-uuid', ahora);

      expect(entity.completada).toBe(true);
      expect(entity.completadaEn).toBe(ahora);
      expect(entity.completadaPorId).toBe('tecnico-uuid');
    });

    it('usa now() por defecto si no se provee completadaEn', () => {
      const entity = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: 'ticket-edilicia-uuid',
        descripcion: 'Reparar cañería',
      });

      entity.completar('tecnico-uuid');

      expect(entity.completadaEn).toBeInstanceOf(Date);
    });
  });

  describe('softDelete() (heredado de BaseEntity)', () => {
    it('marca la subtarea como eliminada lógicamente', () => {
      const entity = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: 'ticket-edilicia-uuid',
        descripcion: 'Reparar cañería',
      });
      entity.softDelete();
      expect(entity.isDeleted()).toBe(true);
    });
  });
});

/**
 * Tope de largo de `descripcion`, espejando
 * `subtareasEdilicia.descripcion VarChar(255) NOT NULL`
 * (`prisma_tenant/schema.prisma`).
 *
 * Mismo hueco que `ubicacion`: no lo acotaba ninguna capa, así que un texto
 * largo llegaba a Postgres y reventaba con 22001 (500 crudo). El contraste sano
 * del mismo módulo es `crearComentarioSchema.texto`, que sí espeja su tope.
 */
describe('SubtareaEdiliciaEntity — tope de largo de descripcion', () => {
  it('acepta una descripcion en el límite exacto', () => {
    const s = SubtareaEdiliciaEntity.create({
      ticketEdiliciaId: 'te-1',
      descripcion: 'A'.repeat(SUBTAREA_DESCRIPCION_MAX_LENGTH),
    });
    expect(s.descripcion).toHaveLength(SUBTAREA_DESCRIPCION_MAX_LENGTH);
  });

  it('rechaza una descripcion que pasa el tope', () => {
    expect(() =>
      SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: 'te-1',
        descripcion: 'A'.repeat(SUBTAREA_DESCRIPCION_MAX_LENGTH + 1),
      }),
    ).toThrow(/descripcion excede/);
  });

  /** Centinela de valor: el tope es el ancho real de la columna. */
  it('el tope coincide con el ancho de la columna', () => {
    expect(SUBTAREA_DESCRIPCION_MAX_LENGTH).toBe(255);
  });
});
