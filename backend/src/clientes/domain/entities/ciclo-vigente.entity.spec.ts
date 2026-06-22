/**
 * 1.A.1 TEST — Unit tests de CicloVigenteEntity (RED → GREEN con 1.A.2)
 *
 * Cubre:
 * - Herencia de BaseEntity
 * - Validación: fecha_fin > fecha_inicio
 * - Getters de propiedades del dominio
 * - soft delete heredado
 */
import { CicloVigenteEntity } from './ciclo-vigente.entity';
import { CicloVigenteInvalidDatesError } from '../errors/clientes.errors';

const fechaInicio = new Date('2026-01-01');
const fechaFin = new Date('2026-12-31');

const makeCiclo = (overrides: Partial<Parameters<(typeof CicloVigenteEntity)['create']>[0]> = {}) =>
  CicloVigenteEntity.create({
    nombre: 'Ejercicio 2026',
    fechaInicio,
    fechaFin,
    activo: true,
    ...overrides,
  });

describe('CicloVigenteEntity', () => {
  describe('Construcción válida', () => {
    it('genera un id UUIDv7', () => {
      const ciclo = makeCiclo();
      expect(ciclo.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('usa el id provisto cuando se da uno explícito', () => {
      const id = '01966a6a-0000-7000-8000-000000000002';
      const ciclo = CicloVigenteEntity.create(
        { nombre: 'Test', fechaInicio, fechaFin, activo: true },
        id,
      );
      expect(ciclo.id).toBe(id);
    });

    it('deletedAt es null al crear', () => {
      expect(makeCiclo().deletedAt).toBeNull();
      expect(makeCiclo().isDeleted()).toBe(false);
    });
  });

  describe('Validación de fechas', () => {
    it('lanza CicloVigenteInvalidDatesError cuando fechaFin <= fechaInicio (iguales)', () => {
      expect(() =>
        CicloVigenteEntity.create({
          nombre: 'Bad',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-01-01'),
          activo: true,
        }),
      ).toThrow(CicloVigenteInvalidDatesError);
    });

    it('lanza CicloVigenteInvalidDatesError cuando fechaFin < fechaInicio', () => {
      expect(() =>
        CicloVigenteEntity.create({
          nombre: 'Bad',
          fechaInicio: new Date('2026-12-31'),
          fechaFin: new Date('2026-01-01'),
          activo: true,
        }),
      ).toThrow(CicloVigenteInvalidDatesError);
    });

    it('NO lanza cuando fechaFin > fechaInicio', () => {
      expect(() => makeCiclo()).not.toThrow();
    });
  });

  describe('Getters de dominio', () => {
    it('expone nombre', () => {
      expect(makeCiclo({ nombre: 'Q1 2026' }).nombre).toBe('Q1 2026');
    });

    it('expone fechaInicio', () => {
      expect(makeCiclo().fechaInicio).toEqual(fechaInicio);
    });

    it('expone fechaFin', () => {
      expect(makeCiclo().fechaFin).toEqual(fechaFin);
    });

    it('expone activo', () => {
      expect(makeCiclo({ activo: true }).activo).toBe(true);
      expect(makeCiclo({ activo: false }).activo).toBe(false);
    });
  });

  describe('softDelete heredado', () => {
    it('setea deletedAt y isDeleted() = true', () => {
      const ciclo = makeCiclo();
      ciclo.softDelete();
      expect(ciclo.isDeleted()).toBe(true);
      expect(ciclo.deletedAt).not.toBeNull();
    });
  });
});
