/**
 * 2.A.1 TEST — Unit tests de UsuarioEntity (RED → GREEN con 2.A.2)
 *
 * Cubre:
 * - Constructor: UUIDv7, activo=true, deletedAt=null
 * - suspend(): activo=false + softDelete
 * - hashPassword(): delega al IHashProvider y almacena el resultado
 * - verifyPassword(): delega al IHashProvider y retorna el resultado
 */
import { UsuarioEntity } from './usuario.entity';
import { RoleEntity } from './role.entity';
import { IHashProvider } from '../ports/i-hash.provider';

/** Mock del IHashProvider para aislar tests de infraestructura de hashing */
const makeHashProvider = (
  overrides: Partial<{ hash: vi.Mock; verify: vi.Mock }> = {},
): IHashProvider => ({
  hash: vi.fn().mockResolvedValue('$argon2id$hashed_value'),
  verify: vi.fn().mockResolvedValue(true),
  ...overrides,
});

const makeUsuario = (
  overrides: Partial<{
    email: string;
    nombre: string;
    apellido: string;
    passwordHash: string;
    clienteId: string;
    activo: boolean;
    roles: any[];
  }> = {},
) =>
  UsuarioEntity.create({
    email: 'test@example.com',
    nombre: 'Juan',
    apellido: 'Perez',
    passwordHash: 'existing_hash',
    clienteId: 'cliente-uuid',
    activo: true,
    roles: [],
    ...overrides,
  });

