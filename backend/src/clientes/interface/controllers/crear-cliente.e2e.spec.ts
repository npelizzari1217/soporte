/**
 * crear-cliente.e2e.spec.ts — TDD RED phase (T8.5, PR8 — cierre de la Fase 1
 * backend).
 *
 * E2E real de punta a punta (HTTP → JwtAuthGuard → GlobalAdminGuard →
 * ClientesController → CrearClienteUseCase → Prisma REAL contra
 * `soporte_master_test` + provisioning REAL de una DB tenant física),
 * bootstrapeando `SharedModule` + `ClientesModule` con NestJS `TestingModule`
 * real (sin mocks de infra, salvo los 2 seams descriptos abajo).
 *
 * Cubre R16, R17, R18: alta completa de cliente (DB física creada, migrada,
 * sembrada + insert en master.clientes + admin/membresía ADMINISTRADOR) y
 * rollback real cuando falla un paso posterior a `createDatabase`.
 *
 * ── SEGURIDAD (instrucción explícita del dueño — CRÍTICO) ──────────────────
 * Este spec SOLO crea/borra bases de datos físicas cuyo nombre termina en
 * `_test` (prefijo `soporte_e2e_cliente_`). NUNCA toca `soporte_master`,
 * `soporte_master_test`, `soporte_tenant_test`, `soporte_e2e`, ni las bases
 * `soporte_019f...` de soporte1. Todas las DBs efímeras creadas se borran en
 * `afterEach`/`afterAll` (defensivo, `dropDatabase` es IF EXISTS).
 *
 * ── Seam 1: `dbNameGenerator` de `CrearClienteUseCase` ──────────────────────
 * El formato REAL de producción (R16: `db_name='soporte_'+id.sinGuiones`)
 * NUNCA termina en `_test` — un UUIDv7 sin guiones es 32 caracteres hex, y
 * "_test" no es hexadecimal. Para poder correr este e2e contra Postgres real
 * SIN violar la restricción de seguridad de arriba, se override el provider
 * `CrearClienteUseCase` del `TestingModule` inyectando un
 * `dbNameGenerator` que fuerza el sufijo `_test` — el `clienteId` (usado
 * para `master.clientes.id`, `@db.Uuid`) sigue siendo un UUIDv7 real e
 * inalterado; SOLO el nombre de la DB física cambia. Todo el resto de la
 * orquestación (createDatabase→migrate→seed→insert cliente→admin+membresía)
 * corre exactamente igual que en producción. Mismo criterio de testabilidad
 * que `execFn` (TenantMigrationRunnerAdapter) / `createClient`
 * (TenantSeederAdapter), PR7.
 *
 * ── Seam 2: `ToggleableMembresiaRepo` (solo para el test de rollback) ───────
 * Todos los pasos ANTERIORES a la creación de la membresía (createDatabase
 * real, migrate real, seed real, insert cliente real, insert usuario admin
 * real) corren SIN mocks. El único punto controlado es
 * `membresiaRepo.create()`, que se fuerza a fallar en UN test para poder
 * disparar de forma determinística el camino de rollback real de R18 — no
 * hay otra forma de forzar una falla de Postgres real de forma determinística
 * en ese paso específico sin este seam (los pasos previos — email duplicado,
 * rol ADMINISTRADOR inexistente — son validados ANTES de provisionar, R16
 * fail-fast, así que no pueden usarse para probar el rollback POST-insert).
 *
 * Ref spec: sdd/auth-multitenancy/spec §R16, §R17, §R18, §R19
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tarea: T8.5 (PR8)
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { ClientesModule } from '../../clientes.module';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';

import { CrearClienteUseCase } from '../../application/use-cases/crear-cliente.use-case';
import { ProvisionarTenantDatabaseUseCase } from '../../application/use-cases/provisionar-tenant-database.use-case';
import { CLIENTE_REPOSITORY, IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { POSTGRES_ADMIN_PORT, IPostgresAdminPort } from '../../domain/ports/i-postgres-admin.port';
import { USUARIO_REPOSITORY } from '../../../auth/domain/ports/i-usuario.repository';
import { IUsuarioRepository } from '../../../auth/domain/ports/i-usuario.repository';
import {
  MEMBRESIA_REPOSITORY,
  IMembresiaRepository,
  MembresiaResuelta,
} from '../../../auth/domain/ports/i-membresia.repository';
import { ROLE_REPOSITORY, IRoleRepository } from '../../../auth/domain/ports/i-role.repository';
import { HASH_PROVIDER, IHashProvider } from '../../../auth/domain/ports/i-hash.provider';
import {
  TOKEN_SERVICE,
  ITokenService,
  JwtPayload,
} from '../../../auth/domain/ports/i-token.service';
import { MembresiaEntity } from '../../../auth/domain/entities/membresia.entity';
import { PrismaMembresiaRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-membresia.repository';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Prefijo + sufijo `_test` OBLIGATORIO (ver nota de seguridad de cabecera). */
function ephemeralDbNameFor(clienteId: string): string {
  return `soporte_e2e_cliente_${clienteId.replace(/-/g, '').slice(0, 16)}_test`;
}

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function openTenantClient(
  dbName: string,
): Promise<{ client: InstanceType<typeof TenantPrismaClient>; pool: Pool }> {
  const pool = new Pool({ connectionString: buildTenantUrl(dbName) });
  const client = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
  return { client, pool };
}

