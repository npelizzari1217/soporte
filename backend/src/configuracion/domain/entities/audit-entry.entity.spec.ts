/**
 * 3.2 — RED: `AuditEntry.create()` — entidad plana, `id`+`createdAt`, SIN
 * `updatedAt`/`deletedAt` (Dz8, §9 NFR spec — desviación deliberada del
 * soft-delete universal del proyecto: un audit borrable/mutable deja de ser
 * evidencia).
 *
 * Ref design: §5 (firma exacta), §2 Dz8. Ref spec: §0 "Desviación deliberada
 * de config.yaml", R5. Ref tasks: PR3 3.2/3.3.
 */
import { AuditEntry } from './audit-entry.entity';

const PROPS_NO_SECRETA = {
  actorId: 'actor-uuid',
  accion: 'config.actualizada',
  categoria: 'smtp',
  clave: 'host',
  valorAnterior: 'old.smtp.com',
  valorNuevo: 'new.smtp.com',
  esSecreto: false,
};

describe('AuditEntry', () => {
  describe('create()', () => {
    it('construye la entidad con todos los props + id + createdAt', () => {
      const entry = AuditEntry.create(PROPS_NO_SECRETA);

      expect(entry.props.actorId).toBe('actor-uuid');
      expect(entry.props.accion).toBe('config.actualizada');
      expect(entry.props.categoria).toBe('smtp');
      expect(entry.props.clave).toBe('host');
      expect(entry.props.valorAnterior).toBe('old.smtp.com');
      expect(entry.props.valorNuevo).toBe('new.smtp.com');
      expect(entry.props.esSecreto).toBe(false);
    });

    it('genera un id (UUID) cuando no se provee uno', () => {
      const entry = AuditEntry.create(PROPS_NO_SECRETA);

      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
    });

    it('acepta un id explícito (reconstitución desde persistencia)', () => {
      const entry = AuditEntry.create(PROPS_NO_SECRETA, 'id-fijo-de-test');

      expect(entry.id).toBe('id-fijo-de-test');
    });

    it('setea createdAt = now() al crear', () => {
      const antes = new Date();
      const entry = AuditEntry.create(PROPS_NO_SECRETA);
      const despues = new Date();

      expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(antes.getTime());
      expect(entry.createdAt.getTime()).toBeLessThanOrEqual(despues.getTime());
    });

    it('acepta valorAnterior null (primer set de una clave, sin fila previa)', () => {
      const entry = AuditEntry.create({ ...PROPS_NO_SECRETA, valorAnterior: null });

      expect(entry.props.valorAnterior).toBeNull();
    });

    it('la entidad NO expone updatedAt ni deletedAt (Dz8 — inmutable, sin soft-delete)', () => {
      const entry = AuditEntry.create(PROPS_NO_SECRETA);
      const propiedades = Object.keys(entry);

      expect(propiedades).not.toContain('updatedAt');
      expect(propiedades).not.toContain('deletedAt');
    });
  });
});
