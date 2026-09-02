/**
 * CrearClienteUseCase — orquesta el alta completa de un cliente (tenant),
 * exclusivo de ROOT (R16).
 *
 * Flujo, EN ORDEN (ADR-6, R16):
 * 1. Revalida `actor.isGlobalAdmin` (defensa en profundidad — el
 *    `GlobalAdminGuard` ya lo bloquea en el controller, T8.4).
 * 2. Resuelve el rol ADMINISTRADOR por código (fail-fast — sin tocar
 *    Postgres físico si el catálogo RBAC del propio master está roto).
 * 3. Valida que `adminEmail` no esté ya registrado (fail-fast — evita
 *    provisionar una DB física completa para luego fallar en el alta del
 *    admin por una violación de unicidad previsible).
 * 4. Genera `id` (UUIDv7) y deriva `dbName = 'soporte_' + id sin guiones`.
 * 5. `ProvisionarTenantDatabaseUseCase.provision(dbName)` — createDatabase→
 *    migrate→seed (PR7). Si falla, PR7 ya compensa con `dropDatabase` y
 *    re-lanza el error original — este use case NO inserta nada en
 *    `master.clientes` en ese caso (nada que revertir).
 * 6. Inserta el cliente en `master.clientes`.
 * 7. Crea el usuario admin (hash argon2id vía `IHashProvider`) + su
 *    membresía ADMINISTRADOR en el cliente recién creado.
 *
 * Rollback (R18) — si el paso 7 falla DESPUÉS de que el paso 6 ya insertó
 * el cliente: MUST revertir el insert (`clienteRepo.delete`) Y dropear la
 * DB física (`postgresAdmin.dropDatabase`), re-lanzando el error ORIGINAL
 * (mismo criterio que `ProvisionarTenantDatabaseUseCase`: el caller necesita
 * el error real para decidir cómo responder).
 *
 * Límite conocido: si `usuarioRepo.create` tiene éxito pero
 * `membresiaRepo.create` falla, el usuario admin queda huérfano (sin
 * membresía) — el rollback de este use case revierte `clientes` y la DB
 * física, pero `IUsuarioRepository` no expone `delete` (fuera de alcance de
 * PR8). Caso extremadamente improbable (ambas llamadas son secuenciales sin
 * validación de por medio); documentado, no resuelto acá.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R16, §R18
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tarea: T8.1, T8.2, T8.3 (PR8)
 */
import { uuidv7 } from 'uuidv7';
import { Result } from '../../../shared/domain/result';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IPostgresAdminPort } from '../../domain/ports/i-postgres-admin.port';
import {
  AdminEmailYaRegistradoError,
  AdministradorRoleNotFoundError,
  OnlyRootCanCreateClienteError,
} from '../../domain/errors/clientes.errors';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { MembresiaEntity } from '../../../auth/domain/entities/membresia.entity';
import { IUsuarioRepository } from '../../../auth/domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../../auth/domain/ports/i-membresia.repository';
import { IRoleRepository } from '../../../auth/domain/ports/i-role.repository';
import { IHashProvider } from '../../../auth/domain/ports/i-hash.provider';
import { ProvisionarTenantDatabaseUseCase } from './provisionar-tenant-database.use-case';

/** Código del rol asignado al admin inicial de todo cliente nuevo (R16). */
const ADMINISTRADOR_ROLE_CODIGO = 'ADMINISTRADOR';

/** DTO de entrada para el alta completa de un cliente (R16). */
export interface CrearClienteDto {
  nombre: string;
  razonSocial?: string | null;
  cuit?: string | null;
  adminEmail: string;
  adminNombre: string;
  adminApellido: string;
  adminPassword: string;
  /**
   * Zona horaria operativa del tenant nuevo (sdd/zona-horaria-por-tenant).
   * OBLIGATORIA — el use case NUNCA defaultea a Buenos Aires (decisión "Zona
   * de un cliente NUEVO: se exige explícita en el alta"); un candidato
   * inválido revienta acá vía `ZonaHoraria.crear()`, porque ya pasó por el
   * borde (`CreateClienteDto`) antes de llegar a este DTO interno.
   */
  zonaHoraria: string;
}

/** Actor que invoca el alta — solo se consume `isGlobalAdmin` (R16). */
export interface CrearClienteActor {
  isGlobalAdmin: boolean;
}

/** Errores esperados (Result.fail) del alta de cliente. */
export type CrearClienteError =
  OnlyRootCanCreateClienteError | AdministradorRoleNotFoundError | AdminEmailYaRegistradoError;

