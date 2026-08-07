/**
 * T2.1 TEST — Unit tests de MembresiaEntity (RED → GREEN)
 *
 * ADR-1: la pertenencia usuario↔cliente vive en `membresias` (N:N), con UN
 * rol por membresía. Reemplaza el `usuario.clienteId` único + `usuario.roles[]`.
 *
 * Cubre:
 * - Construcción con datos válidos, activo=true por defecto
 * - Getters de dominio (usuarioId, clienteId, rolId, activo)
 * - activar()/desactivar(): mecanismo de baja lógica de acceso (no soft-delete)
 * - reconstitute() desde persistencia
 */
import { MembresiaEntity } from './membresia.entity';

const makeMembresia = (
  overrides: Partial<{
    usuarioId: string;
    clienteId: string;
    rolId: string;
    activo: boolean;
  }> = {},
) =>
  MembresiaEntity.create({
    usuarioId: 'usuario-uuid',
    clienteId: 'cliente-uuid',
    rolId: 'rol-uuid',
    activo: true,
    ...overrides,
  });

describe('MembresiaEntity', () => {
  describe('create()', () => {
    it('crea una membresía con datos válidos', () => {
      const membresia = makeMembresia();
      expect(membresia).toBeInstanceOf(MembresiaEntity);
    });

    it('asigna UUIDv7 al crear', () => {
      const membresia = makeMembresia();
      expect(membresia.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('genera IDs únicos entre instancias', () => {
      const a = makeMembresia();
      const b = makeMembresia();
      expect(a.id).not.toBe(b.id);
    });

    it('acepta un id externo si se provee', () => {
      const id = '01966a6a-0000-7000-8000-000000000050';
      const membresia = makeMembresia();
      const withId = MembresiaEntity.create(
        { usuarioId: 'u', clienteId: 'c', rolId: 'r', activo: true },
        id,
      );
      expect(withId.id).toBe(id);
      expect(membresia.id).not.toBe(id);
    });
  });

  describe('Getters de dominio', () => {
    it('expone usuarioId', () => {
      expect(makeMembresia({ usuarioId: 'u1' }).usuarioId).toBe('u1');
    });

    it('expone clienteId', () => {
      expect(makeMembresia({ clienteId: 'c1' }).clienteId).toBe('c1');
    });

    it('expone rolId', () => {
      expect(makeMembresia({ rolId: 'r1' }).rolId).toBe('r1');
    });

    it('expone activo', () => {
      expect(makeMembresia({ activo: true }).activo).toBe(true);
      expect(makeMembresia({ activo: false }).activo).toBe(false);
    });
  });

  describe('desactivar()', () => {
    it('setea activo=false', () => {
      const membresia = makeMembresia({ activo: true });
      membresia.desactivar();
      expect(membresia.activo).toBe(false);
    });

    it('es idempotente (segunda llamada no lanza ni cambia el estado)', () => {
      const membresia = makeMembresia({ activo: true });
      membresia.desactivar();
      expect(() => membresia.desactivar()).not.toThrow();
      expect(membresia.activo).toBe(false);
    });

    it('NO afecta deletedAt (revocar acceso no es soft-delete de la fila)', () => {
      const membresia = makeMembresia({ activo: true });
      membresia.desactivar();
      expect(membresia.deletedAt).toBeNull();
      expect(membresia.isDeleted()).toBe(false);
    });
  });

  describe('activar()', () => {
    it('setea activo=true', () => {
      const membresia = makeMembresia({ activo: false });
      membresia.activar();
      expect(membresia.activo).toBe(true);
    });

    it('es idempotente', () => {
      const membresia = makeMembresia({ activo: false });
      membresia.activar();
      expect(() => membresia.activar()).not.toThrow();
      expect(membresia.activo).toBe(true);
    });
  });

  describe('cambiarRol()', () => {
    it('reemplaza el rolId de la membresía', () => {
      const membresia = makeMembresia({ rolId: 'rol-viejo' });
      membresia.cambiarRol('rol-nuevo');
      expect(membresia.rolId).toBe('rol-nuevo');
    });

    it('actualiza updatedAt al cambiar de rol', () => {
      const membresia = makeMembresia();
      const before = membresia.updatedAt.getTime();
      membresia.cambiarRol('rol-nuevo');
      expect(membresia.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una membresía desde persistencia', () => {
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'u1', clienteId: 'c1', rolId: 'r1', activo: true },
        'membresia-uuid',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-06-01T00:00:00Z'),
        null,
      );
      expect(membresia.id).toBe('membresia-uuid');
      expect(membresia.usuarioId).toBe('u1');
      expect(membresia.clienteId).toBe('c1');
      expect(membresia.rolId).toBe('r1');
      expect(membresia.activo).toBe(true);
    });

    it('preserva createdAt pasado como parámetro', () => {
      const createdAt = new Date('2025-02-10T08:00:00Z');
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'u1', clienteId: 'c1', rolId: 'r1', activo: true },
        'membresia-uuid',
        createdAt,
        new Date('2025-06-01T00:00:00Z'),
        null,
      );
      expect(membresia.createdAt.getTime()).toBe(createdAt.getTime());
    });

    it('preserva deletedAt no-nulo → isDeleted() retorna true', () => {
      const deletedAt = new Date('2025-12-01T00:00:00Z');
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'u1', clienteId: 'c1', rolId: 'r1', activo: false },
        'membresia-uuid',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-12-01T00:00:00Z'),
        deletedAt,
      );
      expect(membresia.isDeleted()).toBe(true);
    });
  });
});
