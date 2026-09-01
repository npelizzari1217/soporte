/**
 * [UNIT] — Tests de `CrearClienteUseCase`: orquesta el alta completa de un
 * cliente (tenant) — R16 — consumiendo `ProvisionarTenantDatabaseUseCase`
 * (PR7) para el paso físico (createDatabase→migrate→seed) y agregando el
 * insert en `master.clientes` + la creación del admin inicial (usuario +
 * membresía ADMINISTRADOR).
 *
 * Todos los puertos (`IClienteRepository`, `IUsuarioRepository`,
 * `IMembresiaRepository`, `IRoleRepository`, `IHashProvider`,
 * `IPostgresAdminPort`) y `ProvisionarTenantDatabaseUseCase` se mockean —
 * sin Postgres real, sin subprocesos (T8.1).
 *
 * Contrato verificado:
 * - R16: revalida `actor.isGlobalAdmin` en el use case (defensa en
 *   profundidad — el `GlobalAdminGuard` ya lo bloquea en el controller).
 * - R16: resuelve el rol ADMINISTRADOR por código ANTES de provisionar
 *   (fail-fast, evita crear una DB física si el catálogo RBAC está roto).
 * - R16: valida que `adminEmail` no esté ya registrado ANTES de provisionar
 *   (fail-fast, evita crear una DB física si el alta del admin fallaría).
 * - Orden: id→dbName derivado → provision() → insert cliente → crear
 *   usuario admin + membresía ADMINISTRADOR (T8.1).
 * - R18: si falla la creación del admin/membresía DESPUÉS de insertar el
 *   cliente, MUST revertir el insert de clientes (`clienteRepo.delete`) Y
 *   dropear la DB física (`postgresAdmin.dropDatabase`), re-lanzando el
 *   error ORIGINAL (T8.2).
 *
 * Ref spec: sdd/auth-multitenancy/spec §R16, §R18
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tareas: T8.1, T8.2 (PR8)
 */