/** Deriva `db_name` de un UUIDv7: prefijo fijo + id sin guiones en minúsculas (R16). */
function deriveDbName(clienteId: string): string {
  return `soporte_${clienteId.replace(/-/g, '').toLowerCase()}`;
}

export class CrearClienteUseCase {
  /**
   * `dbNameGenerator` es inyectable (por defecto, `deriveDbName` — el
   * formato real de producción, `soporte_<uuid sin guiones>`) — mismo
   * criterio de testabilidad que `execFn` en `TenantMigrationRunnerAdapter`
   * y `createClient` en `TenantSeederAdapter` (PR7). Permite que los tests
   * de integración (T8.5) fuercen un `dbName` con sufijo `_test` SIN alterar
   * el `clienteId` (que sigue siendo un UUIDv7 real, válido para la columna
   * `Cliente.id @db.Uuid`) — la seguridad de "solo tocar DBs `_test`" no
   * puede depender de mockear `uuidv7` porque `clienteId` debe seguir siendo
   * un UUID válido para poder insertarse en `master.clientes`.
   */
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly roleRepo: IRoleRepository,
    private readonly hashProvider: IHashProvider,
    private readonly postgresAdmin: IPostgresAdminPort,
    private readonly provisionarTenantDatabase: ProvisionarTenantDatabaseUseCase,
    private readonly dbNameGenerator: (clienteId: string) => string = deriveDbName,
  ) {}

  async execute(
    dto: CrearClienteDto,
    actor: CrearClienteActor,
  ): Promise<Result<ClienteEntity, CrearClienteError>> {
    // 1. Defensa en profundidad (R16) — el GlobalAdminGuard ya bloquea esto
    // en el controller; se revalida acá por si el use case se invoca directo.
    if (!actor.isGlobalAdmin) {
      return Result.fail(new OnlyRootCanCreateClienteError());
    }

    // 2. Resolver el rol ADMINISTRADOR ANTES de tocar Postgres físico
    // (fail-fast — evita provisionar una DB tenant completa si el catálogo
    // RBAC del propio master está roto).
    const rolAdministrador = await this.roleRepo.findByCodigo(ADMINISTRADOR_ROLE_CODIGO);
    if (!rolAdministrador) {
      return Result.fail(new AdministradorRoleNotFoundError());
    }

    // 3. Validar que el email del admin no esté ya registrado (fail-fast —
    // evita provisionar una DB física para luego fallar previsiblemente en
    // el alta del admin por una violación de unicidad).
    const usuarioExistente = await this.usuarioRepo.findByEmail(dto.adminEmail);
    if (usuarioExistente) {
      return Result.fail(new AdminEmailYaRegistradoError(dto.adminEmail));
    }

    // 4. Generar id (UUIDv7) ANTES de construir la entidad, para poder
    // derivar dbName de él.
    const clienteId = uuidv7();
    const dbName = this.dbNameGenerator(clienteId);

    const cliente = ClienteEntity.create(
      {
        nombre: dto.nombre,
        razonSocial: dto.razonSocial ?? null,
        cuit: dto.cuit ?? null,
        dbName,
        activo: true,
        zonaHoraria: ZonaHoraria.crear(dto.zonaHoraria),
      },
      clienteId,
    );

    // 5. Provisionar la DB física del tenant (createDatabase→migrate→seed).
    // Si falla, ProvisionarTenantDatabaseUseCase ya compensa con
    // dropDatabase y re-lanza el error original (R18) — nada insertado en
    // master.clientes todavía, nada que revertir acá.
    await this.provisionarTenantDatabase.provision(dbName);

    // 6. Insertar el cliente en master.clientes.
    await this.clienteRepo.save(cliente);

    // 7. Crear el usuario admin + su membresía ADMINISTRADOR. Si cualquiera
    // de los dos pasos falla, revertir el insert de clientes Y dropear la
    // DB física (R18), re-lanzando el error ORIGINAL.
    try {
      const usuarioAdmin = UsuarioEntity.create({
        email: dto.adminEmail,
        nombre: dto.adminNombre,
        apellido: dto.adminApellido,
        passwordHash: await this.hashProvider.hash(dto.adminPassword),
        activo: true,
        isGlobalAdmin: false,
      });
      await this.usuarioRepo.create(usuarioAdmin);

      const membresiaAdmin = MembresiaEntity.create({
        usuarioId: usuarioAdmin.id,
        clienteId: cliente.id,
        rolId: rolAdministrador.id,
        activo: true,
      });
      await this.membresiaRepo.create(membresiaAdmin);
    } catch (error) {
      await this.clienteRepo.delete(cliente.id);
      await this.postgresAdmin.dropDatabase(dbName);
      throw error;
    }

    return Result.ok(cliente);
  }
}
