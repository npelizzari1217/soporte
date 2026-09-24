/**
 * feriados-cliente.e2e.spec.ts — e2e real de `FeriadosClienteController`
 * (tarea 4.3, WU4c, sdd/feriados-configurables), HTTP → `JwtAuthGuard`/
 * `TenantGuard`/`AdminClienteGuard` → controller → use cases → Prisma REAL,
 * contra DOS tenants efímeros (A y B). Este es el spec central de riesgo del
 * cambio: prueba que el aislamiento cross-tenant es ESTRUCTURAL (D6), no un
 * `if` de `clienteId` que alguien puede olvidar.
 *
 * Patrón de provisioning: mismo que `sectores.e2e.spec.ts`/`csat.e2e.spec.ts`
 * (DB tenant efímera vía `PostgresAdminService` + `TenantMigrationRunnerAdapter`,
 * `TenantScopeMiddleware` en el harness para que `TenantGuard.bind()` propague),
 * duplicado para A y B. Los actores se arman con JWT firmados a mano
 * (`payloadDeTest` + `tokenService.signJwt`, precedente `feriados.e2e.spec.ts`)
 * en vez de login real: ni `TenantGuard` ni `AdminClienteGuard` tocan
 * `usuarios`/`membresias` — solo `master.clientes` (TenantGuard) y claims del
 * JWT (AdminClienteGuard) — así que no hace falta esa infraestructura.
 *
 * Higiene (soporte/CLAUDE.md): `master.clientes` es compartida
 * (`soporte_master_test`) — se borran por id en `afterAll`, nunca TRUNCATE;
 * `usarLockMasterTest()` por las dudas (precedente en los 10 e2e existentes).
 * Orden: borrar filas de `clientes` → `app.close()` → `onModuleDestroy()` →
 * `dropDatabase` de A y B (efímeras, exclusivas de este archivo — no hace
 * falta limpiar filas de `feriados_cliente` antes, el DROP se lleva todo).
 *
 * Ref spec: sdd/feriados-configurables specs/feriados-cliente/spec.md,
 * requirements "Per-client admin manages its own holidays; other roles read",
 * "Cross-client isolation by construction", "Reject a client date already
 * global; enforce per-tenant uniqueness", "Date read-back integrity".
 * Ref design: D5, D6, D7.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { CalendarioLaboralModule } from '../../calendario-laboral.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import {
  TOKEN_SERVICE,
  ITokenService,
  JwtPayload,
} from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import type { FeriadoClienteResponseDto } from '../dtos/feriado-cliente.dto';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_feriadosClienteA_${SUFIJO}_test`;
const DB_B = `soporte_prov_feriadosClienteB_${SUFIJO}_test`;

/** Fecha ya global — seed de master (WU3b: `esGlobal('2026-12-25')` true, Navidad). */
const FECHA_GLOBAL_SEMBRADA = '2026-12-25';

type Headers = Record<string, string>;

async function httpGet<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

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