import { CrearClienteUseCase } from './crear-cliente.use-case';
import { ProvisionarTenantDatabaseUseCase } from './provisionar-tenant-database.use-case';
import type { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import type { IUsuarioRepository } from '../../../auth/domain/ports/i-usuario.repository';
import type { IMembresiaRepository } from '../../../auth/domain/ports/i-membresia.repository';
import type { IRoleRepository } from '../../../auth/domain/ports/i-role.repository';
import type { IHashProvider } from '../../../auth/domain/ports/i-hash.provider';
import type { IPostgresAdminPort } from '../../domain/ports/i-postgres-admin.port';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import {
  AdministradorRoleNotFoundError,
  AdminEmailYaRegistradoError,
  OnlyRootCanCreateClienteError,
} from '../../domain/errors/clientes.errors';
import { unstubbed } from '../../../testing/mocks';

const ADMIN_ROLE = RoleEntity.create({
  codigo: 'ADMINISTRADOR',
  nombre: 'Administrador',
  descripcion: null,
  permisos: [],
});

function makeClienteRepo(): IClienteRepository {
  return {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeUsuarioRepo(): IUsuarioRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMembresiaRepo(): IMembresiaRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    // CrearClienteUseCase solo crea la membresía ADMINISTRADOR inicial:
    // nunca lee ni muta membresías existentes.
    findActivasByUsuario: unstubbed('findActivasByUsuario'),
    findActivaByUsuarioYCliente: unstubbed('findActivaByUsuarioYCliente'),
    findActivasByCliente: unstubbed('findActivasByCliente'),
    findByUsuarioYCliente: unstubbed('findByUsuarioYCliente'),
    save: unstubbed('save'),
  };
}

function makeRoleRepo(): IRoleRepository {
  return {
    findByCodigo: vi.fn().mockResolvedValue(ADMIN_ROLE),
    // CrearClienteUseCase nunca lista el catálogo completo de roles.
    findAll: unstubbed('findAll'),
  };
}

function makeHashProvider(): IHashProvider {
  return {
    hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
    verify: vi.fn().mockResolvedValue(true),
  };
}

function makePostgresAdmin(): IPostgresAdminPort {
  return {
    createDatabase: vi.fn().mockResolvedValue(undefined),
    dropDatabase: vi.fn().mockResolvedValue(undefined),
    databaseExists: vi.fn().mockResolvedValue(false),
  };
}

function makeProvisionar(): ProvisionarTenantDatabaseUseCase {
  return {
    provision: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProvisionarTenantDatabaseUseCase;
}

const VALID_DTO = {
  nombre: 'ACME S.A.',
  razonSocial: null,
  cuit: null,
  adminEmail: 'admin@acme.test',
  adminNombre: 'Ada',
  adminApellido: 'Admin',
  adminPassword: 'SuperSecret!123',
  zonaHoraria: 'America/Argentina/Buenos_Aires',
};

const ROOT_ACTOR = { isGlobalAdmin: true };

describe('CrearClienteUseCase (T8.1, T8.2 — unit, mocks)', () => {
  it('[CRITICAL] actor no-root → Result.fail(OnlyRootCanCreateClienteError), NO provisiona NADA (R16 defensa en profundidad)', async () => {
    const clienteRepo = makeClienteRepo();
    const usuarioRepo = makeUsuarioRepo();
    const membresiaRepo = makeMembresiaRepo();
    const roleRepo = makeRoleRepo();
    const hashProvider = makeHashProvider();
    const postgresAdmin = makePostgresAdmin();
    const provisionar = makeProvisionar();
    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      membresiaRepo,
      roleRepo,
      hashProvider,
      postgresAdmin,
      provisionar,
    );

    const result = await useCase.execute(VALID_DTO, { isGlobalAdmin: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(OnlyRootCanCreateClienteError);
    expect(provisionar.provision).not.toHaveBeenCalled();
    expect(clienteRepo.save).not.toHaveBeenCalled();
  });

  it('[CRITICAL] rol ADMINISTRADOR inexistente → Result.fail(AdministradorRoleNotFoundError), NO provisiona (fail-fast)', async () => {
    const clienteRepo = makeClienteRepo();
    const usuarioRepo = makeUsuarioRepo();
    const membresiaRepo = makeMembresiaRepo();
    const roleRepo = makeRoleRepo();
    (roleRepo.findByCodigo as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const hashProvider = makeHashProvider();
    const postgresAdmin = makePostgresAdmin();
    const provisionar = makeProvisionar();
    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      membresiaRepo,
      roleRepo,
      hashProvider,
      postgresAdmin,
      provisionar,
    );

    const result = await useCase.execute(VALID_DTO, ROOT_ACTOR);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AdministradorRoleNotFoundError);
    expect(provisionar.provision).not.toHaveBeenCalled();
  });

  it('[CRITICAL] adminEmail ya registrado → Result.fail(AdminEmailYaRegistradoError), NO provisiona (fail-fast)', async () => {
    const clienteRepo = makeClienteRepo();
    const usuarioRepo = makeUsuarioRepo();
    (usuarioRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      UsuarioEntity.create({
        email: VALID_DTO.adminEmail,
        nombre: 'Ya',
        apellido: 'Existe',
        passwordHash: 'x',
        activo: true,
      }),
    );
    const membresiaRepo = makeMembresiaRepo();
    const roleRepo = makeRoleRepo();
    const hashProvider = makeHashProvider();
    const postgresAdmin = makePostgresAdmin();
    const provisionar = makeProvisionar();
    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      membresiaRepo,
      roleRepo,
      hashProvider,
      postgresAdmin,
      provisionar,
    );

    const result = await useCase.execute(VALID_DTO, ROOT_ACTOR);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AdminEmailYaRegistradoError);
    expect(provisionar.provision).not.toHaveBeenCalled();
  });

  it('[CRITICAL] happy path: provisiona, inserta cliente, crea admin+membresía ADMINISTRADOR, en orden (T8.1)', async () => {
    const clienteRepo = makeClienteRepo();
    const usuarioRepo = makeUsuarioRepo();
    const membresiaRepo = makeMembresiaRepo();
    const roleRepo = makeRoleRepo();
    const hashProvider = makeHashProvider();
    const postgresAdmin = makePostgresAdmin();
    const provisionar = makeProvisionar();
    const callOrder: string[] = [];
    (provisionar.provision as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('provision');
    });
    (clienteRepo.save as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('save-cliente');
    });
    (usuarioRepo.create as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('create-usuario');
    });
    (membresiaRepo.create as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('create-membresia');
    });

    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      membresiaRepo,
      roleRepo,
      hashProvider,
      postgresAdmin,
      provisionar,
    );

    const result = await useCase.execute(VALID_DTO, ROOT_ACTOR);

    expect(result.isOk()).toBe(true);
    const cliente = result.getValue();
    expect(cliente.nombre).toBe(VALID_DTO.nombre);
    expect(cliente.dbName).toMatch(/^soporte_[0-9a-f]{32}$/);
    expect(cliente.dbName).toContain(cliente.id.replace(/-/g, ''));
    // sdd/zona-horaria-por-tenant: la zona del DTO llega a ClienteEntity.create()
    // vía ZonaHoraria.crear() — el use case NUNCA defaultea a Buenos Aires.
    expect(cliente.zonaHoraria.valor).toBe(VALID_DTO.zonaHoraria);

    expect(callOrder).toEqual(['provision', 'save-cliente', 'create-usuario', 'create-membresia']);
    expect(provisionar.provision).toHaveBeenCalledWith(cliente.dbName);
    expect(hashProvider.hash).toHaveBeenCalledWith(VALID_DTO.adminPassword);

    const usuarioArg = (usuarioRepo.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as UsuarioEntity;
    expect(usuarioArg.email).toBe(VALID_DTO.adminEmail);
    expect(usuarioArg.isGlobalAdmin).toBe(false);
    expect(usuarioArg.passwordHash).toBe('$argon2id$hashed');

    const membresiaArg = (membresiaRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(membresiaArg.clienteId).toBe(cliente.id);
    expect(membresiaArg.usuarioId).toBe(usuarioArg.id);
    expect(membresiaArg.rolId).toBe(ADMIN_ROLE.id);
  });

  it('[CRITICAL] falla la creación del admin DESPUÉS de insertar el cliente → revierte insert (delete) + dropDatabase + re-lanza error ORIGINAL (R18, T8.2)', async () => {
    const clienteRepo = makeClienteRepo();
    const usuarioRepo = makeUsuarioRepo();
    const originalError = new Error('P2002: unique constraint (race condition)');
    (usuarioRepo.create as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);
    const membresiaRepo = makeMembresiaRepo();
    const roleRepo = makeRoleRepo();
    const hashProvider = makeHashProvider();
    const postgresAdmin = makePostgresAdmin();
    const provisionar = makeProvisionar();

    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      membresiaRepo,
      roleRepo,
      hashProvider,
      postgresAdmin,
      provisionar,
    );

    await expect(useCase.execute(VALID_DTO, ROOT_ACTOR)).rejects.toBe(originalError);

    expect(clienteRepo.save).toHaveBeenCalledTimes(1);
    const savedCliente = (clienteRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(clienteRepo.delete).toHaveBeenCalledWith(savedCliente.id);
    expect(postgresAdmin.dropDatabase).toHaveBeenCalledWith(savedCliente.dbName);
    expect(membresiaRepo.create).not.toHaveBeenCalled();
  });

  it('[CRITICAL] falla la creación de la membresía → revierte insert (delete) + dropDatabase + re-lanza error ORIGINAL (R18, T8.2)', async () => {
    const clienteRepo = makeClienteRepo();
    const usuarioRepo = makeUsuarioRepo();
    const membresiaRepo = makeMembresiaRepo();
    const originalError = new Error('constraint violation en membresias');
    (membresiaRepo.create as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);
    const roleRepo = makeRoleRepo();
    const hashProvider = makeHashProvider();
    const postgresAdmin = makePostgresAdmin();
    const provisionar = makeProvisionar();

    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      membresiaRepo,
      roleRepo,
      hashProvider,
      postgresAdmin,
      provisionar,
    );

    await expect(useCase.execute(VALID_DTO, ROOT_ACTOR)).rejects.toBe(originalError);

    const savedCliente = (clienteRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(clienteRepo.delete).toHaveBeenCalledWith(savedCliente.id);
    expect(postgresAdmin.dropDatabase).toHaveBeenCalledWith(savedCliente.dbName);
  });

  it('falla el provisioning (createDatabase/migrate/seed) → NO hay cliente insertado, NO se llama delete/dropDatabase extra (ya compensado dentro de provision())', async () => {
    const clienteRepo = makeClienteRepo();
    const usuarioRepo = makeUsuarioRepo();
    const membresiaRepo = makeMembresiaRepo();
    const roleRepo = makeRoleRepo();
    const hashProvider = makeHashProvider();
    const postgresAdmin = makePostgresAdmin();
    const provisionar = makeProvisionar();
    const originalError = new Error('P3009: migración falló');
    (provisionar.provision as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);

    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      membresiaRepo,
      roleRepo,
      hashProvider,
      postgresAdmin,
      provisionar,
    );

    await expect(useCase.execute(VALID_DTO, ROOT_ACTOR)).rejects.toBe(originalError);

    expect(clienteRepo.save).not.toHaveBeenCalled();
    expect(clienteRepo.delete).not.toHaveBeenCalled();
    // dropDatabase ya lo maneja ProvisionarTenantDatabaseUseCase internamente
    // (mockeado acá) — CrearClienteUseCase NO debe llamarlo de nuevo.
    expect(postgresAdmin.dropDatabase).not.toHaveBeenCalled();
  });
});
