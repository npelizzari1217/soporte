/**
 * B.1/B.2 [RED→GREEN] — Unit tests para CrearRootUseCase.
 *
 * Contrato verificado (design root-tenant-admin §2.3, Dz2):
 * - Actor root (actor.isRoot=true) crea un usuario con isGlobalAdmin=true, roles=[].
 * - Actor no-root (actor.isRoot=false) → RootRequeridoError, SIN crear usuario
 *   (authz de aplicación, defensa en profundidad, independiente del guard — R7).
 * - Email duplicado → UsuarioConflictError.
 * - password NUNCA aparece en el Result (solo passwordHash).
 *
 * Spec ref: root-tenant-admin R2, R7
 * Tarea: B.1-B.4
 */

import { CrearRootUseCase, type CrearRootDto } from './crear-root.use-case';
import { RootRequeridoError, UsuarioConflictError } from '../../domain/errors/auth.errors';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

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

function makeDto(overrides?: Partial<CrearRootDto>): CrearRootDto {
  return {
    email: 'nuevo-root@empresa.com',
    nombre: 'Root',
    apellido: 'Dos',
    password: 'secret123',
    clienteId: 'cliente-uuid-1',
    actor: { id: 'actor-root-uuid', isRoot: true },
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CrearRootUseCase (B.1-B.4)', () => {
  let usuarioRepo: ReturnType<typeof makeUsuarioRepo>;
  let hashProvider: ReturnType<typeof makeHashProvider>;
  let useCase: CrearRootUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    hashProvider = makeHashProvider();
    useCase = new CrearRootUseCase(usuarioRepo as any, hashProvider as any);
  });

  describe('creación exitosa (R2-a)', () => {
    it('actor root crea usuario con isGlobalAdmin=true y roles=[]', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      usuarioRepo.create.mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto());

      expect(result.isOk()).toBe(true);
      const entity = result.getValue();
      expect(entity.isGlobalAdmin).toBe(true);
      expect(entity.roles).toHaveLength(0);
      expect(entity.clienteId).toBe('cliente-uuid-1');
    });

    it('hashea el password con IHashProvider antes de persistir', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      usuarioRepo.create.mockResolvedValue(undefined);

      await useCase.execute(makeDto({ password: 'my_secret' }));

      expect(hashProvider.hash).toHaveBeenCalledWith('my_secret');
    });

    it('persiste la entidad via usuarioRepo.create', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      usuarioRepo.create.mockResolvedValue(undefined);

      await useCase.execute(makeDto());

      expect(usuarioRepo.create).toHaveBeenCalledTimes(1);
    });

    it('password NUNCA aparece en el Result (solo passwordHash opaco)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      usuarioRepo.create.mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto());

      // @ts-expect-error — verificar que no hay campo password plano
      expect(result.getValue().password).toBeUndefined();
    });
  });

  describe('doble validación de authz — actor no-root [CRITICAL] (R2-b/R7-a)', () => {
    it('actor.isRoot=false → RootRequeridoError', async () => {
      const result = await useCase.execute(makeDto({ actor: { id: 'admin-uuid', isRoot: false } }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(RootRequeridoError);
    });

    it('actor.isRoot=false → NO consulta findByEmail ni crea el usuario', async () => {
      await useCase.execute(makeDto({ actor: { id: 'admin-uuid', isRoot: false } }));

      expect(usuarioRepo.findByEmail).not.toHaveBeenCalled();
      expect(usuarioRepo.create).not.toHaveBeenCalled();
      expect(hashProvider.hash).not.toHaveBeenCalled();
    });

    it('la validación de actor.isRoot ocurre ANTES de cualquier I/O — defensa en profundidad real', async () => {
      // Aunque el repo esté armado para devolver un usuario existente, el rechazo
      // por actor.isRoot=false debe ganar SIEMPRE, sin depender del guard de presentación.
      usuarioRepo.findByEmail.mockResolvedValue(
        UsuarioEntity.create({
          email: 'nuevo-root@empresa.com',
          nombre: 'X',
          apellido: 'Y',
          passwordHash: 'x',
          clienteId: 'c1',
          activo: true,
          isGlobalAdmin: false,
          roles: [],
        }),
      );

      const result = await useCase.execute(makeDto({ actor: { id: 'admin-uuid', isRoot: false } }));

      expect(result.getError()).toBeInstanceOf(RootRequeridoError);
    });
  });

  describe('errores', () => {
    it('email duplicado → UsuarioConflictError', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(
        UsuarioEntity.create({
          email: 'nuevo-root@empresa.com',
          nombre: 'Existente',
          apellido: 'Y',
          passwordHash: 'x',
          clienteId: 'c1',
          activo: true,
          isGlobalAdmin: false,
          roles: [],
        }),
      );

      const result = await useCase.execute(makeDto());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioConflictError);
    });

    it('email duplicado → NO llama a create ni a hashProvider', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(
        UsuarioEntity.create({
          email: 'nuevo-root@empresa.com',
          nombre: 'Existente',
          apellido: 'Y',
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
  });
});
