/**
 * horario-laboral.e2e.spec.ts — e2e real de `HorarioLaboralController`
 * (tarea 6b.1-6b.3, WU-6b, sdd/horario-laboral-por-cliente), HTTP →
 * `JwtAuthGuard`/`TenantGuard`/`AdminClienteGuard` → controller → use cases
 * → Prisma REAL, contra DOS tenants efímeros (A y B).
 *
 * Patrón de provisioning y actores: idéntico a `feriados-cliente.e2e.spec.ts`
 * (DB tenant efímera vía `PostgresAdminService` + `TenantMigrationRunnerAdapter`,
 * `TenantScopeMiddleware` en el harness, JWT firmados a mano con
 * `payloadDeTest` en vez de login real).
 *
 * `usarLockMasterTest()` NO hace falta acá (a diferencia de
 * `feriados-cliente.e2e.spec.ts` y `aplicar-sla-horario-cliente.e2e.spec.ts`):
 * este spec no lee ni escribe feriados de `soporte_master_test`, solo
 * registra sus dos clientes efímeros — mismo criterio que
 * `calendario-laboral.repositorios.integration.spec.ts` (WU-3). Ver
 * "Recordatorios operativos" en `tasks.md`.
 *
 * Higiene (soporte/CLAUDE.md, D-3): borrar filas de `clientes` en master →
 * `app.close()` → `onModuleDestroy()` → `dropDatabase` de A y B.
 *
 * Ref spec: sdd/horario-laboral-por-cliente specs/horario-laboral-cliente/spec.md,
 * requirements "Permisos de edición y lectura", "Al menos un día abierto",
 * "Reemplazo atómico de las 7 filas", "Aislamiento por cliente".
 * Ref design: D9, D10.
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
import type { HorarioLaboralResponseDto } from '../dtos/horario-laboral.dto';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_horarioA_${SUFIJO}_test`;
const DB_B = `soporte_prov_horarioB_${SUFIJO}_test`;

interface DiaHorarioBody {
  diaSemana: number;
  aperturaMinuto: number | null;
  cierreMinuto: number | null;
}

const HORARIO_DEFAULT: DiaHorarioBody[] = [
  { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
  { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
];

function horarioPersonalizado(aperturaMinuto: number, cierreMinuto: number): DiaHorarioBody[] {
  return HORARIO_DEFAULT.map((dia) =>
    dia.aperturaMinuto === null ? dia : { ...dia, aperturaMinuto, cierreMinuto },
  );
}

function horarioSieteDiasCerrados(): DiaHorarioBody[] {
  return HORARIO_DEFAULT.map((dia) => ({ ...dia, aperturaMinuto: null, cierreMinuto: null }));
}

/** Repite el lunes (0) dos veces y omite el domingo (6): DTO válida en forma, dominio la rechaza. */
function horarioDiaRepetido(): DiaHorarioBody[] {
  return [
    { diaSemana: 0, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 0, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
  ];
}

function horarioSeisDias(): DiaHorarioBody[] {
  return HORARIO_DEFAULT.slice(0, 6);
}

/** Lunes (1) con apertura >= cierre: DTO válida en forma, el VO la rechaza (S2, verify-report.md). */
function horarioAperturaMayorQueCierre(): DiaHorarioBody[] {
  return HORARIO_DEFAULT.map((dia) =>
    dia.diaSemana === 1 ? { ...dia, aperturaMinuto: 1080, cierreMinuto: 540 } : dia,
  );
}

type Headers = Record<string, string>;

async function httpGet<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpPut<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
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

describe('HorarioLaboralController e2e — matriz de guards y aislamiento A/B (WU-6b)', () => {
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
      nombre: `E2E Horario A ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: DB_A,
      activo: true,
    });
    clienteB = ClienteEntity.create({
      nombre: `E2E Horario B ${SUFIJO}`,
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
      sub: `e2e-horario-${randomUUID()}`,
      cliente_id: clienteId,
      ...overrides,
    });
    return tokenService.signJwt(payload);
  }

  const adminA = () => tokenFor(clienteA.id, { rol: 'ADMINISTRADOR' });
  const usuarioA = () => tokenFor(clienteA.id, { rol: 'USUARIO' });
  const rootEnA = () => tokenFor(clienteA.id, { is_global_admin: true });
  const usuarioB = () => tokenFor(clienteB.id, { rol: 'USUARIO' });

  // ─── 1. Sin token → 401 ──────────────────────────────────────────────────

  it('sin token → 401 en GET y PUT', async () => {
    const get = await httpGet(`${baseUrl}/horario-laboral`);
    const put = await httpPut(`${baseUrl}/horario-laboral`, { dias: HORARIO_DEFAULT });
    expect(get.status).toBe(401);
    expect(put.status).toBe(401);
  });

  // ─── 2. No-admin: lectura sí, escritura no ──────────────────────────────

  it('no-admin → GET 200 con el default sembrado', async () => {
    const { status, data } = await httpGet<HorarioLaboralResponseDto>(
      `${baseUrl}/horario-laboral`,
      bearer(usuarioA()),
    );
    expect(status).toBe(200);
    expect(data.dias).toEqual(HORARIO_DEFAULT);
  });

  it('[CRITICAL] no-admin → PUT 403', async () => {
    const { status } = await httpPut(
      `${baseUrl}/horario-laboral`,
      { dias: horarioPersonalizado(600, 900) },
      bearer(usuarioA()),
    );
    expect(status).toBe(403);
  });

  // ─── 3. 422: 7 días cerrados y día repetido, sin escritura ──────────────

  it('[CRITICAL] PUT con 7 días cerrados → 422; el GET posterior no cambió', async () => {
    const put = await httpPut(
      `${baseUrl}/horario-laboral`,
      { dias: horarioSieteDiasCerrados() },
      bearer(adminA()),
    );
    expect(put.status).toBe(422);

    const { data } = await httpGet<HorarioLaboralResponseDto>(
      `${baseUrl}/horario-laboral`,
      bearer(adminA()),
    );
    expect(data.dias).toEqual(HORARIO_DEFAULT);
  });

  it('[CRITICAL] PUT con un día repetido → 422; el GET posterior no cambió', async () => {
    const put = await httpPut(
      `${baseUrl}/horario-laboral`,
      { dias: horarioDiaRepetido() },
      bearer(adminA()),
    );
    expect(put.status).toBe(422);

    const { data } = await httpGet<HorarioLaboralResponseDto>(
      `${baseUrl}/horario-laboral`,
      bearer(adminA()),
    );
    expect(data.dias).toEqual(HORARIO_DEFAULT);
  });

  // WU-9 (S2, verify-report.md): antes esta escena solo estaba probada por
  // composición (VO spec + "no llama a txRunner.run" del use-case spec +
  // el único mapeo a 422 del controller) — acá va la prueba HTTP end-to-end.
  it('[CRITICAL] PUT con apertura >= cierre en un día → 422; el GET posterior no cambió', async () => {
    const put = await httpPut(
      `${baseUrl}/horario-laboral`,
      { dias: horarioAperturaMayorQueCierre() },
      bearer(adminA()),
    );
    expect(put.status).toBe(422);

    const { data } = await httpGet<HorarioLaboralResponseDto>(
      `${baseUrl}/horario-laboral`,
      bearer(adminA()),
    );
    expect(data.dias).toEqual(HORARIO_DEFAULT);
  });

  // ─── 4. 400: forma del DTO inválida (6 días) ────────────────────────────

  it('PUT con 6 días → 400', async () => {
    const { status } = await httpPut(
      `${baseUrl}/horario-laboral`,
      { dias: horarioSeisDias() },
      bearer(adminA()),
    );
    expect(status).toBe(400);
  });

  // ─── 5. Guardado válido: 200 para ADMINISTRADOR y para ROOT ─────────────

  it('ADMINISTRADOR → PUT 200 guarda el horario nuevo', async () => {
    const { status, data } = await httpPut<HorarioLaboralResponseDto>(
      `${baseUrl}/horario-laboral`,
      { dias: horarioPersonalizado(600, 900) },
      bearer(adminA()),
    );
    expect(status).toBe(200);
    expect(data.dias).toEqual(horarioPersonalizado(600, 900));
  });

  it('ROOT con cliente_id=A → PUT 200 guarda el horario nuevo', async () => {
    const { status, data } = await httpPut<HorarioLaboralResponseDto>(
      `${baseUrl}/horario-laboral`,
      { dias: horarioPersonalizado(480, 1020) },
      bearer(rootEnA()),
    );
    expect(status).toBe(200);
    expect(data.dias).toEqual(horarioPersonalizado(480, 1020));
  });

  // ─── 6. Aislamiento: el guardado de A no afecta la lectura de B ─────────

  it('[CRITICAL] A guardó un horario propio; el GET de B sigue devolviendo el default', async () => {
    const { status, data } = await httpGet<HorarioLaboralResponseDto>(
      `${baseUrl}/horario-laboral`,
      bearer(usuarioB()),
    );
    expect(status).toBe(200);
    expect(data.dias).toEqual(HORARIO_DEFAULT);
  });
});
