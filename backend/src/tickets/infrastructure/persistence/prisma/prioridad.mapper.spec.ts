/**
 * T2.2 [UNIT] — RED→GREEN: PrioridadMapper.toDomain (fila Prisma → PrioridadEntity).
 * Tarea: T2.2
 */
import { PrioridadMapper } from './prioridad.mapper';
import { PrioridadEntity } from '../../../domain/entities/prioridad.entity';

function makeRow(overrides: Partial<Parameters<typeof PrioridadMapper.toDomain>[0]> = {}) {
  return {
    id: 'prioridad-uuid-001',
    codigo: 'ALTA',
    nombre: 'Alta',
    color: '#FF8800',
    orden: 30,
    activo: true,
    slaHoras: 8,
    slaActivo: true,
    slaPrimeraRespuestaHoras: 4,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    ...overrides,
  };
}

describe('PrioridadMapper', () => {
  describe('toDomain()', () => {
    it('convierte una fila Prisma en PrioridadEntity con las props exactas', () => {
      const row = makeRow();

      const entity = PrioridadMapper.toDomain(row);

      expect(entity).toBeInstanceOf(PrioridadEntity);
      expect(entity.id).toBe('prioridad-uuid-001');
      expect(entity.codigo).toBe('ALTA');
      expect(entity.color).toBe('#FF8800');
      expect(entity.orden).toBe(30);
      expect(entity.activo).toBe(true);
      expect(entity.slaHoras).toBe(8);
      expect(entity.slaActivo).toBe(true);
      expect(entity.slaPrimeraRespuestaHoras).toBe(4);
    });

    it('convierte slaPrimeraRespuestaHoras null de la DB (sin meta) en null de la entidad', () => {
      const entity = PrioridadMapper.toDomain(makeRow({ slaPrimeraRespuestaHoras: null }));

      expect(entity.slaPrimeraRespuestaHoras).toBeNull();
    });

    it('convierte slaHoras null de la DB (sin SLA aplicable) en slaHoras null de la entidad', () => {
      const row = makeRow({ slaHoras: null });

      const entity = PrioridadMapper.toDomain(row);

      expect(entity.slaHoras).toBeNull();
    });

    it('convierte color null de la DB en color null de la entidad', () => {
      const row = makeRow({ color: null });

      const entity = PrioridadMapper.toDomain(row);

      expect(entity.color).toBeNull();
    });

    it('preserva deletedAt no-nulo', () => {
      const deletedAt = new Date('2026-05-01');
      const row = makeRow({ deletedAt });

      const entity = PrioridadMapper.toDomain(row);

      expect(entity.isDeleted()).toBe(true);
    });
  });

  describe('toPersistence() (T11.2, PR11)', () => {
    it('convierte una PrioridadEntity en el shape plano para Prisma upsert', () => {
      const entity = PrioridadMapper.toDomain(makeRow());

      const data = PrioridadMapper.toPersistence(entity);

      expect(data).toEqual({
        id: entity.id,
        codigo: entity.codigo,
        nombre: entity.nombre,
        color: entity.color,
        orden: entity.orden,
        activo: entity.activo,
        slaHoras: entity.slaHoras,
        slaActivo: entity.slaActivo,
        slaPrimeraRespuestaHoras: entity.slaPrimeraRespuestaHoras,
        deletedAt: entity.deletedAt,
        createdAt: entity.createdAt,
      });
    });
  });
});
