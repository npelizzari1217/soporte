/**
 * T5.6 [U] TEST — Unit tests de `CicloClienteEntity` (RED → GREEN).
 *
 * Cubre:
 * - Soft ref sin FK: `cicloVigenteId` es un UUID arbitrario sin validación
 *   de existencia (cross-DB, la integridad se valida en la capa de
 *   aplicación si se necesita — acá no).
 * - Herencia de `BaseEntity`: id UUIDv7, timestamps, deletedAt=null.
 * - `reconstitute()` preserva los campos exactos de la DB.
 *
 * Ref spec: sdd/tickets-core/spec (tabla ciclos_cliente, T4/T7). Ref design:
 * "Archivos afectados" PR5 (ResolverCicloActivo + PrismaCicloClienteRepository).
 * Tarea: T5.6.
 */
import { CicloClienteEntity, CicloClienteProps } from './ciclo-cliente.entity';

const makeCicloProps = (overrides: Partial<CicloClienteProps> = {}): CicloClienteProps => ({
  cicloVigenteId: 'ciclo-vigente-master-uuid',
  nombre: 'Ejercicio 2026',
  fechaInicio: new Date('2026-01-01'),
  fechaFin: new Date('2026-12-31'),
  activo: true,
  ...overrides,
});

describe('CicloClienteEntity', () => {
  describe('create() — construcción (BaseEntity heredado)', () => {
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
  });

  describe('Soft ref sin FK (cicloVigenteId)', () => {
    it('almacena el cicloVigenteId como UUID opaco, sin validar existencia', () => {
      const uuidArbitrario = 'ffffffff-ffff-7fff-bfff-ffffffffffff';
      const ciclo = CicloClienteEntity.create(makeCicloProps({ cicloVigenteId: uuidArbitrario }));
      expect(ciclo.cicloVigenteId).toBe(uuidArbitrario);
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
    it('permite dar de baja lógica el ciclo (heredado de BaseEntity)', () => {
      const ciclo = CicloClienteEntity.create(makeCicloProps());
      ciclo.softDelete();
      expect(ciclo.isDeleted()).toBe(true);
      expect(ciclo.deletedAt).not.toBeNull();
    });
  });

  describe('reconstitute()', () => {
    it('preserva id, timestamps y props exactas desde la DB', () => {
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
      expect(ciclo.updatedAt.getTime()).toBe(updatedAt.getTime());
      expect(ciclo.activo).toBe(false);
    });
  });
});
