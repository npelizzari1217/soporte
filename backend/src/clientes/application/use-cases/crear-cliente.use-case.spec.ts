/**
 * 7.A.3 TEST — CrearClienteUseCase (provisioning completo)
 *
 * Unit test con mocks de todos los colaboradores de infraestructura.
 * NO requiere Postgres real ni red (eso es el test e2e 7.C).
 *
 * Cubre:
 * - Orden ESTRICTO: createDatabase → runMigrations → seed → save(cliente) → save(adminUser)
 * - Fallo en "createDatabase" → NO rollback (DB nunca creada), error propagado
 * - Fallo en "runMigrations" → dropDatabase (rollback), NO save(cliente), NO save(adminUser)
 * - Fallo en "seed" → dropDatabase (rollback), NO save(cliente), NO save(adminUser)
 * - Fallo en "save(cliente)" → dropDatabase (rollback), NO save(adminUser)
 * - Fallo en "save(adminUser)" → dropDatabase (rollback)
 * - Idempotencia del seed: el use case llama al seeder incondicionalmente
 *   (el seeder maneja la idempotencia internamente con ON CONFLICT DO NOTHING)
 * - Admin inicial creado en master.usuarios con clienteId del cliente recién creado
 * - Password del admin hasheada (nunca plaintext en la entidad)
 * - db_name ya existe → Result.fail(ClienteConflictError) sin iniciar provisioning
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo, Rollback compensatorio, Seed idempotente]
 * Tarea: 7.A.3
 */

import { CrearClienteUseCase, CrearClienteDto } from './crear-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IUsuarioRepository } from '../../../auth/domain/ports/i-usuario.repository';
import { IRoleRepository } from '../../../auth/domain/ports/i-role.repository';
import { IPostgresAdminPort } from '../ports/i-postgres-admin.port';
import { ITenantMigrationRunner } from '../ports/i-tenant-migration-runner';
import { ITenantSeeder } from '../ports/i-tenant-seeder';
import { IHashProvider } from '../../../auth/domain/ports/i-hash.provider';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { ClienteConflictError } from '../../domain/errors/clientes.errors';

// ─── Factories de mocks ───────────────────────────────────────────────────────

const makeClienteRepo = (): vi.Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn().mockResolvedValue(null), // default: no conflict
  findAll: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn(),
});

const makeUsuarioRepo = (): vi.Mocked<IUsuarioRepository> => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  findByClienteId: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
});

const ADMIN_ROLE_ID = 'a0000000-0000-4000-a000-000000000001';

const makeRoleRepo = (): vi.Mocked<IRoleRepository> => ({
  findByCodigo: vi.fn().mockResolvedValue(
    RoleEntity.create(
      {
        codigo: 'ADMINISTRADOR',
        nombre: 'Administrador',
        descripcion: 'Acceso total',
        permisos: [],
      },
      ADMIN_ROLE_ID,
    ),
  ),
  findWithPermisos: vi.fn(),
});

const makeAdminPort = (): vi.Mocked<IPostgresAdminPort> => ({
  createDatabase: vi.fn().mockResolvedValue(undefined),
  dropDatabase: vi.fn().mockResolvedValue(undefined),
  databaseExists: vi.fn().mockResolvedValue(false),
});

const makeMigrationRunner = (): vi.Mocked<ITenantMigrationRunner> => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
});

const makeSeeder = (): vi.Mocked<ITenantSeeder> => ({
  seed: vi.fn().mockResolvedValue(undefined),
});

const makeHashProvider = (): vi.Mocked<IHashProvider> => ({
  hash: vi.fn().mockResolvedValue('$argon2id$hashed_password'),
  verify: vi.fn(),
});

// ─── DTO de prueba ────────────────────────────────────────────────────────────

