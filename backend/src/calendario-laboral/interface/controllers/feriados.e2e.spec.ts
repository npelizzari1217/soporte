/**
 * feriados.e2e.spec.ts — e2e real de `FeriadosController` (tarea 2.4, WU2c,
 * sdd/feriados-configurables), HTTP → `JwtAuthGuard`/`GlobalAdminGuard` →
 * controller → use cases → Prisma REAL contra `soporte_master_test`. Sin
 * mocks de infraestructura.
 *
 * Cubre dos capas:
 *  1. Guard matrix (spec "ROOT-only writes, backend-enforced" / "Authenticated
 *     read access"): 401 sin token, 403 escritura no-ROOT, lectura abierta a
 *     cualquier autenticado. `feriados.controller.spec.ts` (WU2b) ya prueba
 *     esto por METADATA de decorador; acá se prueba que el guard REAL, en la
 *     ruta REAL, produce el código de estado correcto.
 *  2. Cobertura funcional que WU2b dejó deliberadamente para este e2e (ver
 *     `apply-progress.md`, sección WU2b): alta+read-back con integridad de
 *     fecha (D2, spec "Date read-back integrity"), edición, baja, fecha con
 *     día calendario inexistente, fecha duplicada, id inexistente, orden de
 *     la lista.
 *
 * No se toca ninguna DB tenant: los feriados globales viven enteramente en
 * `master.feriados`. `GlobalAdminGuard` lee `is_global_admin` del JWT sin
 * consultar la DB, así que los actores de este spec no requieren fila en
 * `usuarios`/`clientes` — solo un JWT firmado con el claim que corresponde.
 *
 * Higiene de datos (soporte/CLAUDE.md): la tabla `feriados` NUNCA se
 * truncatea — las filas sembradas por migración deben sobrevivir la suite: 46
 * de 2026-2028 y 15 de 2029. Los fixtures usan fechas de 2031 (fuera del rango
 * sembrado) y se
 * borran por `id` en `afterAll`, nunca por TRUNCATE.
 *
 * Ref spec: sdd/feriados-configurables specs/feriados-globales/spec.md.
 * Ref design: sdd/feriados-configurables design.md D5, D7.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { CalendarioLaboralModule } from '../../calendario-laboral.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import {
  TOKEN_SERVICE,
  ITokenService,
  JwtPayload,
} from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import type { FeriadoResponseDto } from '../dtos/feriado.dto';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Límite superior (exclusivo) de las 46 filas sembradas por migración — todo lo que este spec crea usa 2031. */
const FIN_RANGO_SEMBRADO = new Date('2029-01-01T00:00:00.000Z');

type Headers = Record<string, string>;

