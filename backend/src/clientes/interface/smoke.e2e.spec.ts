/**
 * 7.C.2 TEST — Smoke e2e del flujo completo (PR-18 Batch 4)
 *
 * Bootstrapea la app NestJS completa y verifica el flujo end-to-end:
 *   1. Login (JWT válido) → 200
 *   2. Crear ticket SOPORTE → 201
 *   3. Transicionar estado (ABIERTO → EN_PROGRESO) → 200
 *   4. Verificar operaciones_ticket en el timeline → 2 entradas CAMBIO_ESTADO
 *   5. Solicitud con cliente inactivo (mid-sesión) → 403 (TenantGuard)
 *   6. Request sin Bearer token → 401 (JwtAuthGuard)
 *
 * Setup:
 *   - Provisiona un tenant real (CrearClienteUseCase) en beforeAll.
 *   - Bootstrapea el app NestJS con el master de test.
 *   - Usa Node.js built-in fetch (disponible desde Node 18, usado en Node 22).
 *     (supertest y axios no están disponibles en el entorno de sandbox)
 *
 * Teardown ROBUSTO:
 *   - Cierra la app NestJS.
 *   - Dropea la DB tenant.
 *   - Limpia registros master (usuario + cliente del test).
 *
 * Ref spec: [SPEC:auth-rbac/Login exitoso]; [SPEC:tickets-core/requirements]
 * Ref spec: [SPEC:clientes/Suspensión de tenant]
 * Tarea: 7.C.2 (Batch 4 — Parte D)
 */

import { Pool } from 'pg';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';

// Servicios de infraestructura para el provisioning (sin NestJS DI)
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { MasterContext } from '../../shared/tenancy/master-context';
import { PostgresAdminService } from '../../shared/infrastructure/persistence/postgres-admin.service';
import { PostgresAdminAdapter } from '../infrastructure/postgres-admin.adapter';
import { TenantMigrationRunnerAdapter } from '../infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaRoleRepository } from '../../auth/infrastructure/persistence/prisma/prisma-role.repository';
import { Argon2HashProvider } from '../../auth/infrastructure/argon2-hash.provider';
import { CrearClienteUseCase } from '../application/use-cases/crear-cliente.use-case';

// ─── Helpers HTTP (Node.js built-in fetch, disponible en Node 18+) ───────────

type FetchHeaders = Record<string, string>;