const validDto: CrearClienteDto = {
  nombre: 'Acme Corp',
  razonSocial: 'Acme S.A.',
  cuit: '20123456789',
  dbName: 'tenant_acme',
  adminEmail: 'admin@acme.com',
  adminNombre: 'Admin',
  adminApellido: 'Acme',
  adminPasswordPlaintext: 'Secret123!',
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CrearClienteUseCase (provisioning completo)', () => {
  let useCase: CrearClienteUseCase;
  let clienteRepo: vi.Mocked<IClienteRepository>;
  let usuarioRepo: vi.Mocked<IUsuarioRepository>;
  let roleRepo: vi.Mocked<IRoleRepository>;
  let adminPort: vi.Mocked<IPostgresAdminPort>;
  let migrationRunner: vi.Mocked<ITenantMigrationRunner>;
  let seeder: vi.Mocked<ITenantSeeder>;
  let hashProvider: vi.Mocked<IHashProvider>;

  beforeEach(() => {
    clienteRepo = makeClienteRepo();
    usuarioRepo = makeUsuarioRepo();
    roleRepo = makeRoleRepo();
    adminPort = makeAdminPort();
    migrationRunner = makeMigrationRunner();
    seeder = makeSeeder();
    hashProvider = makeHashProvider();

    useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      roleRepo,
      adminPort,
      migrationRunner,
      seeder,
      hashProvider,
    );
  });

  // ─── Escenario: db_name ya existe → conflicto 409 ──────────────────────────

  describe('Escenario: db_name ya existe → ClienteConflictError', () => {
    beforeEach(() => {
      const existente = ClienteEntity.create({
        nombre: 'Existing Corp',
        razonSocial: null,
        cuit: null,
        dbName: validDto.dbName,
        activo: true,
      });
      clienteRepo.findByDbName.mockResolvedValue(existente);
    });

    it('retorna Result.fail(ClienteConflictError)', async () => {
      const result = await useCase.execute(validDto);
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteConflictError);
    });

    it('el error incluye el db_name conflictivo en el mensaje', async () => {
      const result = await useCase.execute(validDto);
      expect(result.getError().message).toContain(validDto.dbName);
    });

    it('NO llama a createDatabase cuando hay conflicto', async () => {
      await useCase.execute(validDto);
      expect(adminPort.createDatabase).not.toHaveBeenCalled();
    });

    it('NO llama a migrationRunner, seeder, ni repos cuando hay conflicto', async () => {
      await useCase.execute(validDto);
      expect(migrationRunner.runMigrations).not.toHaveBeenCalled();
      expect(seeder.seed).not.toHaveBeenCalled();
      expect(clienteRepo.save).not.toHaveBeenCalled();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Escenario: Provisioning exitoso → happy path ──────────────────────────

  describe('Escenario: Provisioning exitoso', () => {
    it('ejecuta los pasos en orden ESTRICTO: createDatabase → runMigrations → seed → save:cliente → save:admin', async () => {
      const callOrder: string[] = [];
      adminPort.createDatabase.mockImplementation(async () => {
        callOrder.push('createDatabase');
      });
      migrationRunner.runMigrations.mockImplementation(async () => {
        callOrder.push('runMigrations');
      });
      seeder.seed.mockImplementation(async () => {
        callOrder.push('seed');
      });
      clienteRepo.save.mockImplementation(async () => {
        callOrder.push('save:cliente');
      });
      usuarioRepo.save.mockImplementation(async () => {
        callOrder.push('save:admin');
      });

      await useCase.execute(validDto);

      expect(callOrder).toEqual([
        'createDatabase',
        'runMigrations',
        'seed',
        'save:cliente',
        'save:admin',
      ]);
    });

    it('retorna Result.ok con la entidad cliente creada', async () => {
      const result = await useCase.execute(validDto);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(ClienteEntity);
    });

    it('el cliente tiene activo=true y el dbName del DTO', async () => {
      const result = await useCase.execute(validDto);
      const cliente = result.getValue();
      expect(cliente.activo).toBe(true);
      expect(cliente.dbName).toBe(validDto.dbName);
      expect(cliente.nombre).toBe(validDto.nombre);
    });

    it('llama a createDatabase con el dbName del DTO', async () => {
      await useCase.execute(validDto);
      expect(adminPort.createDatabase).toHaveBeenCalledWith(validDto.dbName);
    });

    it('llama a runMigrations con el dbName del DTO', async () => {
      await useCase.execute(validDto);
      expect(migrationRunner.runMigrations).toHaveBeenCalledWith(validDto.dbName);
    });

    it('llama a seeder.seed con el dbName del DTO', async () => {
      await useCase.execute(validDto);
      expect(seeder.seed).toHaveBeenCalledWith(validDto.dbName);
    });

    it('el usuario admin se guarda en master.usuarios con clienteId del cliente creado', async () => {
      const result = await useCase.execute(validDto);
      const clienteId = result.getValue().id;

      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
      const [savedAdmin] = usuarioRepo.save.mock.calls[0];
      expect(savedAdmin.clienteId).toBe(clienteId);
    });

    it('el usuario admin tiene el email y nombre del DTO', async () => {
      await useCase.execute(validDto);
      const [savedAdmin] = usuarioRepo.save.mock.calls[0];
      expect(savedAdmin.email).toBe(validDto.adminEmail);
      expect(savedAdmin.nombre).toBe(validDto.adminNombre);
      expect(savedAdmin.apellido).toBe(validDto.adminApellido);
    });

    it('el usuario admin tiene activo=true', async () => {
      await useCase.execute(validDto);
      const [savedAdmin] = usuarioRepo.save.mock.calls[0];
      expect(savedAdmin.activo).toBe(true);
    });

    it('el password del admin está hasheado (nunca el plaintext)', async () => {
      await useCase.execute(validDto);

      // hashProvider.hash fue llamado con el plaintext
      expect(hashProvider.hash).toHaveBeenCalledWith(validDto.adminPasswordPlaintext);

      // La entidad guardada tiene el hash, no el plaintext
      const [savedAdmin] = usuarioRepo.save.mock.calls[0];
      expect(savedAdmin.passwordHash).not.toBe(validDto.adminPasswordPlaintext);
      expect(savedAdmin.passwordHash).toBe('$argon2id$hashed_password');
    });

    it('el usuario admin inicial se crea con el rol ADMINISTRADOR asignado (tenant inutilizable sin él)', async () => {
      // [SPEC:clientes/Provisioning de tenant nuevo]
      // El usuario administrador inicial DEBE recibir el rol ADMINISTRADOR automáticamente
      // durante el provisioning. Sin este rol, el tenant queda inutilizable
      // (el admin no podría autenticarse con permisos operativos).
      // Regresión rbac-security-hardening: 'ADMIN' es un código legacy soft-deleted
      // (migration 20260629110000_remap_usuarios_roles) — resolverlo rompería el
      // provisioning una vez que findByCodigo filtra deletedAt.
      await useCase.execute(validDto);
      const [savedAdmin] = usuarioRepo.save.mock.calls[0];
      expect(savedAdmin.roles).toHaveLength(1);
      expect(savedAdmin.roles[0].codigo).toBe('ADMINISTRADOR');
      expect(roleRepo.findByCodigo).toHaveBeenCalledWith('ADMINISTRADOR');
    });
  });

  // ─── Escenario: Seed idempotente ───────────────────────────────────────────

  describe('Escenario: Seed idempotente', () => {
    it('el use case llama a seeder.seed() incondicionalmente (el seeder maneja la idempotencia)', async () => {
      // El seeder resuelve aunque la DB ya tenga seeds (ON CONFLICT DO NOTHING)
      seeder.seed.mockResolvedValue(undefined);

      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(seeder.seed).toHaveBeenCalledTimes(1);
      expect(seeder.seed).toHaveBeenCalledWith(validDto.dbName);
    });

    it('NO falla si seeder.seed() se llama sobre una DB ya sembrada', async () => {
      // Simula la idempotencia: seed() resuelve sin error incluso con datos existentes
      seeder.seed.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      // Primera llamada (provisioning del cliente)
      const result = await useCase.execute(validDto);
      expect(result.isOk()).toBe(true);

      // Re-configurar para segunda llamada: nuevo cliente diferente (mismo seeder)
      clienteRepo.findByDbName.mockResolvedValue(null);
      clienteRepo.save.mockResolvedValue(undefined);
      usuarioRepo.save.mockResolvedValue(undefined);
      adminPort.createDatabase.mockResolvedValue(undefined);
      migrationRunner.runMigrations.mockResolvedValue(undefined);

      const dto2: CrearClienteDto = {
        ...validDto,
        dbName: 'tenant_beta',
        adminEmail: 'admin@beta.com',
      };
      const result2 = await useCase.execute(dto2);
      expect(result2.isOk()).toBe(true);
      // seeder.seed fue llamado en total 2 veces (una por provisioning)
      expect(seeder.seed).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Escenario: Rollback — createDatabase falla ────────────────────────────

  describe('Escenario: Rollback compensatorio — createDatabase falla', () => {
    const dbError = new Error('could not create database');

    beforeEach(() => {
      adminPort.createDatabase.mockRejectedValue(dbError);
    });

    it('NO llama a dropDatabase (la DB nunca fue creada)', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow(dbError.message);
      expect(adminPort.dropDatabase).not.toHaveBeenCalled();
    });

    it('NO llama a runMigrations, seed, save:cliente, ni save:admin', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(migrationRunner.runMigrations).not.toHaveBeenCalled();
      expect(seeder.seed).not.toHaveBeenCalled();
      expect(clienteRepo.save).not.toHaveBeenCalled();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('propaga el error original', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow('could not create database');
    });
  });

  // ─── Escenario: Rollback — runMigrations falla ─────────────────────────────

  describe('Escenario: Rollback compensatorio — runMigrations falla', () => {
    const migrationError = new Error('migration failed: column already exists');

    beforeEach(() => {
      migrationRunner.runMigrations.mockRejectedValue(migrationError);
    });

    it('llama a dropDatabase(dbName) como compensación', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(adminPort.dropDatabase).toHaveBeenCalledWith(validDto.dbName);
    });

    it('NO llama a seed, save:cliente, ni save:admin', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(seeder.seed).not.toHaveBeenCalled();
      expect(clienteRepo.save).not.toHaveBeenCalled();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('propaga el error original después del rollback', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow(migrationError.message);
    });
  });

  // ─── Escenario: Rollback — seed falla ─────────────────────────────────────

  describe('Escenario: Rollback compensatorio — seed falla', () => {
    const seedError = new Error('seed failed: connection refused');

    beforeEach(() => {
      seeder.seed.mockRejectedValue(seedError);
    });

    it('llama a dropDatabase(dbName) como compensación', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(adminPort.dropDatabase).toHaveBeenCalledWith(validDto.dbName);
    });

    it('NO hace alta en master.clientes', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(clienteRepo.save).not.toHaveBeenCalled();
    });

    it('NO crea usuario admin en master.usuarios', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('propaga el error original después del rollback', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow(seedError.message);
    });
  });

  // ─── Escenario: Rollback — save(cliente) falla ─────────────────────────────

  describe('Escenario: Rollback compensatorio — save(cliente) falla', () => {
    const saveError = new Error('unique constraint violation: db_name');

    beforeEach(() => {
      clienteRepo.save.mockRejectedValue(saveError);
    });

    it('llama a dropDatabase(dbName) como compensación', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(adminPort.dropDatabase).toHaveBeenCalledWith(validDto.dbName);
    });

    it('NO guarda el usuario admin si el cliente no se persistió', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('propaga el error original después del rollback', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow(saveError.message);
    });
  });

  // ─── Escenario: Rollback — save(adminUser) falla ───────────────────────────

  describe('Escenario: Rollback compensatorio — save(adminUser) falla', () => {
    const adminError = new Error('failed to create admin user');

    beforeEach(() => {
      usuarioRepo.save.mockRejectedValue(adminError);
    });

    it('llama a dropDatabase(dbName) como compensación', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow();
      expect(adminPort.dropDatabase).toHaveBeenCalledWith(validDto.dbName);
    });

    it('propaga el error original después del rollback', async () => {
      await expect(useCase.execute(validDto)).rejects.toThrow(adminError.message);
    });
  });
});
