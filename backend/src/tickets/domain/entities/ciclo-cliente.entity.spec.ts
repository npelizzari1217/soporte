/**
 * 3.A.1 TEST — Unit tests de CicloClienteEntity (RED → GREEN con 3.A.2)
 *
 * Cubre:
 * - Soft ref sin FK: cicloVigenteId es un UUID arbitrario sin validación de existencia
 * - Herencia de BaseEntity: id UUIDv7, timestamps, deletedAt=null
 * - Getters de propiedades del ciclo
 */
import { CicloClienteEntity, CicloClienteProps } from './ciclo-cliente.entity';

const makeCicloProps = (overrides: Partial<CicloClienteProps> = {}): CicloClienteProps => ({
  cicloVigenteId: 'ciclo-vigente-master-uuid', // soft ref cross-DB, sin FK
  nombre: 'Ejercicio 2026',
  fechaInicio: new Date('2026-01-01'),
  fechaFin: new Date('2026-12-31'),
  activo: true,
  ...overrides,
});

describe('CicloClienteEntity', () => {
  describe('Construcción (BaseEntity heredado)', () => {
    it('genera un id UUIDv7 al crear', () => {
      const ciclo = CicloClienteEntity.create(makeCicloProps());
      expect(ciclo.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('deletedAt es null al crear', () => {
      const ciclo = CicloClienteEntity.create(makeCicloProps());
      expect(ciclo.deletedAt).toBeNull();
      expect(ciclo.isDeleted()).toBe(false);
    });

    it('genera IDs distintos para instancias creadas consecutivamente', () => {
      const a = CicloClienteEntity.create(makeCicloProps());
      const b = CicloClienteEntity.create(makeCicloProps());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('Soft ref sin FK (cicloVigenteId)', () => {
    it('almacena el cicloVigenteId como UUID sin validación de existencia', () => {
      const ciclo = CicloClienteEntity.create(makeCicloProps());
      expect(ciclo.cicloVigenteId).toBe('ciclo-vigente-master-uuid');
    });

    it('acepta cualquier UUID como cicloVigenteId (no valida existencia en master)', () => {
      // La entidad NO valida que este UUID exista en master.ciclos_vigentes.
      // Esa es una validación de aplicación (cross-DB), no de dominio.
      const uuidArbitrario = 'ffffffff-ffff-7fff-bfff-ffffffffffff';
      const ciclo = CicloClienteEntity.create(makeCicloProps({ cicloVigenteId: uuidArbitrario }));
      expect(ciclo.cicloVigenteId).toBe(uuidArbitrario);
    });

    it('dos ciclos pueden referenciar el mismo cicloVigenteId (son independientes)', () => {
      const sharedRef = 'ciclo-vigente-compartido-uuid';
      const a = CicloClienteEntity.create(makeCicloProps({ cicloVigenteId: sharedRef }));
      const b = CicloClienteEntity.create(makeCicloProps({ cicloVigenteId: sharedRef }));
      expect(a.cicloVigenteId).toBe(sharedRef);
      expect(b.cicloVigenteId).toBe(sharedRef);
      // Pero tienen IDs de ciclo_cliente diferentes
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('Getters de propiedades', () => {
    it('expone nombre, fechaInicio, fechaFin y activo', () => {
      const props = makeCicloProps();
      const ciclo = CicloClienteEntity.create(props);
      expect(ciclo.nombre).toBe(props.nombre);
      expect(ciclo.fechaInicio).toBe(props.fechaInicio);
      expect(ciclo.fechaFin).toBe(props.fechaFin);
      expect(ciclo.activo).toBe(true);
    });
  });

  describe('softDelete()', () => {
    it('permite dar de baja lógica el ciclo', () => {
      const ciclo = CicloClienteEntity.create(makeCicloProps());
      ciclo.softDelete();
      expect(ciclo.isDeleted()).toBe(true);
      expect(ciclo.deletedAt).not.toBeNull();
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos desde la DB', () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-05T00:00:00.000Z');
      const ciclo = CicloClienteEntity.reconstitute(
        makeCicloProps({ activo: false }),
        '01966a6a-0000-7000-8000-000000000030',
        createdAt,
        updatedAt,
        null,
      );
      expect(ciclo.id).toBe('01966a6a-0000-7000-8000-000000000030');
      expect(ciclo.createdAt.getTime()).toBe(createdAt.getTime());
      expect(ciclo.activo).toBe(false);
    });
  });
});
