/**
 * 7.C.1 TEST — E2E provisioning real de tenant (PR-18 Batch 4)
 *
 * Verifica el flujo completo de CrearClienteUseCase con implementaciones REALES
 * (no mocks) contra Postgres local:
 *   1. PostgresAdminService crea la DB tenant.
 *   2. TenantMigrationRunnerAdapter aplica las migraciones.
 *   3. TenantSeederAdapter siembra los 5 catálogos base.
 *   4. PrismaClienteRepository persiste el cliente en master.
 *   5. PrismaUsuarioRepository persiste el admin inicial en master.
 *   6. Conecta a la nueva DB tenant y verifica los 5 catálogos.
 *   7. Corre el seed dos veces → counts no cambian (idempotencia).
 *
 * Configuración de DB:
 *   - MASTER: soporte_master_test (credenciales de test, throwaway).
 *   - TENANT: soporte_e2e_<timestamp> — nombre único, se dropea en afterAll.
 *
 * Teardown ROBUSTO (try/finally):
 *   - Dropea la DB tenant siempre (incluso si los tests fallan).
 *   - Elimina registros de master (usuario + cliente del test).
 *   - Cierra todos los pools/clientes antes de dropear la DB.
 *
 * Ref spec: [SPEC:clientes/Provisioning, Seed catálogos por tenant idempotente]
 * Ref spec: [SPEC:tickets-core/Nuevo tenant tiene catálogos pre-poblados]
 * Ref spec: [SPEC:equipos/Seeds de tipos_componente]
 * Tarea: 7.C.1 (Batch 4 — Parte C)
 */

import { Pool } from 'pg';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { MasterContext } from '../../shared/tenancy/master-context';
import { PostgresAdminService } from '../../shared/infrastructure/persistence/postgres-admin.service';
import { PostgresAdminAdapter } from './postgres-admin.adapter';
import { TenantMigrationRunnerAdapter } from './tenant-migration-runner.adapter';
import { TenantSeederAdapter } from './tenant-seeder.adapter';
import { PrismaClienteRepository } from './persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaRoleRepository } from '../../auth/infrastructure/persistence/prisma/prisma-role.repository';
import { Argon2HashProvider } from '../../auth/infrastructure/argon2-hash.provider';
import { CrearClienteUseCase } from '../application/use-cases/crear-cliente.use-case';