describe('UsuarioEntity', () => {
  describe('Construcción (BaseEntity heredado)', () => {
    it('genera un UUIDv7 al crear sin id explícito', () => {
      const usuario = makeUsuario();
      expect(usuario.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('usa el id provisto cuando se da uno explícito', () => {
      const id = '01966a6a-0000-7000-8000-000000000010';
      const usuario = UsuarioEntity.create(
        {
          email: 'a@b.com',
          nombre: 'A',
          apellido: 'B',
          passwordHash: 'h',
          clienteId: 'c',
          activo: true,
          roles: [],
        },
        id,
      );
      expect(usuario.id).toBe(id);
    });

    it('activo=true por defecto en usuario creado', () => {
      expect(makeUsuario({ activo: true }).activo).toBe(true);
    });

    it('deletedAt=null al crear', () => {
      expect(makeUsuario().deletedAt).toBeNull();
      expect(makeUsuario().isDeleted()).toBe(false);
    });

    it('IDs únicos entre instancias creadas consecutivamente', () => {
      const a = makeUsuario();
      const b = makeUsuario();
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('Getters de dominio', () => {
    it('expone email', () => {
      expect(makeUsuario({ email: 'admin@test.com' }).email).toBe('admin@test.com');
    });

    it('expone nombre', () => {
      expect(makeUsuario({ nombre: 'María' }).nombre).toBe('María');
    });

    it('expone apellido', () => {
      expect(makeUsuario({ apellido: 'García' }).apellido).toBe('García');
    });

    it('expone passwordHash', () => {
      expect(makeUsuario({ passwordHash: 'stored_hash' }).passwordHash).toBe('stored_hash');
    });

    it('expone clienteId', () => {
      expect(makeUsuario({ clienteId: 'cli-123' }).clienteId).toBe('cli-123');
    });

    it('expone activo', () => {
      expect(makeUsuario({ activo: true }).activo).toBe(true);
      expect(makeUsuario({ activo: false }).activo).toBe(false);
    });

    it('expone roles como array', () => {
      expect(makeUsuario({ roles: [] }).roles).toEqual([]);
    });
  });

  describe('suspend()', () => {
    it('setea activo=false', () => {
      const u = makeUsuario();
      u.suspend();
      expect(u.activo).toBe(false);
    });

    it('setea deletedAt al momento de la suspensión (soft delete)', () => {
      const u = makeUsuario();
      const before = new Date();
      u.suspend();
      const after = new Date();
      expect(u.deletedAt).not.toBeNull();
      expect(u.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(u.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('isDeleted() retorna true después de suspend()', () => {
      const u = makeUsuario();
      u.suspend();
      expect(u.isDeleted()).toBe(true);
    });
  });

  describe('hashPassword()', () => {
    it('llama a hashProvider.hash con el password en texto plano', async () => {
      const u = makeUsuario({ passwordHash: '' });
      const provider = makeHashProvider();
      await u.hashPassword('mi_password_seguro', provider);
      expect(provider.hash).toHaveBeenCalledWith('mi_password_seguro');
    });

    it('almacena el hash retornado por el provider (no el plaintext)', async () => {
      const u = makeUsuario({ passwordHash: '' });
      const provider = makeHashProvider({
        hash: vi.fn().mockResolvedValue('$argon2id$nuevo_hash'),
      });
      await u.hashPassword('mi_password_seguro', provider);
      expect(u.passwordHash).toBe('$argon2id$nuevo_hash');
      expect(u.passwordHash).not.toBe('mi_password_seguro');
    });

    it('el plaintext nunca aparece en passwordHash', async () => {
      const u = makeUsuario({ passwordHash: '' });
      const provider = makeHashProvider();
      const plaintext = 'super_secret_123';
      await u.hashPassword(plaintext, provider);
      expect(u.passwordHash).not.toContain(plaintext);
    });
  });

  describe('verifyPassword()', () => {
    it('llama a hashProvider.verify con el plaintext y el hash almacenado', async () => {
      const u = makeUsuario({ passwordHash: 'stored_hash' });
      const provider = makeHashProvider();
      await u.verifyPassword('plaintext', provider);
      expect(provider.verify).toHaveBeenCalledWith('plaintext', 'stored_hash');
    });

    it('retorna true cuando hashProvider.verify retorna true', async () => {
      const u = makeUsuario({ passwordHash: 'correct_hash' });
      const provider = makeHashProvider({ verify: vi.fn().mockResolvedValue(true) });
      const result = await u.verifyPassword('correct_pass', provider);
      expect(result).toBe(true);
    });

    it('retorna false cuando hashProvider.verify retorna false', async () => {
      const u = makeUsuario({ passwordHash: 'correct_hash' });
      const provider = makeHashProvider({ verify: vi.fn().mockResolvedValue(false) });
      const result = await u.verifyPassword('wrong_pass', provider);
      expect(result).toBe(false);
    });
  });

  describe('addRol()', () => {
    const makeRole = (codigo: string, id?: string): RoleEntity =>
      RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] }, id);

    it('agrega un rol al usuario si no existe', () => {
      const usuario = makeUsuario({ roles: [] });
      const role = makeRole('ADMIN');
      usuario.addRol(role);
      expect(usuario.roles).toHaveLength(1);
      expect(usuario.roles[0].codigo).toBe('ADMIN');
    });

    it('agrega roles con codigos distintos', () => {
      const usuario = makeUsuario({ roles: [] });
      usuario.addRol(makeRole('ADMIN'));
      usuario.addRol(makeRole('SOPORTE_IT'));
      expect(usuario.roles).toHaveLength(2);
    });

    it('no agrega un rol con el mismo id (dedup por id)', () => {
      const role = makeRole('SOPORTE_IT', 'role-same-id');
      const usuario = makeUsuario({ roles: [role] });
      usuario.addRol(role);
      expect(usuario.roles).toHaveLength(1);
    });

    it('no agrega un rol cuyo codigo ya existe aunque el id sea distinto (dedup por codigo)', () => {
      const role1 = makeRole('ADMIN', 'id-1');
      const role2SameCodigo = makeRole('ADMIN', 'id-2');
      const usuario = makeUsuario({ roles: [role1] });
      usuario.addRol(role2SameCodigo);
      expect(usuario.roles).toHaveLength(1);
    });
  });
});