/**
 * Wrapper de `IMembresiaRepository` que delega TODO a la implementación real
 * (Prisma) salvo `create()`, que puede forzarse a fallar vía `shouldFail`
 * (ver "Seam 2" en la cabecera del archivo).
 */
class ToggleableMembresiaRepo implements IMembresiaRepository {
  shouldFail = false;

  constructor(private readonly real: PrismaMembresiaRepository) {}

  findActivasByUsuario(usuarioId: string): Promise<MembresiaResuelta[]> {
    return this.real.findActivasByUsuario(usuarioId);
  }

  findActivaByUsuarioYCliente(
    usuarioId: string,
    clienteId: string,
  ): Promise<MembresiaResuelta | null> {
    return this.real.findActivaByUsuarioYCliente(usuarioId, clienteId);
  }

  async create(membresia: MembresiaEntity): Promise<void> {
    if (this.shouldFail) {
      throw new Error('[e2e-forced-failure] membresiaRepo.create() falló a propósito (T8.5)');
    }
    return this.real.create(membresia);
  }
}

type Headers = Record<string, string>;

async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

describe('Crear Cliente e2e — provisioning real (T8.5, R16-R19)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;
  let postgresAdmin: IPostgresAdminPort;
  let toggleableMembresiaRepo: ToggleableMembresiaRepo;
  const createdDbNames: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, ClientesModule],
    })
      // Seam 1: dbName siempre con sufijo `_test` (ver cabecera del archivo).
      .overrideProvider(CrearClienteUseCase)
      .useFactory({
        factory: (
          clienteRepo: IClienteRepository,
          usuarioRepo: IUsuarioRepository,
          membresiaRepo: IMembresiaRepository,
          roleRepo: IRoleRepository,
          hashProvider: IHashProvider,
          adminPort: IPostgresAdminPort,
          provisionar: ProvisionarTenantDatabaseUseCase,
        ) =>
          new CrearClienteUseCase(
            clienteRepo,
            usuarioRepo,
            membresiaRepo,
            roleRepo,
            hashProvider,
            adminPort,
            provisionar,
            ephemeralDbNameFor,
          ),
        inject: [
          CLIENTE_REPOSITORY,
          USUARIO_REPOSITORY,
          MEMBRESIA_REPOSITORY,
          ROLE_REPOSITORY,
          HASH_PROVIDER,
          POSTGRES_ADMIN_PORT,
          ProvisionarTenantDatabaseUseCase,
        ],
      })
      // Seam 2: permite forzar el fallo de membresiaRepo.create() en UN test
      // (rollback real, ver cabecera del archivo) sin mockear nada más.
      .overrideProvider(MEMBRESIA_REPOSITORY)
      .useFactory({
        factory: (prisma: PrismaService) =>
          new ToggleableMembresiaRepo(new PrismaMembresiaRepository(prisma)),
        inject: [PrismaService],
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    prismaService = moduleRef.get(PrismaService);
    masterClient = prismaService.getMasterClient();
    tokenService = moduleRef.get(TOKEN_SERVICE);
    postgresAdmin = moduleRef.get(POSTGRES_ADMIN_PORT);
    toggleableMembresiaRepo = moduleRef.get(MEMBRESIA_REPOSITORY);
  }, 60_000);

  afterAll(async () => {
    for (const dbName of createdDbNames) {
      await postgresAdmin.dropDatabase(dbName).catch(() => undefined);
    }
    try {
      await app?.close();
    } catch (_err) {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (_err) {
      /* no-op */
    }
  }, 60_000);

  beforeEach(async () => {
    toggleableMembresiaRepo.shouldFail = false;
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, roles_permisos, usuarios, clientes, roles, permisos RESTART IDENTITY CASCADE',
    );
    await masterClient.role.create({
      data: { codigo: 'ADMINISTRADOR', nombre: 'Administrador' },
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────

  function signRootToken(): string {
    const payload: JwtPayload = {
      sub: `e2e-root-${randomBytes(4).toString('hex')}`,
      cliente_id: null,
      rol: null,
      permisos: [],
      is_global_admin: true,
      cliente_nombre: null,
      membresias: [],
    };
    return tokenService.signJwt(payload);
  }

  function signNormalToken(): string {
    const payload: JwtPayload = {
      sub: `e2e-normal-${randomBytes(4).toString('hex')}`,
      cliente_id: null,
      rol: null,
      permisos: [],
      is_global_admin: false,
      cliente_nombre: null,
      membresias: [],
    };
    return tokenService.signJwt(payload);
  }

  function buildCreateClienteDto(suffix: string) {
    return {
      nombre: `E2E Cliente ${suffix}`,
      adminEmail: `admin_${suffix}@e2e-cliente.test`,
      adminNombre: 'Ada',
      adminApellido: 'Admin',
      adminPassword: 'SuperSecret!123',
    };
  }

  // ─── R14/R16 — Guard ─────────────────────────────────────────────────

  it('[CRITICAL] actor NO-root → 403 (GlobalAdminGuard real, R14/R16), sin crear nada', async () => {
    const { status } = await httpPost(
      `${baseUrl}/clientes`,
      buildCreateClienteDto('guard-denied'),
      bearer(signNormalToken()),
    );
    expect(status).toBe(403);
  });

  it('sin Bearer token → 401', async () => {
    const { status } = await httpPost(`${baseUrl}/clientes`, buildCreateClienteDto('no-auth'));
    expect(status).toBe(401);
  });

  // ─── R16-R19 — Provisioning real completo (happy path) ─────────────────

  it(
    '[CRITICAL] provisioning real completo: crea DB física, migra, siembra ' +
      '(estados=6, prioridades=4, tipos_ticket incl. MANTENIMIENTO), inserta cliente + admin/membresía (R16-R19)',
    async () => {
      const { status, data } = await httpPost<{
        id: string;
        nombre: string;
        dbName: string;
        activo: boolean;
      }>(`${baseUrl}/clientes`, buildCreateClienteDto('happy'), bearer(signRootToken()));

      expect(status).toBe(201);
      expect(data.dbName).toMatch(/_test$/);
      createdDbNames.push(data.dbName);

      // ── master.clientes + admin + membresía ADMINISTRADOR ──────────────
      const clienteRow = await masterClient.cliente.findUnique({ where: { id: data.id } });
      expect(clienteRow).not.toBeNull();
      expect(clienteRow!.dbName).toBe(data.dbName);
      expect(clienteRow!.activo).toBe(true);

      const usuarioRow = await masterClient.usuario.findUnique({
        where: { email: 'admin_happy@e2e-cliente.test' },
      });
      expect(usuarioRow).not.toBeNull();
      expect(usuarioRow!.isGlobalAdmin).toBe(false);

      const membresiaRow = await masterClient.membresia.findFirst({
        where: { usuarioId: usuarioRow!.id, clienteId: data.id },
        include: { rol: true },
      });
      expect(membresiaRow).not.toBeNull();
      expect(membresiaRow!.rol.codigo).toBe('ADMINISTRADOR');
      expect(membresiaRow!.activo).toBe(true);

      // ── DB física tenant: creada, migrada, sembrada (R19) ──────────────
      const { client: tenantClient, pool } = await openTenantClient(data.dbName);
      try {
        const estados = await tenantClient.estado.findMany({ orderBy: { orden: 'asc' } });
        expect(estados.map((e) => e.codigo)).toEqual([
          'NUEVO',
          'ASIGNADO',
          'EN_PROCESO',
          'RESUELTO',
          'CERRADO',
          'CANCELADO',
        ]);

        const prioridades = await tenantClient.prioridad.findMany({ orderBy: { orden: 'asc' } });
        expect(prioridades.map((p) => p.codigo)).toEqual(['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);

        const tiposTicket = await tenantClient.tipoTicket.findMany({ orderBy: { codigo: 'asc' } });
        expect(tiposTicket.map((t) => t.codigo).sort()).toEqual(
          ['SOPORTE', 'EDILICIA', 'MANTENIMIENTO'].sort(),
        );
      } finally {
        await tenantClient.$disconnect();
        await pool.end();
      }
    },
    60_000,
  );

  // ─── R18 — Rollback real ─────────────────────────────────────────────

  it(
    '[CRITICAL] falla la creación de la membresía DESPUÉS de provisionar+insertar cliente → ' +
      'rollback REAL (dropDatabase físico + delete de clientes), 500, R18',
    async () => {
      toggleableMembresiaRepo.shouldFail = true;
      const dropDatabaseSpy = vi.spyOn(postgresAdmin, 'dropDatabase');

      const { status } = await httpPost(
        `${baseUrl}/clientes`,
        buildCreateClienteDto('rollback'),
        bearer(signRootToken()),
      );

      expect(status).toBe(500);

      // dropDatabase REAL fue invocado con la DB física que se había creado
      // (capturamos el dbName real desde la llamada, ya que el response 500
      // no lo expone).
      expect(dropDatabaseSpy).toHaveBeenCalledTimes(1);
      const droppedDbName = dropDatabaseSpy.mock.calls[0][0];
      expect(droppedDbName).toMatch(/_test$/);
      await expect(postgresAdmin.databaseExists(droppedDbName)).resolves.toBe(false);
      dropDatabaseSpy.mockRestore();

      // El cliente NO debe quedar en master.clientes (rollback del insert).
      const clienteRow = await masterClient.cliente.findFirst({
        where: { nombre: 'E2E Cliente rollback' },
      });
      expect(clienteRow).toBeNull();
      expect(await masterClient.cliente.count()).toBe(0);

      // El usuario admin SÍ se creó (usuarioRepo.create() corrió antes de la
      // falla) — límite conocido documentado en CrearClienteUseCase: queda
      // huérfano (sin membresía). Se verifica acá que el comportamiento es
      // el documentado, no un olvido.
      const usuarioRow = await masterClient.usuario.findUnique({
        where: { email: 'admin_rollback@e2e-cliente.test' },
      });
      expect(usuarioRow).not.toBeNull();
      const membresiaRow = await masterClient.membresia.findFirst({
        where: { usuarioId: usuarioRow!.id },
      });
      expect(membresiaRow).toBeNull();
    },
    60_000,
  );

  // ─── Sanity ──────────────────────────────────────────────────────────

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test', () => {
    expect(MASTER_URL).toMatch(/_test$/);
  });
});
