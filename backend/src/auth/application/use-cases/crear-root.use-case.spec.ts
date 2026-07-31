/**
 * B.1/B.2 [RED→GREEN] — Unit tests para CrearRootUseCase.
 *
 * Contrato verificado (design root-tenant-admin §2.3, Dz2):
 * - Actor root (actor.isRoot=true) crea un usuario con isGlobalAdmin=true, roles=[].
 * - Actor no-root (actor.isRoot=false) → RootRequeridoError, SIN crear usuario
 *   (authz de aplicación, defensa en profundidad, independiente del guard — R7).
 * - Email duplicado → UsuarioConflictError.
 * - password NUNCA aparece en el Result (solo passwordHash).
 * - Creación exitosa → auditada (actor, objetivo, timestamp) vía el puerto
 *   `ILogger` (spec R2 "MUST ... auditarse (actor, objetivo, timestamp)").
 *   NO se audita en el camino de rechazo (RootRequeridoError/UsuarioConflictError)
 *   — auditoría es un side-effect del ÉXITO, sin precedente de "intento fallido"
 *   para esta acción en el repo.
 *
 * Mocks tipados a `IUsuarioRepository`/`IHashProvider`/`ILogger` (sin `as any`):
 * las factories devuelven el tipo de la interfaz; `vi.mocked(...)` se usa en
 * cada call site para acceder a los helpers de mock (`.mockResolvedValue`,
 * etc.) sin perder el chequeo estructural contra la interfaz real.
 *
 * Spec ref: root-tenant-admin R2, R7
 * Tarea: B.1-B.4; Judgment Day root-tenant-admin PR-B Ronda 1 (FIX 1, FIX 2)
 */

