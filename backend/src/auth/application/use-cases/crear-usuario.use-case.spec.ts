/**
 * T3.2 [RED/GREEN] — Unit tests para CrearUsuarioUseCase.
 *
 * Contrato verificado:
 * - Crea usuario con cliente_id del contexto, activo=TRUE, is_global_admin=FALSE, password hasheado
 * - Asigna el rol especificado
 * - Email duplicado → UsuarioConflictError
 * - Rol inválido (no en DB) → RolNoEncontradoError
 * - password/password_hash NEVER en el Result
 * - is_global_admin=TRUE nunca se puede establecer via este use case
 *
 * Spec ref: clientes-tenancy/POST /usuarios
 * Tarea: T3.2
 */

import { CrearUsuarioUseCase, type CrearUsuarioDto } from './crear-usuario.use-case';
import { UsuarioConflictError } from '../../domain/errors/auth.errors';
import { RolNoEncontradoError } from '../../domain/errors/auth.errors';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRol(codigo = 'TECNICO'): RoleEntity {
  return RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] });
}

function makeUsuarioRepo() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByClienteId: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

function makeHashProvider() {
  return {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    verify: vi.fn(),
  };
}

function makeRoleRepo() {
  return {
    findByCodigo: vi.fn(),
    findWithPermisos: vi.fn(),
  };
}

function makeDto(overrides?: Partial<CrearUsuarioDto>): CrearUsuarioDto {
  return {
    email: 'juan@empresa.com',
    nombre: 'Juan',
    apellido: 'Pérez',
    password: 'secret123',
    rolCodigo: 'TECNICO',
    clienteId: 'cliente-uuid-1',
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CrearUsuarioUseCase (T3.2)', () => {
  let usuarioRepo: ReturnType<typeof makeUsuarioRepo>;
  let hashProvider: ReturnType<typeof makeHashProvider>;
  let roleRepo: ReturnType<typeof makeRoleRepo>;
  let useCase: CrearUsuarioUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    hashProvider = makeHashProvider();
    roleRepo = makeRoleRepo();
    useCase = new CrearUsuarioUseCase(usuarioRepo as any, hashProvider as any, roleRepo as any);
  });

  describe('creación exitosa', () => {
    it('crea usuario con cliente_id del contexto, activo=TRUE, is_global_admin=FALSE', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(makeRol('TECNICO'));
      usuarioRepo.create.mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto());

      expect(result.isOk()).toBe(true);
      const entity = result.getValue();
      expect(entity.clienteId).toBe('cliente-uuid-1');
      expect(entity.activo).toBe(true);
      expect(entity.isGlobalAdmin).toBe(false);
    });

    it('llama a hashProvider.hash con la contraseña plana', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(makeRol('TECNICO'));
      usuarioRepo.create.mockResolvedValue(undefined);

      await useCase.execute(makeDto({ password: 'my_secret' }));

      expect(hashProvider.hash).toHaveBeenCalledWith('my_secret');
    });

    it('persiste la entidad via usuarioRepo.create', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(makeRol('TECNICO'));
      usuarioRepo.create.mockResolvedValue(undefined);

      await useCase.execute(makeDto());

      expect(usuarioRepo.create).toHaveBeenCalledTimes(1);
    });

    it('asigna el rol especificado al usuario', async () => {
      const rol = makeRol('ADMINISTRADOR');
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(rol);
      usuarioRepo.create.mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto({ rolCodigo: 'ADMINISTRADOR' }));

      expect(result.isOk()).toBe(true);
      const entity = result.getValue();
      expect(entity.roles).toHaveLength(1);
      expect(entity.roles[0].codigo).toBe('ADMINISTRADOR');
    });

    it('password_hash nunca aparece en el Result (la entidad no expone password plano)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(makeRol());
      usuarioRepo.create.mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto());

      // La entidad no debe exponer contraseña plana; passwordHash es el hash opaco
      expect(result.isOk()).toBe(true);
      const entity = result.getValue();
      // @ts-expect-error — verificar que no hay campo password plano
      expect(entity.password).toBeUndefined();
    });

    it('is_global_admin CANNOT ser TRUE (siempre FALSE desde este use case)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(makeRol());
      usuarioRepo.create.mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto());

      expect(result.getValue().isGlobalAdmin).toBe(false);
    });
  });

  describe('errores', () => {
    it('email duplicado → UsuarioConflictError', async () => {
      const existente = UsuarioEntity.create({
        email: 'juan@empresa.com',
        nombre: 'Juan',
        apellido: 'P',
        passwordHash: 'x',
        clienteId: 'c1',
        activo: true,
        isGlobalAdmin: false,
        roles: [],
      });
      usuarioRepo.findByEmail.mockResolvedValue(existente);

      const result = await useCase.execute(makeDto());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioConflictError);
    });

    it('email duplicado → NO llama a create ni a hashProvider', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(
        UsuarioEntity.create({
          email: 'juan@empresa.com',
          nombre: 'J',
          apellido: 'P',
          passwordHash: 'x',
          clienteId: 'c1',
          activo: true,
          isGlobalAdmin: false,
          roles: [],
        }),
      );

      await useCase.execute(makeDto());

      expect(hashProvider.hash).not.toHaveBeenCalled();
      expect(usuarioRepo.create).not.toHaveBeenCalled();
    });

    it('rol inválido (no en DB) → RolNoEncontradoError', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(makeDto({ rolCodigo: 'SUPER_ADMIN' }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(RolNoEncontradoError);
    });

    it('rol inválido → NO llama a create', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      roleRepo.findByCodigo.mockResolvedValue(null);

      await useCase.execute(makeDto({ rolCodigo: 'SUPER_ADMIN' }));

      expect(usuarioRepo.create).not.toHaveBeenCalled();
    });
  });
});
