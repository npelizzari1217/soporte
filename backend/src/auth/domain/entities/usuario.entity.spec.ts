/**
 * T2.1 TEST — Unit tests de UsuarioEntity (RED → GREEN)
 *
 * ADR-1: identidad global — el usuario NO tiene clienteId ni roles[] propios.
 * La pertenencia a un cliente y el rol viven en MembresiaEntity (N:N).
 *
 * Cubre:
 * - Constructor: UUIDv7, activo=true, deletedAt=null
 * - suspend(): activo=false + softDelete
 * - hashPassword(): delega al IHashProvider y almacena el resultado
 * - verifyPassword(): delega al IHashProvider y retorna el resultado
 * - isRoot(): alias de isGlobalAdmin, NUNCA derivado de un rol
 */
import type { Mocked } from 'vitest';
import {
  UsuarioEntity,
  USUARIO_NOMBRE_MAX_LENGTH,
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_EMAIL_MAX_LENGTH,
} from './usuario.entity';
import { IHashProvider } from '../ports/i-hash.provider';

/** Mock del IHashProvider para aislar tests de infraestructura de hashing */
const makeHashProvider = (overrides: Partial<Mocked<IHashProvider>> = {}): IHashProvider => ({
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
    activo: boolean;
    isGlobalAdmin: boolean;
  }> = {},
) =>
  UsuarioEntity.create({
    email: 'test@example.com',
    nombre: 'Juan',
    apellido: 'Perez',
    passwordHash: 'existing_hash',
    activo: true,
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
          activo: true,
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

    it('isGlobalAdmin=false por defecto si no se provee', () => {
      const usuario = UsuarioEntity.create({
        email: 'a@b.com',
        nombre: 'A',
        apellido: 'B',
        passwordHash: 'h',
        activo: true,
      });
      expect(usuario.isGlobalAdmin).toBe(false);
    });

    it('IDs únicos entre instancias creadas consecutivamente', () => {
      const a = makeUsuario();
      const b = makeUsuario();
      expect(a.id).not.toBe(b.id);
    });

    it('NO expone clienteId (identidad global, R3/ADR-1)', () => {
      const usuario = makeUsuario();
      expect((usuario as unknown as Record<string, unknown>).clienteId).toBeUndefined();
    });

    it('NO expone roles propios (el rol vive en la membresía, ADR-1)', () => {
      const usuario = makeUsuario();
      expect((usuario as unknown as Record<string, unknown>).roles).toBeUndefined();
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye un usuario desde persistencia', () => {
      const usuario = UsuarioEntity.reconstitute(
        {
          email: 'root@soporte.com',
          nombre: 'Root',
          apellido: 'Admin',
          passwordHash: 'hash',
          activo: true,
          isGlobalAdmin: true,
        },
        'usuario-uuid',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-06-01T00:00:00Z'),
        null,
      );
      expect(usuario.id).toBe('usuario-uuid');
      expect(usuario.email).toBe('root@soporte.com');
      expect(usuario.isGlobalAdmin).toBe(true);
    });

    it('preserva deletedAt no-nulo → isDeleted() retorna true', () => {
      const deletedAt = new Date('2025-12-01T00:00:00Z');
      const usuario = UsuarioEntity.reconstitute(
        {
          email: 'x@x.com',
          nombre: 'X',
          apellido: 'Y',
          passwordHash: 'h',
          activo: false,
          isGlobalAdmin: false,
        },
        'usuario-uuid',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-12-01T00:00:00Z'),
        deletedAt,
      );
      expect(usuario.isDeleted()).toBe(true);
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

    it('expone activo', () => {
      expect(makeUsuario({ activo: true }).activo).toBe(true);
      expect(makeUsuario({ activo: false }).activo).toBe(false);
    });

    it('expone isGlobalAdmin', () => {
      expect(makeUsuario({ isGlobalAdmin: true }).isGlobalAdmin).toBe(true);
      expect(makeUsuario({ isGlobalAdmin: false }).isGlobalAdmin).toBe(false);
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

  describe('isRoot()', () => {
    it('devuelve true cuando isGlobalAdmin=true', () => {
      const usuario = makeUsuario({ isGlobalAdmin: true });
      expect(usuario.isRoot()).toBe(true);
      expect(usuario.isRoot()).toBe(usuario.isGlobalAdmin);
    });

    it('devuelve false cuando isGlobalAdmin=false, sin importar el rol de sus membresías', () => {
      // isRoot() NUNCA se deriva de un rol de membresía (ortogonalidad, ADR).
      // Un usuario puede tener rol ADMINISTRADOR en una membresía y NO ser root.
      const usuario = makeUsuario({ isGlobalAdmin: false });
      expect(usuario.isRoot()).toBe(false);
    });
  });
});

/**
 * Topes de largo de la identidad del usuario.
 *
 * Espejan `usuarios.nombre`/`apellido` `VarChar(100)` y `usuarios.email`
 * `VarChar(255)` (`prisma_master/schema.prisma`). Suben al dominio porque esas
 * columnas se escriben desde DOS altas distintas —`CreateUsuarioTenantDto` y
 * `CreateClienteDto` (los campos de admin del alta de tenant)— y ninguna las
 * acotaba: el valor llegaba a Postgres y moría ahí (22001 → 500 crudo). La
 * EDICIÓN sí tenía `@MaxLength(100)`, escrito a mano, así que un nombre de 120
 * se podía crear y después nunca editar.
 *
 * `email` solo se valida en `create()`: `editar()` no lo toca (el email no se
 * edita, ver `EditarUsuarioDto`).
 */
describe('UsuarioEntity — topes de largo de la identidad', () => {
  it('acepta nombre y apellido en el límite exacto', () => {
    const usuario = makeUsuario({
      nombre: 'A'.repeat(USUARIO_NOMBRE_MAX_LENGTH),
      apellido: 'B'.repeat(USUARIO_APELLIDO_MAX_LENGTH),
    });
    expect(usuario.nombre).toHaveLength(USUARIO_NOMBRE_MAX_LENGTH);
    expect(usuario.apellido).toHaveLength(USUARIO_APELLIDO_MAX_LENGTH);
  });

  it('create() rechaza un nombre que pasa el tope', () => {
    expect(() => makeUsuario({ nombre: 'A'.repeat(USUARIO_NOMBRE_MAX_LENGTH + 1) })).toThrow(
      /nombre excede/,
    );
  });

  it('create() rechaza un apellido que pasa el tope', () => {
    expect(() => makeUsuario({ apellido: 'A'.repeat(USUARIO_APELLIDO_MAX_LENGTH + 1) })).toThrow(
      /apellido excede/,
    );
  });

  it('create() rechaza un email que pasa el tope', () => {
    expect(() => makeUsuario({ email: 'a'.repeat(USUARIO_EMAIL_MAX_LENGTH + 1) })).toThrow(
      /email excede/,
    );
  });

  it('editar() rechaza un nombre que pasa el tope', () => {
    const usuario = makeUsuario();
    expect(() => usuario.editar({ nombre: 'A'.repeat(USUARIO_NOMBRE_MAX_LENGTH + 1) })).toThrow(
      /nombre excede/,
    );
  });

  it('editar() rechaza un apellido que pasa el tope', () => {
    const usuario = makeUsuario();
    expect(() => usuario.editar({ apellido: 'A'.repeat(USUARIO_APELLIDO_MAX_LENGTH + 1) })).toThrow(
      /apellido excede/,
    );
  });

  it('editar() sin tocar el nombre no lo valida ni lo cambia', () => {
    const usuario = makeUsuario({ nombre: 'Juan' });
    usuario.editar({ apellido: 'Gomez' });
    expect(usuario.nombre).toBe('Juan');
    expect(usuario.apellido).toBe('Gomez');
  });

  /**
   * Hermano invertido: los topes son EXACTAMENTE el ancho de la columna, así
   * que ninguna fila guardada puede excederlos — lo que se colaba moría al
   * persistir. La exención de `reconstitute()` es precaución para el día que
   * la columna se ensanche y el tope no la siga.
   */
  it('reconstitute() NO valida el tope (una lectura nunca revalida)', () => {
    const usuario = UsuarioEntity.reconstitute(
      {
        email: 'viejo@example.com',
        nombre: 'A'.repeat(USUARIO_NOMBRE_MAX_LENGTH + 50),
        apellido: 'Perez',
        passwordHash: 'h',
        activo: true,
      },
      'id-1',
      new Date(),
      new Date(),
      null,
    );
    expect(usuario.nombre).toHaveLength(USUARIO_NOMBRE_MAX_LENGTH + 50);
  });

  /** Centinela de valor: los topes son el ancho real de cada columna. */
  it('los topes coinciden con el ancho de las columnas', () => {
    expect(USUARIO_NOMBRE_MAX_LENGTH).toBe(100);
    expect(USUARIO_APELLIDO_MAX_LENGTH).toBe(100);
    expect(USUARIO_EMAIL_MAX_LENGTH).toBe(255);
  });
});
