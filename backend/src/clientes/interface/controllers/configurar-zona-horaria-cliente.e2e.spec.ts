/**
 * configurar-zona-horaria-cliente.e2e.spec.ts — sdd/zona-horaria-por-tenant,
 * corrección de contrato HTTP (2026-09-02).
 *
 * `openspec/changes/zona-horaria-por-tenant/specs/zona-horaria-tenant/spec.md`
 * exigía 422 en el borde para un candidato inválido — verificado FALSO
 * (`app.module.ts`, `ValidationPipe` global `whitelist+transform` SIN
 * `errorHttpStatusCode`, da 400 para cualquier rechazo de `class-validator`).
 * El `[CRITICAL]` que "probaba" el 422 en `clientes.controller.spec.ts`
 * llamaba a `controller.configurarZonaHoraria(...)` DIRECTO, salteándose el
 * `ValidationPipe` — no ejercitaba ningún camino que un request real tome.
 *
 * Este e2e reemplaza a aquel test: HTTP real (fetch) → `ValidationPipe`
 * global (idéntico al de `AppModule`) → `JwtAuthGuard`/`GlobalAdminGuard` →
 * `ClientesController` → Postgres REAL (`soporte_master_test`), sin mockear
 * el pipe ni el caso de uso.
 */
import { randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { ClientesModule } from '../../clientes.module';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  TOKEN_SERVICE,
  ITokenService,
  JwtPayload,
} from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

type Headers = Record<string, string>;

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

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('PATCH /clientes/:id/zona-horaria e2e — contrato HTTP real (2026-09-02)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, ClientesModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mismo ValidationPipe global que `app.module.ts` — sin esto el
    // e2e no prueba el borde real, prueba otra cosa.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    prismaService = moduleRef.get(PrismaService);
    masterClient = prismaService.getMasterClient();
    tokenService = moduleRef.get(TOKEN_SERVICE);
  }, 60_000);

  afterAll(async () => {
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
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE usuario_cliente_permisos, membresias, refresh_tokens, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  function signRootToken(): string {
    const payload: JwtPayload = payloadDeTest({
      sub: `e2e-root-${randomBytes(4).toString('hex')}`,
      cliente_id: null,
      rol: null,
      permisos: [],
      is_global_admin: true,
      cliente_nombre: null,
    });
    return tokenService.signJwt(payload);
  }

  async function crearClienteDirecto(zonaHoraria: string) {
    return masterClient.cliente.create({
      data: {
        nombre: 'E2E Cliente Zona Horaria',
        dbName: `e2e_zona_horaria_${randomBytes(4).toString('hex')}`,
        zonaHoraria,
      },
    });
  }

  it(
    '[CRITICAL] candidato inválido (Europe/Madriz) → 400 (ValidationPipe real, no 422) ' +
      'y el tenant conserva su zona anterior',
    async () => {
      const cliente = await crearClienteDirecto('America/Argentina/Buenos_Aires');

      const { status } = await httpPatch(
        `${baseUrl}/clientes/${cliente.id}/zona-horaria`,
        { zonaHoraria: 'Europe/Madriz' },
        bearer(signRootToken()),
      );

      expect(status).toBe(400);

      const clienteFila = await masterClient.cliente.findUnique({ where: { id: cliente.id } });
      expect(clienteFila).not.toBeNull();
      expect(clienteFila!.zonaHoraria).toBe('America/Argentina/Buenos_Aires');
    },
  );

  it('candidato válido → 200 y el tenant queda persistido en la zona nueva', async () => {
    const cliente = await crearClienteDirecto('America/Argentina/Buenos_Aires');

    const { status, data } = await httpPatch<{ zonaHoraria: string }>(
      `${baseUrl}/clientes/${cliente.id}/zona-horaria`,
      { zonaHoraria: 'Europe/Madrid' },
      bearer(signRootToken()),
    );

    expect(status).toBe(200);
    expect(data.zonaHoraria).toBe('Europe/Madrid');

    const clienteFila = await masterClient.cliente.findUnique({ where: { id: cliente.id } });
    expect(clienteFila).not.toBeNull();
    expect(clienteFila!.zonaHoraria).toBe('Europe/Madrid');
  });

  it('sin Bearer token → 401, sin llegar al ValidationPipe ni al caso de uso', async () => {
    const cliente = await crearClienteDirecto('America/Argentina/Buenos_Aires');

    const { status } = await httpPatch(`${baseUrl}/clientes/${cliente.id}/zona-horaria`, {
      zonaHoraria: 'Europe/Madriz',
    });

    expect(status).toBe(401);
  });
});