// ─── Conexión al master de test ───────────────────────────────────────────────
const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// DB tenant creada por este test — nombre único para evitar colisiones entre runs.
const E2E_DB_SUFFIX = `${Date.now()}`;
const E2E_DB_NAME = `soporte_e2e_${E2E_DB_SUFFIX}`;
const ADMIN_EMAIL = `admin_e2e_${E2E_DB_SUFFIX}@test.local`;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CrearClienteUseCase — e2e provisioning real (7.C.1)', () => {
  let prismaService: PrismaService;
  let masterContext: MasterContext;
  let adminService: PostgresAdminService;
  let adminAdapter: PostgresAdminAdapter;
  let migrationRunner: TenantMigrationRunnerAdapter;
  let seeder: TenantSeederAdapter;
  let useCase: CrearClienteUseCase;

  // ─── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Servicios de infraestructura reales
    prismaService = new PrismaService(MASTER_URL);
    masterContext = new MasterContext();
    adminService = new PostgresAdminService(MASTER_URL);
    adminAdapter = new PostgresAdminAdapter(adminService);
    migrationRunner = new TenantMigrationRunnerAdapter(MASTER_URL);
    seeder = new TenantSeederAdapter(MASTER_URL);

    // Repositorios reales (usan el master de test)
    const clienteRepo = new PrismaClienteRepository(prismaService);
    const usuarioRepo = new PrismaUsuarioRepository(prismaService, masterContext);
    const roleRepo = new PrismaRoleRepository(prismaService);
    const hashProvider = new Argon2HashProvider();

    useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      roleRepo,
      adminAdapter,
      migrationRunner,
      seeder,
      hashProvider,
    );
  }, 60_000); // permite tiempo para las migraciones

  // ─── Teardown ROBUSTO ──────────────────────────────────────────────────────
  // Siempre corre, aunque los tests fallen. Limpia DB tenant + registros master.

  afterAll(async () => {
    // 1. Limpiar registros master ANTES de cerrar PrismaService.
    //    Usamos SQL directo para respetar orden de FK:
    //    usuarios_roles → refresh_tokens → usuarios → clientes.
    const masterPool = new Pool({ connectionString: MASTER_URL });
    try {
      await masterPool.query(
        `DELETE FROM usuarios_roles WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = $1)`,
        [ADMIN_EMAIL],
      );
      await masterPool.query(
        `DELETE FROM refresh_tokens WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = $1)`,
        [ADMIN_EMAIL],
      );
      await masterPool.query(`DELETE FROM usuarios WHERE email = $1`, [ADMIN_EMAIL]);
      await masterPool.query(`DELETE FROM clientes WHERE db_name = $1`, [E2E_DB_NAME]);
    } catch (_err) {
      console.warn('[e2e teardown] Warning: no se pudieron limpiar registros master:', _err);
    } finally {
      await masterPool.end();
    }

    // 2. Cerrar todos los clientes Prisma (incluido el tenant client en caché) ANTES de DROP
    try {
      await prismaService.onModuleDestroy();
    } catch (_err) {
      console.warn('[e2e teardown] Warning: onModuleDestroy falló:', _err);
    }

    // 3. Dropear la DB tenant e2e
    try {
      await adminService.dropDatabase(E2E_DB_NAME);
    } catch (_err) {
      console.warn(`[e2e teardown] Warning: no se pudo dropear ${E2E_DB_NAME}:`, _err);
    }

    // 4. Cerrar pool del admin service
    try {
      await adminService.onModuleDestroy();
    } catch (_err) {
      console.warn('[e2e teardown] Warning: adminService.onModuleDestroy falló:', _err);
    }
  }, 30_000);

  // ─── Test 1: Provisioning completo ────────────────────────────────────────

  describe('Provisioning completo de nuevo tenant', () => {
    it('CrearClienteUseCase.execute crea la DB, aplica migraciones y siembra catálogos', async () => {
      const result = await useCase.execute({
        nombre: 'E2E Test Cliente',
        razonSocial: null,
        cuit: null,
        dbName: E2E_DB_NAME,
        adminEmail: ADMIN_EMAIL,
        adminNombre: 'Admin',
        adminApellido: 'E2E',
        adminPasswordPlaintext: 'test-password-e2e-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.getValue().dbName).toBe(E2E_DB_NAME);
      }
    }, 60_000); // migraciones pueden tardar

    it('la DB tenant existe en Postgres después del provisioning', async () => {
      const exists = await adminAdapter.databaseExists(E2E_DB_NAME);
      expect(exists).toBe(true);
    });
  });

  // ─── Test 2: Catálogos sembrados ──────────────────────────────────────────

  describe('Catálogos sembrados en la DB tenant nueva', () => {
    let tenantPool: Pool;

    beforeAll(() => {
      const tenantUrl = new URL(MASTER_URL);
      tenantUrl.pathname = `/${E2E_DB_NAME}`;
      tenantPool = new Pool({ connectionString: tenantUrl.toString() });
    });

    afterAll(async () => {
      await tenantPool.end();
    });

    it('estados: 10 registros base sembrados (incluye SUSPENDIDO y SIN_SOLUCION — Change A)', async () => {
      // Change tickets-maquina-estados-observaciones / PR1: seed actualizado de 8 → 10.
      const res = await tenantPool.query<{ count: string }>('SELECT COUNT(*) FROM estados');
      expect(parseInt(res.rows[0].count, 10)).toBe(10);
    });

    it('prioridades: 4 niveles sembrados', async () => {
      const res = await tenantPool.query<{ count: string }>('SELECT COUNT(*) FROM prioridades');
      expect(parseInt(res.rows[0].count, 10)).toBe(4);
    });

    it('tipos_ticket: 3 discriminadores sembrados (SOPORTE, COMPRAS, EDILICIA)', async () => {
      const res = await tenantPool.query<{ count: string }>('SELECT COUNT(*) FROM tipos_ticket');
      expect(parseInt(res.rows[0].count, 10)).toBe(3);
    });

    it('tipo_operacion: 9 tipos de evento sembrados (incluye EDICION, ELIMINACION, OBSERVACION)', async () => {
      const res = await tenantPool.query<{ count: string }>('SELECT COUNT(*) FROM tipo_operacion');
      expect(parseInt(res.rows[0].count, 10)).toBe(9);
    });

    it('tipos_componente: 10 tipos hardware sembrados', async () => {
      const res = await tenantPool.query<{ count: string }>(
        'SELECT COUNT(*) FROM tipos_componente',
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(10);
    });

    it('estados con codigos correctos del spec', async () => {
      const res = await tenantPool.query<{ codigo: string }>(
        'SELECT codigo FROM estados ORDER BY orden',
      );
      const codigos = res.rows.map((r) => r.codigo);
      expect(codigos).toContain('ABIERTO');
      expect(codigos).toContain('EN_PROGRESO');
      expect(codigos).toContain('CERRADO');
    });

    it('tipos_ticket con codigos correctos del spec', async () => {
      const res = await tenantPool.query<{ codigo: string }>('SELECT codigo FROM tipos_ticket');
      const codigos = res.rows.map((r) => r.codigo);
      expect(codigos).toContain('SOPORTE');
      expect(codigos).toContain('COMPRAS');
      expect(codigos).toContain('EDILICIA');
    });

    // ─── Idempotencia del seed ───────────────────────────────────────────────

    describe('Idempotencia del seed (Ref spec: Seed idempotente)', () => {
      it('correr el seed dos veces no duplica registros en estados', async () => {
        // Contar ANTES de la segunda ejecución
        const before = await tenantPool.query<{ count: string }>('SELECT COUNT(*) FROM estados');

        // Segunda ejecución del seed — usa el adapter directamente
        await seeder.seed(E2E_DB_NAME);

        const after = await tenantPool.query<{ count: string }>('SELECT COUNT(*) FROM estados');
        expect(after.rows[0].count).toBe(before.rows[0].count);
      });

      it('correr el seed dos veces no duplica registros en tipos_componente', async () => {
        const before = await tenantPool.query<{ count: string }>(
          'SELECT COUNT(*) FROM tipos_componente',
        );
        await seeder.seed(E2E_DB_NAME);
        const after = await tenantPool.query<{ count: string }>(
          'SELECT COUNT(*) FROM tipos_componente',
        );
        expect(after.rows[0].count).toBe(before.rows[0].count);
      });

      it('seed idempotente: todos los catálogos mantienen conteos', async () => {
        const countQuery = async (table: string) => {
          const r = await tenantPool.query<{ count: string }>(`SELECT COUNT(*) FROM ${table}`);
          return parseInt(r.rows[0].count, 10);
        };

        const before = {
          estados: await countQuery('estados'),
          prioridades: await countQuery('prioridades'),
          tipos_ticket: await countQuery('tipos_ticket'),
          tipo_operacion: await countQuery('tipo_operacion'),
          tipos_componente: await countQuery('tipos_componente'),
        };

        // Tercera ejecución del seed
        await seeder.seed(E2E_DB_NAME);

        const after = {
          estados: await countQuery('estados'),
          prioridades: await countQuery('prioridades'),
          tipos_ticket: await countQuery('tipos_ticket'),
          tipo_operacion: await countQuery('tipo_operacion'),
          tipos_componente: await countQuery('tipos_componente'),
        };

        expect(after.estados).toBe(before.estados);
        expect(after.prioridades).toBe(before.prioridades);
        expect(after.tipos_ticket).toBe(before.tipos_ticket);
        expect(after.tipo_operacion).toBe(before.tipo_operacion);
        expect(after.tipos_componente).toBe(before.tipos_componente);
      });
    });
  });

  // ─── Test 3: Registros master ─────────────────────────────────────────────

  describe('Registros en master después del provisioning', () => {
    it('cliente creado en master.clientes con el dbName correcto', async () => {
      const masterClient = prismaService.getMasterClient();
      const cliente = await masterClient.cliente.findFirst({
        where: { dbName: E2E_DB_NAME },
      });
      expect(cliente).not.toBeNull();
      expect(cliente?.activo).toBe(true);
      expect(cliente?.nombre).toBe('E2E Test Cliente');
    });

    it('usuario admin creado en master.usuarios con clienteId del cliente', async () => {
      const masterClient = prismaService.getMasterClient();
      const usuario = await masterClient.usuario.findFirst({
        where: { email: ADMIN_EMAIL },
        include: { usuariosRoles: { include: { rol: true } } },
      });
      expect(usuario).not.toBeNull();
      expect(usuario?.activo).toBe(true);

      // El admin tiene rol ADMIN asignado automáticamente (Batch 2 decision)
      const roles = usuario?.usuariosRoles.map((ur) => ur.rol.codigo) ?? [];
      expect(roles).toContain('ADMIN');
    });
  });
});
