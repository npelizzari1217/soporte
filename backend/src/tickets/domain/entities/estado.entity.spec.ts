/**
 * T2.1 [UNIT] — RED→GREEN: EstadoEntity (catálogo FIJO, 6 códigos, ADR-1).
 *
 * Verifica create() (nuevo, genera UUIDv7) y reconstitute() (desde
 * persistencia, preserva id/timestamps) + getters. Clon adaptado de
 * soporte1/backend/src/tickets/domain/entities/estado.entity.ts.
 *
 * Ref spec: sdd/tickets-core/spec T1. Ref design: ADR-1, ADR-3 (Firmas TS).
 * Tarea: T2.1
 */
import { EstadoEntity } from './estado.entity';

function baseProps() {
  return { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 10, activo: true };
}

describe('EstadoEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const estado = EstadoEntity.create(baseProps());

      expect(estado.codigo).toBe('NUEVO');
      expect(estado.nombre).toBe('Nuevo');
      expect(estado.color).toBeNull();
      expect(estado.orden).toBe(10);
      expect(estado.activo).toBe(true);
      expect(estado.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(estado.isDeleted()).toBe(false);
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const estado = EstadoEntity.create(baseProps(), 'explicit-id-001');
      expect(estado.id).toBe('explicit-id-001');
    });

    it('preserva color no-nulo cuando se provee', () => {
      const estado = EstadoEntity.create({ ...baseProps(), color: '#00FF00' });
      expect(estado.color).toBe('#00FF00');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id y timestamps exactos', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const estado = EstadoEntity.reconstitute(
        { codigo: 'CERRADO', nombre: 'Cerrado', color: '#888888', orden: 50, activo: true },
        'db-uuid-cerrado',
        createdAt,
        updatedAt,
        null,
      );

      expect(estado.id).toBe('db-uuid-cerrado');
      expect(estado.codigo).toBe('CERRADO');
      expect(estado.createdAt).toEqual(createdAt);
      expect(estado.updatedAt).toEqual(updatedAt);
      expect(estado.deletedAt).toBeNull();
    });

    it('preserva deletedAt no-nulo (estado soft-deleted)', () => {
      const deletedAt = new Date('2026-03-01T00:00:00Z');
      const estado = EstadoEntity.reconstitute(
        baseProps(),
        'db-uuid-baja',
        new Date(),
        new Date(),
        deletedAt,
      );

      expect(estado.isDeleted()).toBe(true);
      expect(estado.deletedAt).toEqual(deletedAt);
    });
  });
});