async function httpPatch<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpDelete(url: string, headers: Headers = {}): Promise<{ status: number }> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...headers },
  });
  return { status: res.status };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, CalendarioLaboralModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('FeriadosClienteController e2e — aislamiento cross-tenant (WU4c, tarea 4.3)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let tokenService: ITokenService;

  const admin = new PostgresAdminService(MASTER_URL);

  let clienteA: ClienteEntity;
  let clienteB: ClienteEntity;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    await admin.createDatabase(DB_A);
    await admin.createDatabase(DB_B);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB_A);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB_B);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    prismaService = moduleRef.get(PrismaService);
    masterClient = prismaService.getMasterClient();
    tokenService = moduleRef.get(TOKEN_SERVICE);
    clienteRepo = new PrismaClienteRepository(prismaService);

    clienteA = ClienteEntity.create({
      nombre: `E2E Feriados A ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: DB_A,
      activo: true,
    });
    clienteB = ClienteEntity.create({
      nombre: `E2E Feriados B ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: DB_B,
      activo: true,
    });
    await clienteRepo.save(clienteA);
    await clienteRepo.save(clienteB);
  }, 90_000);

  afterAll(async () => {
    await masterClient.cliente
      .deleteMany({ where: { id: { in: [clienteA.id, clienteB.id] } } })
      .catch(() => undefined);
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  // ─── Actores ────────────────────────────────────────────────────────────

  function tokenFor(clienteId: string, overrides: Partial<JwtPayload> = {}): string {
    const payload: JwtPayload = payloadDeTest({
      sub: `e2e-feriados-${randomUUID()}`,
      cliente_id: clienteId,
      ...overrides,
    });
    return tokenService.signJwt(payload);
  }

  const adminA = () => tokenFor(clienteA.id, { rol: 'ADMINISTRADOR' });
  const adminB = () => tokenFor(clienteB.id, { rol: 'ADMINISTRADOR' });
  const usuarioA = () => tokenFor(clienteA.id, { rol: 'USUARIO' });
  const rootEnA = () => tokenFor(clienteA.id, { is_global_admin: true });

  async function crearFeriadoEn(actorToken: string, fecha: string, descripcion: string) {
    const { status, data } = await httpPost<FeriadoClienteResponseDto>(
      `${baseUrl}/feriados-cliente`,
      { fecha, descripcion },
      bearer(actorToken),
    );
    expect(status).toBe(201);
    return data;
  }

  // ─── 1. Aislamiento — A nunca ve las filas de B y viceversa ─────────────

  it('[CRITICAL] A crea un feriado propio → 201; A lo lista; B NO lo lista (y viceversa)', async () => {
    const creadoA = await crearFeriadoEn(adminA(), '2031-04-01', 'Feriado de A');
    const creadoB = await crearFeriadoEn(adminB(), '2031-04-02', 'Feriado de B');

    const listaA = await httpGet<FeriadoClienteResponseDto[]>(
      `${baseUrl}/feriados-cliente`,
      bearer(adminA()),
    );
    expect(listaA.status).toBe(200);
    expect(listaA.data.some((f) => f.id === creadoA.id)).toBe(true);
    expect(listaA.data.some((f) => f.id === creadoB.id)).toBe(false);

    const listaB = await httpGet<FeriadoClienteResponseDto[]>(
      `${baseUrl}/feriados-cliente`,
      bearer(adminB()),
    );
    expect(listaB.status).toBe(200);
    expect(listaB.data.some((f) => f.id === creadoB.id)).toBe(true);
    expect(listaB.data.some((f) => f.id === creadoA.id)).toBe(false);
  });

  // ─── 2. Un :id de B resuelve 404 dentro de A; B queda intacto ───────────

  it('[CRITICAL] :id de B → 404 al PATCH/DELETE desde A; la fila de B no cambia', async () => {
    const deB = await crearFeriadoEn(adminB(), '2031-04-10', 'Original de B');

    const patch = await httpPatch(
      `${baseUrl}/feriados-cliente/${deB.id}`,
      { fecha: '2031-04-11', descripcion: 'Intento de A' },
      bearer(adminA()),
    );
    expect(patch.status).toBe(404);

    const del = await httpDelete(`${baseUrl}/feriados-cliente/${deB.id}`, bearer(adminA()));
    expect(del.status).toBe(404);

    const tenantB = prismaService.getTenantClient(DB_B);
    const filaB = await tenantB.feriadoCliente.findUnique({ where: { id: deB.id } });
    expect(filaB).not.toBeNull();
    expect(filaB!.descripcion).toBe('Original de B');
  });

  // ─── 3. Rol no-admin de A: lectura sí, escritura no ─────────────────────

  describe('Rol no-admin de A', () => {
    it('GET → 200', async () => {
      const { status } = await httpGet(`${baseUrl}/feriados-cliente`, bearer(usuarioA()));
      expect(status).toBe(200);
    });

    it('[CRITICAL] POST → 403', async () => {
      const { status } = await httpPost(
        `${baseUrl}/feriados-cliente`,
        { fecha: '2031-04-20', descripcion: 'x' },
        bearer(usuarioA()),
      );
      expect(status).toBe(403);
    });

    it('PATCH → 403', async () => {
      const { status } = await httpPatch(
        `${baseUrl}/feriados-cliente/${randomUUID()}`,
        { fecha: '2031-04-21', descripcion: 'x' },
        bearer(usuarioA()),
      );
      expect(status).toBe(403);
    });

    it('DELETE → 403', async () => {
      const { status } = await httpDelete(
        `${baseUrl}/feriados-cliente/${randomUUID()}`,
        bearer(usuarioA()),
      );
      expect(status).toBe(403);
    });
  });

  // ─── 4. ROOT actuando sobre el tenant A puede escribir ──────────────────

  it('ROOT con cliente_id=A → POST 201', async () => {
    const creado = await crearFeriadoEn(rootEnA(), '2031-04-25', 'Creado por ROOT en A');
    expect(creado.descripcion).toBe('Creado por ROOT en A');
  });

  // ─── 5. Sin token → 401 ──────────────────────────────────────────────────

  it('sin token → 401 en GET y POST', async () => {
    const get = await httpGet(`${baseUrl}/feriados-cliente`);
    const post = await httpPost(`${baseUrl}/feriados-cliente`, {
      fecha: '2031-04-30',
      descripcion: 'x',
    });
    expect(get.status).toBe(401);
    expect(post.status).toBe(401);
  });

  // ─── 6. Dedup: fecha ya global → 422; fecha duplicada en A → 422 ────────

  it('[CRITICAL] fecha ya global (2026-12-25) → 422, sin crear fila', async () => {
    const { status } = await httpPost(
      `${baseUrl}/feriados-cliente`,
      { fecha: FECHA_GLOBAL_SEMBRADA, descripcion: 'Choca con global' },
      bearer(adminA()),
    );
    expect(status).toBe(422);
  });

  it('fecha duplicada dentro del propio listado de A → 422 la segunda vez', async () => {
    await crearFeriadoEn(adminA(), '2031-05-01', 'Primero');
    const { status } = await httpPost(
      `${baseUrl}/feriados-cliente`,
      { fecha: '2031-05-01', descripcion: 'Duplicado' },
      bearer(adminA()),
    );
    expect(status).toBe(422);
  });

  // ─── 7. Round-trip de fecha — sin corrimiento UTC (D2) ──────────────────

  it('la fecha creada se lee de vuelta idéntica (sin corrimiento UTC-3)', async () => {
    const creado = await crearFeriadoEn(adminA(), '2031-05-15', 'Round-trip');
    expect(creado.fecha).toBe('2031-05-15');

    const { data } = await httpGet<FeriadoClienteResponseDto[]>(
      `${baseUrl}/feriados-cliente`,
      bearer(adminA()),
    );
    expect(data.find((f) => f.id === creado.id)?.fecha).toBe('2031-05-15');
  });
});
