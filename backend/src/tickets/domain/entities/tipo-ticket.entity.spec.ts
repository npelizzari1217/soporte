/**
 * T2.1 [UNIT] — RED→GREEN: TipoTicketEntity (catálogo EDITABLE por ADMINISTRADOR, T2).
 *
 * A diferencia de Estado/Prioridad, `tipos_ticket` NO tiene columnas
 * color/orden en el schema real (`prisma_tenant/schema.prisma`) — props
 * mínimas: codigo, nombre, activo.
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T2.1
 */
import { TipoTicketEntity } from './tipo-ticket.entity';

function baseProps() {
  return { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS' as const, activo: true };
}

describe('TipoTicketEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const tipo = TipoTicketEntity.create(baseProps());

      expect(tipo.codigo).toBe('SOPORTE');
      expect(tipo.nombre).toBe('Soporte');
      expect(tipo.activo).toBe(true);
      expect(tipo.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('acepta un tipo custom (no del mapa base SOP/COM/EDI/MAN)', () => {
      const tipo = TipoTicketEntity.create({
        codigo: 'RRHH',
        nombre: 'Recursos Humanos',
        modulo: 'TICKETS',
        activo: true,
      });
      expect(tipo.codigo).toBe('RRHH');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id y timestamps exactos', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const tipo = TipoTicketEntity.reconstitute(
        { codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento', modulo: 'TICKETS', activo: true },
        'db-uuid-mant',
        createdAt,
        updatedAt,
        null,
      );

      expect(tipo.id).toBe('db-uuid-mant');
      expect(tipo.codigo).toBe('MANTENIMIENTO');
      expect(tipo.createdAt).toEqual(createdAt);
      expect(tipo.updatedAt).toEqual(updatedAt);
      expect(tipo.deletedAt).toBeNull();
    });

    it('preserva deletedAt no-nulo (tipo dado de baja — T2: no rompe tickets existentes)', () => {
      const deletedAt = new Date('2026-03-01T00:00:00Z');
      const tipo = TipoTicketEntity.reconstitute(
        baseProps(),
        'db-uuid-baja',
        new Date(),
        new Date(),
        deletedAt,
      );

      expect(tipo.isDeleted()).toBe(true);
      expect(tipo.deletedAt).toEqual(deletedAt);
    });
  });

  // ─── T11.1 — CRUD editable (PR11) ────────────────────────────────────────

  describe('actualizar()', () => {
    it('actualiza nombre y codigo cuando se proveen, y actualiza updatedAt', () => {
      const tipo = TipoTicketEntity.create(baseProps());
      const updatedAtOriginal = tipo.updatedAt;

      tipo.actualizar({ nombre: 'Soporte Técnico', codigo: 'SOPORTE2' });

      expect(tipo.nombre).toBe('Soporte Técnico');
      expect(tipo.codigo).toBe('SOPORTE2');
      expect(tipo.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtOriginal.getTime());
    });

    it('campos undefined no se tocan (PATCH semántico)', () => {
      const tipo = TipoTicketEntity.create(baseProps());

      tipo.actualizar({ nombre: 'Nuevo Nombre' });

      expect(tipo.nombre).toBe('Nuevo Nombre');
      expect(tipo.codigo).toBe('SOPORTE');
    });
  });

  describe('desactivar()/activar()', () => {
    it('desactivar() setea deletedAt (soft delete) y activo=false, sin romper referencias existentes (T2)', () => {
      const tipo = TipoTicketEntity.create(baseProps());

      tipo.desactivar();

      expect(tipo.isDeleted()).toBe(true);
      expect(tipo.deletedAt).not.toBeNull();
      expect(tipo.activo).toBe(false);
    });

    it('activar() limpia deletedAt y setea activo=true (reingreso a altas)', () => {
      const tipo = TipoTicketEntity.create(baseProps());
      tipo.desactivar();

      tipo.activar();

      expect(tipo.isDeleted()).toBe(false);
      expect(tipo.deletedAt).toBeNull();
      expect(tipo.activo).toBe(true);
    });
  });
});