import { CrearRootUseCase, type CrearRootDto } from './crear-root.use-case';
import { RootRequeridoError, UsuarioConflictError } from '../../domain/errors/auth.errors';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import type { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import type { IHashProvider } from '../../domain/ports/i-hash.provider';
import type { ILogger } from '../../../shared/domain/ports/i-logger.port';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeUsuarioRepo(): IUsuarioRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByClienteId: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

function makeHashProvider(): IHashProvider {
  return {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    verify: vi.fn(),
  };
}

function makeLogger(): ILogger {
  return {
    error: vi.fn(),
    log: vi.fn(),
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

function makeUsuarioExistente(overrides?: Partial<{ isGlobalAdmin: boolean }>): UsuarioEntity {
  return UsuarioEntity.create({
    email: 'nuevo-root@empresa.com',
    nombre: 'Existente',
    apellido: 'Y',
    passwordHash: 'x',
    clienteId: 'c1',
    activo: true,
    isGlobalAdmin: overrides?.isGlobalAdmin ?? false,
    roles: [],
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CrearRootUseCase (B.1-B.4)', () => {
  let usuarioRepo: IUsuarioRepository;
  let hashProvider: IHashProvider;
  let logger: ILogger;
  let useCase: CrearRootUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    hashProvider = makeHashProvider();
    logger = makeLogger();
    useCase = new CrearRootUseCase(usuarioRepo, hashProvider, logger);
  });

  describe('creación exitosa (R2-a)', () => {
    it('actor root crea usuario con isGlobalAdmin=true y roles=[]', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(usuarioRepo.create).mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto());

      expect(result.isOk()).toBe(true);
      const entity = result.getValue();
      expect(entity.isGlobalAdmin).toBe(true);
      expect(entity.roles).toHaveLength(0);
      expect(entity.clienteId).toBe('cliente-uuid-1');
    });

    it('hashea el password con IHashProvider antes de persistir', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(usuarioRepo.create).mockResolvedValue(undefined);

      await useCase.execute(makeDto({ password: 'my_secret' }));

      expect(hashProvider.hash).toHaveBeenCalledWith('my_secret');
    });

    it('persiste la entidad via usuarioRepo.create', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(usuarioRepo.create).mockResolvedValue(undefined);

      await useCase.execute(makeDto());

      expect(usuarioRepo.create).toHaveBeenCalledTimes(1);
    });

    it('password NUNCA aparece en el Result (solo passwordHash opaco)', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(usuarioRepo.create).mockResolvedValue(undefined);

      const result = await useCase.execute(makeDto());

      // @ts-expect-error — verificar que no hay campo password plano
      expect(result.getValue().password).toBeUndefined();
    });
  });

  describe('auditoría de creación exitosa [WARNING confirmado, Judgment Day Ronda 1] (R2-a)', () => {
    it('audita actor, objetivo (email) y timestamp vía ILogger.log en el camino de éxito', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(usuarioRepo.create).mockResolvedValue(undefined);

      const before = Date.now();
      await useCase.execute(makeDto({ actor: { id: 'actor-root-uuid', isRoot: true } }));
      const after = Date.now();

      expect(logger.log).toHaveBeenCalledTimes(1);
      const [mensaje] = vi.mocked(logger.log).mock.calls[0];
      expect(mensaje).toContain('actor-root-uuid');
      expect(mensaje).toContain('nuevo-root@empresa.com');

      // Timestamp trazado: extrae el ISO string embebido en el mensaje y
      // verifica que cae dentro de la ventana de ejecución del test.
      const isoMatch = mensaje.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      expect(isoMatch).not.toBeNull();
      const timestamp = new Date(isoMatch![0]).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('NUNCA loguea el password en el mensaje de auditoría', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(usuarioRepo.create).mockResolvedValue(undefined);

      await useCase.execute(makeDto({ password: 'super-secreto-123' }));

      const [mensaje] = vi.mocked(logger.log).mock.calls[0];
      expect(mensaje).not.toContain('super-secreto-123');
    });

    it('la auditoría ocurre DESPUÉS de persistir (create ya se llamó cuando se loguea)', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      const ordenDeLlamadas: string[] = [];
      vi.mocked(usuarioRepo.create).mockImplementation(async () => {
        ordenDeLlamadas.push('create');
      });
      vi.mocked(logger.log).mockImplementation(() => {
        ordenDeLlamadas.push('log');
      });

      await useCase.execute(makeDto());

      expect(ordenDeLlamadas).toEqual(['create', 'log']);
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

    it('actor.isRoot=false → NO audita (auditoría es solo del camino de éxito)', async () => {
      await useCase.execute(makeDto({ actor: { id: 'admin-uuid', isRoot: false } }));

      expect(logger.log).not.toHaveBeenCalled();
    });

    it('la validación de actor.isRoot ocurre ANTES de cualquier I/O — defensa en profundidad real', async () => {
      // Aunque el repo esté armado para devolver un usuario existente, el rechazo
      // por actor.isRoot=false debe ganar SIEMPRE, sin depender del guard de presentación.
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(makeUsuarioExistente());

      const result = await useCase.execute(makeDto({ actor: { id: 'admin-uuid', isRoot: false } }));

      expect(result.getError()).toBeInstanceOf(RootRequeridoError);
    });
  });

  describe('guard post-commit: logger.log lanza durante la auditoría [Judgment Day Ronda 2 FIX 2]', () => {
    // Ref: el docblock del use case dice que la auditoría NUNCA debe decidir
    // el resultado de la operación — el root ya está persistido (paso 5,
    // usuarioRepo.create) ANTES de auditar (paso 6). Alineado con el patrón
    // establecido en PR4 (crear-observacion.use-case.ts/transicionar-estado.
    // use-case.ts): guard try/catch log-and-swallow sobre el side-effect
    // post-commit, para que un throw ahí no tumbe una respuesta que ya
    // debería ser 200/201.
    it('logger.log RECHAZA/lanza post-commit: execute() igual devuelve Result.ok del root ya creado, no relanza, create llamado 1 vez', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(usuarioRepo.create).mockResolvedValue(undefined);
      vi.mocked(logger.log).mockImplementation(() => {
        throw new Error('Logger de auditoría no disponible');
      });

      const result = await useCase.execute(makeDto());

      expect(result.isOk()).toBe(true);
      expect(result.getValue().email).toBe('nuevo-root@empresa.com');
      expect(result.getValue().isGlobalAdmin).toBe(true);
      // El root ya está persistido — el fallo de auditoría no debe re-invocar
      // ni revertir nada.
      expect(usuarioRepo.create).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('errores', () => {
    it('email duplicado → UsuarioConflictError', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(makeUsuarioExistente());

      const result = await useCase.execute(makeDto());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioConflictError);
    });

    it('email duplicado → NO llama a create ni a hashProvider', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(makeUsuarioExistente());

      await useCase.execute(makeDto());

      expect(hashProvider.hash).not.toHaveBeenCalled();
      expect(usuarioRepo.create).not.toHaveBeenCalled();
    });

    it('email duplicado → NO audita (auditoría es solo del camino de éxito)', async () => {
      vi.mocked(usuarioRepo.findByEmail).mockResolvedValue(makeUsuarioExistente());

      await useCase.execute(makeDto());

      expect(logger.log).not.toHaveBeenCalled();
    });
  });
});