async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  headers: FetchHeaders = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpPatch<T = unknown>(
  url: string,
  body: unknown,
  headers: FetchHeaders = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpGet<T = unknown>(
  url: string,
  headers: FetchHeaders = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

// ─── Configuración de DB ──────────────────────────────────────────────────────
const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// DB tenant e2e — nombre único para evitar colisiones con otras suites.
const SMOKE_SUFFIX = `smoke_${Date.now()}`;
const SMOKE_DB_NAME = `soporte_e2e_${SMOKE_SUFFIX}`;
const SMOKE_ADMIN_EMAIL = `admin_${SMOKE_SUFFIX}@test.local`;
const SMOKE_ADMIN_PASSWORD = 'SmokeTest-123!';

// UUIDs deterministas del seed (PR-09 + PR-17a) — estables cross-env
const TIPO_TICKET_SOPORTE_ID = 'e0000000-0000-4000-e000-000000000001';
const PRIORIDAD_MEDIA_ID = 'd0000000-0000-4000-d000-000000000002';
// CAMBIO_ESTADO: f0000000-0000-4000-f000-000000000001 (tenant-seed.ts)
const TIPO_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Smoke E2E — flujo completo (7.C.2)', () => {
  let nestApp: INestApplication;
  let baseUrl: string;
  let adminService: PostgresAdminService;
  let prismaService: PrismaService;
  let adminUserId: string;
  let clienteId: string;

  // ─── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Asegurar que DATABASE_URL_MASTER apunta al master de test ANTES de que
    // NestJS inicialice los módulos (SharedModule lee esta var en useFactory).
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    // 1. Provisionar el tenant de test (usando impl reales, sin NestJS)
    prismaService = new PrismaService(MASTER_URL);
    const masterContext = new MasterContext();
    adminService = new PostgresAdminService(MASTER_URL);
    const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_URL);
    const seeder = new TenantSeederAdapter(MASTER_URL);
    const clienteRepo = new PrismaClienteRepository(prismaService);
    const usuarioRepo = new PrismaUsuarioRepository(prismaService, masterContext);
    const roleRepo = new PrismaRoleRepository(prismaService);
    const hashProvider = new Argon2HashProvider();

    const useCase = new CrearClienteUseCase(
      clienteRepo,
      usuarioRepo,
      roleRepo,
      new PostgresAdminAdapter(adminService),
      migrationRunner,
      seeder,
      hashProvider,
    );

    const result = await useCase.execute({
      nombre: 'Smoke Test Cliente',
      razonSocial: null,
      cuit: null,
      dbName: SMOKE_DB_NAME,
      adminEmail: SMOKE_ADMIN_EMAIL,
      adminNombre: 'Admin',
      adminApellido: 'Smoke',
      adminPasswordPlaintext: SMOKE_ADMIN_PASSWORD,
    });

    if (!result.isOk()) {
      throw new Error('[smoke setup] Provisioning falló');
    }
    clienteId = result.getValue().id;

    // Obtener el ID del admin user creado durante provisioning
    const adminUserRow = await prismaService.getMasterClient().usuario.findFirst({
      where: { email: SMOKE_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!adminUserRow) throw new Error('[smoke setup] Admin user no encontrado en master');
    adminUserId = adminUserRow.id;

    // 2. Bootstrapear el app NestJS (lee DATABASE_URL_MASTER del entorno)
    const { AppModule } = await import('../../app.module');
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    nestApp = moduleRef.createNestApplication();
    await nestApp.init();
    await nestApp.listen(0); // Puerto aleatorio

    const port = (nestApp.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 120_000); // Tiempo para provisioning + app bootstrap

  // ─── Teardown ROBUSTO ──────────────────────────────────────────────────────

  afterAll(async () => {
    // 1. Cerrar app NestJS. Dispara onModuleDestroy() en todos los módulos.
    //    PrismaService.onModuleDestroy() ahora llama pool.end() explícitamente
    //    en los pg.Pool de master y todos los tenants, garantizando que todas
    //    las conexiones TCP estén cerradas ANTES de que lleguemos al DROP.
    try {
      await nestApp?.close();
    } catch (_err) {
      /* no-op */
    }

    // 2. Limpiar registros master en orden FK (antes de dropear DB)
    const masterPool = new Pool({ connectionString: MASTER_URL });
    try {
      await masterPool.query(
        `DELETE FROM usuarios_roles WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = $1)`,
        [SMOKE_ADMIN_EMAIL],
      );
      await masterPool.query(
        `DELETE FROM refresh_tokens WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = $1)`,
        [SMOKE_ADMIN_EMAIL],
      );
      await masterPool.query(`DELETE FROM usuarios WHERE email = $1`, [SMOKE_ADMIN_EMAIL]);
      await masterPool.query(`DELETE FROM clientes WHERE db_name = $1`, [SMOKE_DB_NAME]);
    } catch (_err) {
      console.warn('[smoke teardown] Warning: limpieza master:', _err);
    } finally {
      await masterPool.end();
    }

    // 3. Cerrar PrismaService de provisioning (libera conexión al master)
    try {
      await prismaService?.onModuleDestroy();
    } catch (_err) {
      /* no-op */
    }

    // 4. Dropear la DB tenant. Las conexiones fueron cerradas en el paso 1.
    try {
      await adminService?.dropDatabase(SMOKE_DB_NAME);
    } catch (_err) {
      console.warn(`[smoke teardown] Warning: no se pudo dropear ${SMOKE_DB_NAME}:`, _err);
    }
    try {
      await adminService?.onModuleDestroy();
    } catch (_err) {
      /* no-op */
    }
  }, 30_000);

  // ─── 1. Autenticación ──────────────────────────────────────────────────────

  describe('1. Autenticación', () => {
    it('POST /auth/login con credenciales válidas retorna 200 + accessToken', async () => {
      const { status, data } = await httpPost<{ accessToken?: string }>(
        `${baseUrl}/auth/login`,
        { email: SMOKE_ADMIN_EMAIL, password: SMOKE_ADMIN_PASSWORD },
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty('accessToken');
      expect(typeof data.accessToken).toBe('string');
    });

    it('POST /auth/login con password incorrecto retorna 401', async () => {
      const { status } = await httpPost(`${baseUrl}/auth/login`, {
        email: SMOKE_ADMIN_EMAIL,
        password: 'wrong-password',
      });
      expect(status).toBe(401);
    });

    it('GET /tickets/:id sin Bearer token retorna 401', async () => {
      const { status } = await httpGet(`${baseUrl}/tickets/some-id`);
      expect(status).toBe(401);
    });
  });

  // ─── 2. Flujo ticket SOPORTE ──────────────────────────────────────────────

  describe('2. Flujo ticket SOPORTE', () => {
    let jwtToken: string;
    let ticketId: string;

    beforeAll(async () => {
      // Login para obtener JWT válido
      const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login`, {
        email: SMOKE_ADMIN_EMAIL,
        password: SMOKE_ADMIN_PASSWORD,
      });
      jwtToken = data.accessToken;
    });

    it('POST /tickets crea un ticket SOPORTE (201)', async () => {
      const { status, data } = await httpPost<{ id?: string; numero?: string }>(
        `${baseUrl}/tickets`,
        {
          titulo: 'Smoke test ticket',
          descripcion: 'Test desde smoke e2e',
          tipoId: TIPO_TICKET_SOPORTE_ID,
          prioridadId: PRIORIDAD_MEDIA_ID,
          cicloId: null,
          solicitanteId: adminUserId,
          fechaVencimiento: null,
        },
        { Authorization: `Bearer ${jwtToken}` },
      );

      expect(status).toBe(201);
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('numero');
      ticketId = data.id!;
    });

    it('PATCH /tickets/:id/estado transiciona ABIERTO → EN_PROGRESO (200)', async () => {
      const { status } = await httpPatch(
        `${baseUrl}/tickets/${ticketId}/estado`,
        { nuevoEstadoCodigo: 'EN_PROGRESO' },
        { Authorization: `Bearer ${jwtToken}` },
      );
      expect(status).toBe(200);
    });

    it('GET /tickets/:id/operaciones retorna timeline con >= 2 entradas CAMBIO_ESTADO', async () => {
      const { status, data } = await httpGet<unknown[]>(
        `${baseUrl}/tickets/${ticketId}/operaciones`,
        { Authorization: `Bearer ${jwtToken}` },
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);

      const tipoOpIds = (data as { tipoOperacionId: string }[]).map((op) => op.tipoOperacionId);
      expect(tipoOpIds).toContain(TIPO_CAMBIO_ESTADO_ID);
    });

    it('GET /tickets/:id retorna el ticket con estado actualizado', async () => {
      const { status, data } = await httpGet<{ id?: string }>(
        `${baseUrl}/tickets/${ticketId}`,
        { Authorization: `Bearer ${jwtToken}` },
      );
      expect(status).toBe(200);
      expect((data as { id: string }).id).toBe(ticketId);
    });

    // ─── Suspensión de tenant mid-sesión → 403 ────────────────────────────────

    it('GET /tickets/:id con cliente inactivo retorna 403 (TenantGuard mid-session)', async () => {
      // Suspender el cliente directamente en master (simula una suspensión en producción
      // mientras el usuario ya tiene un JWT válido en mano)
      const pool = new Pool({ connectionString: MASTER_URL });
      try {
        await pool.query(`UPDATE clientes SET activo = false WHERE id = $1`, [clienteId]);
      } finally {
        await pool.end();
      }

      // El JWT sigue siendo válido (no expiró), pero el TenantGuard consulta
      // master.clientes en cada request y detecta activo = false → 403
      const { status } = await httpGet(`${baseUrl}/tickets/${ticketId}`, {
        Authorization: `Bearer ${jwtToken}`,
      });
      expect(status).toBe(403);

      // Reactivar para que el teardown pueda limpiar correctamente
      const pool2 = new Pool({ connectionString: MASTER_URL });
      try {
        await pool2.query(`UPDATE clientes SET activo = true WHERE id = $1`, [clienteId]);
      } finally {
        await pool2.end();
      }
    });
  });
});
