/**
 * SA2 [UNIT] — RED→GREEN: SlaConfigEntity (S1 — config de SLA por
 * prioridad, editable por ADMINISTRADOR).
 *
 * Ref spec: sdd/premium/spec S1. Ref design: ADR-P1/ADR-P4. Tarea: SA2.
 */
import { SlaConfigEntity } from './sla-config.entity';

function baseProps() {
  return { prioridadId: '019-test-prioridad', horas: 4, activo: true };
}

describe('SlaConfigEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const config = SlaConfigEntity.create(baseProps());

      expect(config.prioridadId).toBe('019-test-prioridad');
      expect(config.horas).toBe(4);
      expect(config.activo).toBe(true);
      expect(config.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('lanza si horas no es > 0', () => {
      expect(() => SlaConfigEntity.create({ ...baseProps(), horas: 0 })).toThrow(/horas/i);
      expect(() => SlaConfigEntity.create({ ...baseProps(), horas: -5 })).toThrow(/horas/i);
    });
  });

  describe('editarHoras()', () => {
    it('actualiza horas cuando es > 0', () => {
      const config = SlaConfigEntity.create(baseProps());
      config.editarHoras(8);
      expect(config.horas).toBe(8);
    });

    it('lanza y no muta si horas no es > 0', () => {
      const config = SlaConfigEntity.create(baseProps());
      expect(() => config.editarHoras(0)).toThrow(/horas/i);
      expect(config.horas).toBe(4);
    });
  });

  describe('activar()/desactivar()', () => {
    it('desactivar() setea activo=false', () => {
      const config = SlaConfigEntity.create(baseProps());
      config.desactivar();
      expect(config.activo).toBe(false);
    });

    it('activar() setea activo=true', () => {
      const config = SlaConfigEntity.create({ ...baseProps(), activo: false });
      config.activar();
      expect(config.activo).toBe(true);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye preservando id/timestamps', () => {
      const id = '019-test-id';
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-02T00:00:00.000Z');
      const config = SlaConfigEntity.reconstitute(baseProps(), id, createdAt, updatedAt, null);

      expect(config.id).toBe(id);
      expect(config.createdAt).toEqual(createdAt);
      expect(config.updatedAt).toEqual(updatedAt);
      expect(config.deletedAt).toBeNull();
    });
  });
});
