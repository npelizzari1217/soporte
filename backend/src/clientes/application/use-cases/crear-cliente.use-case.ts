import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IUsuarioRepository } from '../../../auth/domain/ports/i-usuario.repository';
import { IRoleRepository } from '../../../auth/domain/ports/i-role.repository';
import { IHashProvider } from '../../../auth/domain/ports/i-hash.provider';
import { ClienteConflictError } from '../../domain/errors/clientes.errors';
import { IPostgresAdminPort } from '../ports/i-postgres-admin.port';
import { ITenantMigrationRunner } from '../ports/i-tenant-migration-runner';
import { ITenantSeeder } from '../ports/i-tenant-seeder';

/**
 * CrearClienteDto — datos necesarios para provisionar un nuevo cliente/tenant.
 *
 * Incluye los datos del cliente y del usuario administrador inicial que
 * se crea automáticamente durante el provisioning.
 */
export interface CrearClienteDto {
  /** Nombre comercial del cliente. */
  nombre: string;
  /** Razón social legal (opcional). */
  razonSocial: string | null;
  /** CUIT sin guiones, 11 dígitos (opcional). */
  cuit: string | null;
  /** Nombre de la DB Postgres del tenant (único en el sistema). */
  dbName: string;
  /** Email del usuario administrador inicial. */
  adminEmail: string;
  /** Nombre del usuario administrador inicial. */
  adminNombre: string;
  /** Apellido del usuario administrador inicial. */
  adminApellido: string;
  /** Password en texto plano para el admin (será hasheado antes de persistir). */
  adminPasswordPlaintext: string;
}

/**
 * CrearClienteUseCase — provisioning completo de un nuevo cliente/tenant.
 *
 * Orquesta la secuencia completa de provisioning en orden estricto:
 *   1. Verificar unicidad del db_name (409 si ya existe)
 *   2. Crear la DB Postgres del tenant via PostgresAdminService
 *   3. Aplicar migraciones del schema tenant
 *   4. Sembrar los catálogos operativos (idempotente)
 *   5. Persistir el registro en master.clientes
 *   6. Crear el usuario administrador inicial en master.usuarios con rol ADMIN asignado
 *
 * Compensación (rollback) ante error intermedio:
 *   - Si cualquier paso DESPUÉS de createDatabase falla, se ejecuta
 *     dropDatabase(dbName) para limpiar el estado.
 *   - Estrategia de conexiones activas: los colaboradores (ITenantMigrationRunner
 *     e ITenantSeeder) DEBEN cerrar todas sus conexiones antes de retornar
 *     (sea con éxito o con error). Esto es un CONTRATO del puerto. Si la
 *     implementación no cumple esto, el DROP DATABASE fallará con "database is
 *     being accessed by other users". Ver IPostgresAdminPort.dropDatabase.
 *
 * Retorna:
 *   - Result.ok(cliente) si el provisioning completó con éxito.
 *   - Result.fail(ClienteConflictError) si ya existe un cliente con ese db_name.
 *   - Throws (no Result.fail) para errores de infraestructura en los pasos de
 *     provisioning (createDatabase, migrations, seed, saves). Estos son errores
 *     excepcionales, no errores de dominio esperados.
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo,
 *            Provisioning fallido dispara rollback compensatorio,
 *            Seed de catálogos por tenant es idempotente]
 * Tarea: 7.A.4
 */
export class CrearClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly roleRepo: IRoleRepository,
    private readonly adminPort: IPostgresAdminPort,
    private readonly migrationRunner: ITenantMigrationRunner,
    private readonly seeder: ITenantSeeder,
    private readonly hashProvider: IHashProvider,
  ) {}

  async execute(dto: CrearClienteDto): Promise<Result<ClienteEntity, ClienteConflictError>> {
    // ── Paso 0: Verificar unicidad del db_name ────────────────────────────────
    // Se hace ANTES del provisioning para evitar crear una DB y luego fallar por
    // un conflicto trivial. Esto es un error de dominio esperado → Result.fail.
    const existente = await this.clienteRepo.findByDbName(dto.dbName);
    if (existente) {
      return Result.fail(new ClienteConflictError(dto.dbName));
    }

    // ── Paso 1: Crear DB Postgres del tenant ──────────────────────────────────
    // Si este paso falla, la DB nunca fue creada → NO hay rollback necesario.
    // El error se propaga sin compensación.
    await this.adminPort.createDatabase(dto.dbName);

    // A partir de aquí, si cualquier paso falla → dropDatabase (compensación).
    try {
      // ── Paso 2: Aplicar migraciones del schema tenant ─────────────────────
      await this.migrationRunner.runMigrations(dto.dbName);

      // ── Paso 3: Sembrar catálogos operativos ──────────────────────────────
      // Idempotente: ON CONFLICT DO NOTHING en todas las tablas de catálogo.
      // El use case llama al seeder incondicionalmente — la idempotencia es
      // responsabilidad de la implementación del puerto (ITenantSeeder).
      await this.seeder.seed(dto.dbName);

      // ── Paso 4: Alta en master.clientes ───────────────────────────────────
      const cliente = ClienteEntity.create({
        nombre: dto.nombre,
        razonSocial: dto.razonSocial,
        cuit: dto.cuit,
        dbName: dto.dbName,
        activo: true,
      });
      await this.clienteRepo.save(cliente);

      // ── Paso 5: Crear usuario administrador inicial en master.usuarios ─────
      // El password se hashea ANTES de crear la entidad → la entidad nunca
      // contiene el plaintext en ningún momento de su ciclo de vida.
      const passwordHash = await this.hashProvider.hash(dto.adminPasswordPlaintext);

      // Resolver el rol ADMINISTRADOR por código (no por UUID hardcodeado).
      // El rol ADMINISTRADOR debe existir en master (sembrado en la migration
      // seed_rbac_4_roles). 'ADMIN' es el código legacy — soft-deleted por la
      // migration 20260629110000_remap_usuarios_roles; usarlo acá rompería el
      // provisioning una vez que findByCodigo filtra deletedAt (rbac-security-hardening).
      // Si no existe, es un error de configuración → throw (fallo excepcional,
      // no error de dominio esperado) → el try/catch ejecutará el rollback.
      const adminRole = await this.roleRepo.findByCodigo('ADMINISTRADOR');
      if (!adminRole) {
        throw new Error(
          '[Provisioning] Rol ADMINISTRADOR no encontrado en master. ' +
            'Verificá que la migration de seed RBAC (seed_rbac_4_roles) fue aplicada.',
        );
      }

      const adminUser = UsuarioEntity.create({
        email: dto.adminEmail,
        nombre: dto.adminNombre,
        apellido: dto.adminApellido,
        passwordHash,
        clienteId: cliente.id,
        activo: true,
        roles: [],
      });
      adminUser.addRol(adminRole);
      await this.usuarioRepo.save(adminUser);

      return Result.ok(cliente);
    } catch (err) {
      // ── Compensación: drop DB ──────────────────────────────────────────────
      // IMPORTANTE: dropDatabase solo tiene éxito si los colaboradores
      // (migrationRunner, seeder) cerraron sus conexiones antes de lanzar el error.
      // Ver contrato en IPostgresAdminPort y ITenantMigrationRunner/ITenantSeeder.
      await this.adminPort.dropDatabase(dto.dbName);

      // Re-throw el error original para que el caller vea qué paso falló.
      throw err;
    }
  }
}