async function httpGet<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
  });
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

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('FeriadosController e2e (WU2c, tarea 2.4)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, CalendarioLaboralModule],
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
  }, 60_000);

  afterAll(async () => {
    if (createdIds.length > 0) {
      await masterClient.feriado
        .deleteMany({ where: { id: { in: createdIds } } })
        .catch(() => undefined);
    }
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
  }, 60_000);

  // ─── Helpers ────────────────────────────────────────────────────────────

  function rootToken(): string {
    const payload: JwtPayload = payloadDeTest({
      sub: `e2e-root-${randomUUID()}`,
      is_global_admin: true,
    });
    return tokenService.signJwt(payload);
  }

  function normalToken(): string {
    const payload: JwtPayload = payloadDeTest({
      sub: `e2e-normal-${randomUUID()}`,
      is_global_admin: false,
    });
    return tokenService.signJwt(payload);
  }

  async function crearFeriado(fecha: string, descripcion: string): Promise<FeriadoResponseDto> {
    const { status, data } = await httpPost<FeriadoResponseDto>(
      `${baseUrl}/feriados`,
      { fecha, descripcion },
      bearer(rootToken()),
    );
    expect(status).toBe(201);
    createdIds.push(data.id);
    return data;
  }

  // ─── Guard matrix — spec "ROOT-only writes, backend-enforced" / "Authenticated read access" ──

  describe('Guard matrix', () => {
    it('GET /feriados sin token → 401', async () => {
      const { status } = await httpGet(`${baseUrl}/feriados`);
      expect(status).toBe(401);
    });

    it('GET /feriados con token no-ROOT → 200 (lectura abierta a cualquier autenticado)', async () => {
      const { status } = await httpGet(`${baseUrl}/feriados`, bearer(normalToken()));
      expect(status).toBe(200);
    });

    it('POST /feriados sin token → 401, no crea nada', async () => {
      const { status } = await httpPost(`${baseUrl}/feriados`, {
        fecha: '2031-05-05',
        descripcion: 'x',
      });
      expect(status).toBe(401);
      expect(
        await masterClient.feriado.count({
          where: { fecha: new Date('2031-05-05T00:00:00.000Z') },
        }),
      ).toBe(0);
    });

    it('[CRITICAL] POST /feriados con token no-ROOT → 403, no crea nada', async () => {
      const { status } = await httpPost(
        `${baseUrl}/feriados`,
        { fecha: '2031-05-06', descripcion: 'x' },
        bearer(normalToken()),
      );
      expect(status).toBe(403);
      expect(
        await masterClient.feriado.count({
          where: { fecha: new Date('2031-05-06T00:00:00.000Z') },
        }),
      ).toBe(0);
    });

    it('PATCH /feriados/:id sin token → 401', async () => {
      const { status } = await httpPatch(`${baseUrl}/feriados/${randomUUID()}`, {
        fecha: '2031-05-07',
        descripcion: 'x',
      });
      expect(status).toBe(401);
    });

    it('[CRITICAL] PATCH /feriados/:id con token no-ROOT → 403', async () => {
      const { status } = await httpPatch(
        `${baseUrl}/feriados/${randomUUID()}`,
        { fecha: '2031-05-08', descripcion: 'x' },
        bearer(normalToken()),
      );
      expect(status).toBe(403);
    });

    it('DELETE /feriados/:id sin token → 401', async () => {
      const { status } = await httpDelete(`${baseUrl}/feriados/${randomUUID()}`);
      expect(status).toBe(401);
    });

    it('[CRITICAL] DELETE /feriados/:id con token no-ROOT → 403', async () => {
      const { status } = await httpDelete(
        `${baseUrl}/feriados/${randomUUID()}`,
        bearer(normalToken()),
      );
      expect(status).toBe(403);
    });
  });

  // ─── Cobertura funcional diferida de WU2b ────────────────────────────────

  describe('ABM real contra soporte_master_test (cobertura funcional diferida de WU2b)', () => {
    it(
      '[CRITICAL] ROOT crea (201) y el read-back devuelve la MISMA fecha calendario, ' +
        'sin corrimiento UTC (D2, spec "Date read-back integrity")',
      async () => {
        const creado = await crearFeriado('2031-06-15', 'Feriado e2e round-trip');
        expect(creado.fecha).toBe('2031-06-15');

        const { status, data } = await httpGet<FeriadoResponseDto[]>(
          `${baseUrl}/feriados`,
          bearer(rootToken()),
        );
        expect(status).toBe(200);
        const fila = data.find((f) => f.id === creado.id);
        expect(fila?.fecha).toBe('2031-06-15');
      },
    );

    it('ROOT edita fecha y descripción (full-replace)', async () => {
      const creado = await crearFeriado('2031-07-01', 'Original');
      const { status, data } = await httpPatch<FeriadoResponseDto>(
        `${baseUrl}/feriados/${creado.id}`,
        { fecha: '2031-07-02', descripcion: 'Editado' },
        bearer(rootToken()),
      );
      expect(status).toBe(200);
      expect(data.fecha).toBe('2031-07-02');
      expect(data.descripcion).toBe('Editado');
    });

    it('ROOT elimina (204) y el feriado deja de aparecer en la lista', async () => {
      const creado = await crearFeriado('2031-08-10', 'A borrar');
      const { status } = await httpDelete(`${baseUrl}/feriados/${creado.id}`, bearer(rootToken()));
      expect(status).toBe(204);
      createdIds.splice(createdIds.indexOf(creado.id), 1);

      const { data } = await httpGet<FeriadoResponseDto[]>(
        `${baseUrl}/feriados`,
        bearer(rootToken()),
      );
      expect(data.some((f) => f.id === creado.id)).toBe(false);
    });

    it('fecha con día calendario inexistente (2031-02-30) → 422 (FechaCalendarioInvalidaError, D7)', async () => {
      const { status } = await httpPost(
        `${baseUrl}/feriados`,
        { fecha: '2031-02-30', descripcion: 'Fecha inválida' },
        bearer(rootToken()),
      );
      expect(status).toBe(422);
    });

    it('fecha con forma inválida (no YYYY-MM-DD) → 400 (validación de transporte, ANTES del dominio)', async () => {
      const { status } = await httpPost(
        `${baseUrl}/feriados`,
        { fecha: '31-02-2031', descripcion: 'Forma inválida' },
        bearer(rootToken()),
      );
      expect(status).toBe(400);
    });

    it('fecha duplicada → 422 (P2002 mapeado a FeriadoFechaDuplicadaError, D7)', async () => {
      await crearFeriado('2031-09-20', 'Primero');
      const { status } = await httpPost(
        `${baseUrl}/feriados`,
        { fecha: '2031-09-20', descripcion: 'Duplicado' },
        bearer(rootToken()),
      );
      expect(status).toBe(422);
    });

    it('PATCH con id inexistente → 404 (FeriadoNoEncontradoError)', async () => {
      const { status } = await httpPatch(
        `${baseUrl}/feriados/${randomUUID()}`,
        { fecha: '2031-10-01', descripcion: 'x' },
        bearer(rootToken()),
      );
      expect(status).toBe(404);
    });

    it('DELETE con id inexistente → 404 (FeriadoNoEncontradoError)', async () => {
      const { status } = await httpDelete(
        `${baseUrl}/feriados/${randomUUID()}`,
        bearer(rootToken()),
      );
      expect(status).toBe(404);
    });

    it('[CRITICAL] GET /feriados devuelve la lista ordenada por fecha ascendente', async () => {
      const { status, data } = await httpGet<FeriadoResponseDto[]>(
        `${baseUrl}/feriados`,
        bearer(rootToken()),
      );
      expect(status).toBe(200);
      const fechas = data.map((f) => f.fecha);
      const fechasOrdenadas = [...fechas].sort();
      expect(fechas).toEqual(fechasOrdenadas);
    });
  });

  // ─── Regresión — las 46 filas sembradas por migración sobreviven la suite ──

  it('[CRITICAL] las 46 filas sembradas por migración permanecen sin cambios (spec "Existing seeded holidays remain unchanged")', async () => {
    const cantidad = await masterClient.feriado.count({
      where: { fecha: { lt: FIN_RANGO_SEMBRADO } },
    });
    expect(cantidad).toBe(46);
  });

  it('las 15 filas de 2029 (migración `20260929120000_seed_feriados_2029`) están sembradas', async () => {
    const fechas2029 = await masterClient.feriado.findMany({
      where: { fecha: { gte: FIN_RANGO_SEMBRADO, lt: new Date('2030-01-01T00:00:00.000Z') } },
      orderBy: { fecha: 'asc' },
    });
    expect(fechas2029.map((f) => f.fecha.toISOString().slice(0, 10))).toEqual([
      '2029-01-01', // Año Nuevo
      '2029-02-12', // Carnaval
      '2029-02-13', // Carnaval
      '2029-03-24', // Memoria
      '2029-03-30', // Viernes Santo (Pascua 2029-04-01)
      '2029-04-02', // Malvinas
      '2029-05-01', // Trabajador
      '2029-05-25', // Revolución de Mayo
      '2029-06-20', // Belgrano (el 17/06, Güemes, cae domingo: no se siembra)
      '2029-07-09', // Independencia
      '2029-08-20', // San Martín, trasladado del viernes 17/08
      '2029-10-15', // Diversidad Cultural, trasladado del viernes 12/10
      '2029-11-19', // Soberanía Nacional, trasladado del martes 20/11
      '2029-12-08', // Inmaculada Concepción
      '2029-12-25', // Navidad
    ]);
  });
});
