/**
 * integraciones-webhook-config.e2e.spec.ts — e2e HTTP real de `/integraciones/webhook`
 * (odd/webhooks, T6). Guards reales, Postgres real (`soporte_master_test` y una base efímera por
 * cliente), JWT firmados por el `ITokenService` real.
 *
 * Cubre CA4, CA6, CA7 y CA8: solo el ADMINISTRADOR del cliente (o ROOT) configura el destino y con
 * la API habilitada; el secreto sale en claro solo al crear y al regenerar; GET nunca lo lleva; el
 * registro de entregas pagina; y el ADMINISTRADOR de B no ve ni toca nada de A.
 *
 * DNS falso: `BUSCAR_DIRECCIONES_WEBHOOK` se reemplaza por una tabla fija, así ningún test depende
 * del DNS real ni de la red.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { LookupAddress } from 'node:dns';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { SharedModule } from '../src/shared/shared.module';
import { IntegracionesModule } from '../src/integraciones/integraciones.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../src/shared/tenancy/tenant-context';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TOKEN_SERVICE, ITokenService } from '../src/auth/domain/ports/i-token.service';
import { payloadDeTest } from '../src/auth/test-helpers/payload-de-test';
import { SecretoWebhookCifrado } from '../src/integraciones/application/secreto-webhook-cifrado';
import {
  BUSCAR_DIRECCIONES_WEBHOOK,
  BuscarDirecciones,
} from '../src/integraciones/domain/destino-webhook-seguro';
import { WEBHOOK_ENTREGA_REPOSITORY } from '../src/integraciones/domain/webhook-entrega-repository.port';
import { PrismaWebhookEntregaRepository } from '../src/integraciones/infrastructure/prisma-webhook-entrega.repository';
import { usarLockMasterTest } from '../src/testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_whcfgA_${SUFIJO}_test`;
const DB_B = `soporte_prov_whcfgB_${SUFIJO}_test`;

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

/** Tabla fija de DNS: `*.example.com` es pública, `interno.example.net` es privada, el resto no existe. */
const buscarFalso: BuscarDirecciones = async (hostname) => {
  if (hostname.endsWith('.example.com')) {
    const publica: LookupAddress = { address: '93.184.215.14', family: 4 };
    return [publica];
  }
  if (hostname === 'interno.example.net') return [{ address: '10.0.0.5', family: 4 }];
  throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
};

@Module({ imports: [SharedModule, IntegracionesModule] })
class ArneesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

interface Tenant {
  clienteId: string;
  dbName: string;
  adminToken: string;
  usuarioToken: string;
}

/** Lee una propiedad de una respuesta JSON sin castear. */
function prop(data: unknown, nombre: string): unknown {
  if (typeof data !== 'object' || data === null) throw new Error(`No es un objeto: ${data}`);
  return Reflect.get(data, nombre);
}

describe('Webhooks e2e — /integraciones/webhook (odd/webhooks T6)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;
  let tenantContext: TenantContext;
  let entregas: PrismaWebhookEntregaRepository;
  let secretos: SecretoWebhookCifrado;
  let emailKeyOriginal: string | undefined;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    emailKeyOriginal = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY ??= 'f'.repeat(64);
    for (const db of [DB_A, DB_B]) {
      await admin.createDatabase(db);
      await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(db);
    }

    const moduleRef = await Test.createTestingModule({ imports: [ArneesModule] })
      .overrideProvider(BUSCAR_DIRECCIONES_WEBHOOK)
      .useValue(buscarFalso)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');

    prismaService = moduleRef.get(PrismaService);
    master = prismaService.getMasterClient();
    tokenService = moduleRef.get(TOKEN_SERVICE);
    tenantContext = moduleRef.get(TenantContext);
    entregas = moduleRef.get(WEBHOOK_ENTREGA_REPOSITORY);
    secretos = moduleRef.get(SecretoWebhookCifrado);
  }, 120_000);

  afterAll(async () => {
    // Orden: filas del tenant -> app.close() -> pool -> dropDatabase.
    for (const db of [DB_A, DB_B]) {
      try {
        await prismaService.getTenantClient(db).webhookEntrega.deleteMany();
      } catch (_err) {
        /* no-op */
      }
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
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
  }, 60_000);

  beforeEach(async () => {
    for (const db of [DB_A, DB_B]) {
      await prismaService.getTenantClient(db).webhookEntrega.deleteMany();
    }
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE webhook_destinos, api_claves, membresias, usuarios, clientes RESTART IDENTITY CASCADE',
    );
  });

  async function crearTenant(dbName: string, apiHabilitada = true): Promise<Tenant> {
    const cliente = await master.cliente.create({
      data: { nombre: `E2E webhook ${randomBytes(3).toString('hex')}`, dbName, apiHabilitada },
    });
    const firmar = (rol: string) =>
      tokenService.signJwt(payloadDeTest({ sub: randomUUID(), cliente_id: cliente.id, rol }));
    return {
      clienteId: cliente.id,
      dbName,
      adminToken: firmar('ADMINISTRADOR'),
      usuarioToken: firmar('USUARIO'),
    };
  }

  async function llamar(metodo: string, ruta: string, bearer?: string, body?: unknown) {
    const res = await fetch(`${baseUrl}/integraciones/webhook${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const texto = await res.text();
    return { status: res.status, texto, data: texto ? (JSON.parse(texto) as unknown) : null };
  }

  const guardar = (bearer: string, extra: Record<string, unknown> = {}) =>
    llamar('PUT', '', bearer, {
      url: 'https://erp.example.com/webhooks',
      eventos: ['TICKET_CREADO', 'TICKET_COMENTADO'],
      activo: true,
      ...extra,
    });

  /** Encola `n` entregas con T2 en el tenant, separadas un segundo, la última la más nueva. */
  async function sembrarEntregas(t: Tenant, n: number): Promise<string[]> {
    const client = prismaService.getTenantClient(t.dbName);
    const ids: string[] = [];
    for (let i = 1; i <= n; i++) {
      const entrega = await tenantContext.run(
        { prismaClient: client, dbName: t.dbName, clienteId: t.clienteId },
        () =>
          entregas.encolar({
            evento: 'TICKET_CREADO',
            ticketId: randomUUID(),
            payload: { evento: 'ticket.creado', ticket: { numero: `SOP-2026-${String(100 + i).padStart(5, '0')}` } },
            proximoIntentoAt: new Date(),
          }),
      );
      await client.webhookEntrega.update({
        where: { id: entrega.id },
        data: { createdAt: new Date(Date.UTC(2026, 9, 13, 12, 0, i)) },
      });
      ids.push(entrega.id);
    }
    return ids;
  }

  it('el ADMINISTRADOR crea, lee, actualiza y regenera; el secreto sale solo al crear y regenerar', async () => {
    const a = await crearTenant(DB_A);

    const vacio = await llamar('GET', '', a.adminToken);
    expect(vacio.status).toBe(200);
    expect(vacio.data).toEqual({
      configurado: false,
      url: null,
      eventos: null,
      activo: null,
      creadoEn: null,
      actualizadoEn: null,
    });

    const creado = await guardar(a.adminToken);
    expect(creado.status).toBe(200);
    const secreto = String(prop(creado.data, 'secreto'));
    expect(secreto).toMatch(/^whsec_/);
    expect(creado.data).toMatchObject({
      configurado: true,
      url: 'https://erp.example.com/webhooks',
      eventos: ['TICKET_CREADO', 'TICKET_COMENTADO'],
      activo: true,
    });
    const fila = await master.webhookDestino.findUniqueOrThrow({
      where: { clienteId: a.clienteId },
    });
    expect(fila.secretoCifrado).not.toContain(secreto);
    expect(secretos.descifrar(a.clienteId, fila.secretoCifrado).getValue()).toBe(secreto);

    const leido = await llamar('GET', '', a.adminToken);
    expect(leido.data).toMatchObject({
      configurado: true,
      url: 'https://erp.example.com/webhooks',
    });
    expect(leido.texto).not.toContain(secreto);
    expect(leido.texto).not.toContain(fila.secretoCifrado);
    expect(leido.data).not.toHaveProperty('secreto');

    const actualizado = await guardar(a.adminToken, {
      url: 'https://otro.example.com/hook',
      eventos: ['TICKET_ASIGNADO'],
      activo: false,
    });
    expect(actualizado.status).toBe(200);
    expect(actualizado.data).not.toHaveProperty('secreto');
    expect(actualizado.data).toMatchObject({
      url: 'https://otro.example.com/hook',
      eventos: ['TICKET_ASIGNADO'],
      activo: false,
    });
    const filaActualizada = await master.webhookDestino.findUniqueOrThrow({
      where: { clienteId: a.clienteId },
    });
    expect(filaActualizada.secretoCifrado).toBe(fila.secretoCifrado);

    const regenerado = await llamar('POST', '/secreto', a.adminToken);
    expect(regenerado.status).toBe(200);
    const nuevo = String(prop(regenerado.data, 'secreto'));
    expect(nuevo).toMatch(/^whsec_/);
    expect(nuevo).not.toBe(secreto);
    const filaRegenerada = await master.webhookDestino.findUniqueOrThrow({
      where: { clienteId: a.clienteId },
    });
    expect(secretos.descifrar(a.clienteId, filaRegenerada.secretoCifrado).getValue()).toBe(nuevo);
    expect(filaRegenerada).toMatchObject({ url: 'https://otro.example.com/hook', activo: false });
    expect((await llamar('GET', '', a.adminToken)).texto).not.toContain(nuevo);
  });

  it('un usuario común recibe 403 en las cuatro rutas; sin Bearer, 401', async () => {
    const a = await crearTenant(DB_A);
    await guardar(a.adminToken);

    expect((await llamar('GET', '', a.usuarioToken)).status).toBe(403);
    expect((await guardar(a.usuarioToken, { activo: false })).status).toBe(403);
    expect((await llamar('POST', '/secreto', a.usuarioToken)).status).toBe(403);
    expect((await llamar('GET', '/entregas', a.usuarioToken)).status).toBe(403);
    expect((await llamar('GET', '')).status).toBe(401);
    const fila = await master.webhookDestino.findUniqueOrThrow({
      where: { clienteId: a.clienteId },
    });
    expect(fila.activo).toBe(true);
  });

  it('el ADMINISTRADOR de B no ve ni cambia la configuración ni las entregas de A', async () => {
    const a = await crearTenant(DB_A);
    const b = await crearTenant(DB_B);
    await guardar(a.adminToken);
    const original = await master.webhookDestino.findUniqueOrThrow({
      where: { clienteId: a.clienteId },
    });
    await sembrarEntregas(a, 2);

    expect((await llamar('GET', '', b.adminToken)).data).toMatchObject({ configurado: false });
    expect((await llamar('POST', '/secreto', b.adminToken)).status).toBe(404);
    expect((await llamar('GET', '/entregas', b.adminToken)).data).toEqual({
      items: [],
      total: 0,
      pagina: 1,
      porPagina: 20,
    });

    const deB = await guardar(b.adminToken, { url: 'https://b.example.com/hook' });
    expect(deB.status).toBe(200);
    const filaA = await master.webhookDestino.findUniqueOrThrow({
      where: { clienteId: a.clienteId },
    });
    expect(filaA).toEqual(original);
    expect((await llamar('GET', '', a.adminToken)).data).toMatchObject({
      url: 'https://erp.example.com/webhooks',
    });
    expect(prop((await llamar('GET', '/entregas', a.adminToken)).data, 'total')).toBe(2);
  });

  it('con la API deshabilitada PUT y regenerar dan 422 API_NO_HABILITADA', async () => {
    const a = await crearTenant(DB_A, false);

    const res = await guardar(a.adminToken);

    expect(res.status).toBe(422);
    expect(res.data).toMatchObject({ code: 'API_NO_HABILITADA' });
    expect((await llamar('POST', '/secreto', a.adminToken)).status).toBe(422);
    expect(await master.webhookDestino.count()).toBe(0);
  });

  it('valida eventos y URL; los dos rechazos de DNS comparten mensaje y código', async () => {
    const a = await crearTenant(DB_A);

    expect((await guardar(a.adminToken, { eventos: [] })).status).toBe(400);
    const eventos = await guardar(a.adminToken, { eventos: ['TICKET_CREADO', 'SLA_VENCIDO'] });
    expect(eventos.status).toBe(422);
    expect(eventos.data).toMatchObject({ code: 'WEBHOOK_EVENTOS_INVALIDOS' });
    const http = await guardar(a.adminToken, { url: 'http://erp.example.com/webhooks' });
    expect(http.status).toBe(422);
    expect(http.data).toMatchObject({ code: 'WEBHOOK_URL_INVALIDA' });

    const privado = await guardar(a.adminToken, { url: 'https://interno.example.net/hook' });
    const inexistente = await guardar(a.adminToken, { url: 'https://no-existe.example.org/hook' });
    expect([privado.status, inexistente.status]).toEqual([422, 422]);
    expect(privado.data).toMatchObject({ code: 'WEBHOOK_DESTINO_NO_ADMITIDO' });
    expect(inexistente.data).toEqual(privado.data);
    expect(await master.webhookDestino.count()).toBe(0);
  });

  it('regenerar sin destino da 404 WEBHOOK_DESTINO_NO_ENCONTRADO', async () => {
    const a = await crearTenant(DB_A);

    const res = await llamar('POST', '/secreto', a.adminToken);

    expect(res.status).toBe(404);
    expect(res.data).toMatchObject({ code: 'WEBHOOK_DESTINO_NO_ENCONTRADO' });
  });

  it('el registro de entregas pagina, la más nueva primero, y acota porPagina', async () => {
    const a = await crearTenant(DB_A);
    const ids = await sembrarEntregas(a, 5);

    const primera = await llamar('GET', '/entregas?pagina=1&porPagina=2', a.adminToken);
    const tercera = await llamar('GET', '/entregas?pagina=3&porPagina=2', a.adminToken);

    expect(primera.status).toBe(200);
    expect(primera.data).toMatchObject({ total: 5, pagina: 1, porPagina: 2 });
    const items = prop(primera.data, 'items');
    expect(items).toEqual([
      expect.objectContaining({ id: ids[4], evento: 'ticket.creado', numero: 'SOP-2026-00105' }),
      expect.objectContaining({ id: ids[3], numero: 'SOP-2026-00104' }),
    ]);
    expect(Array.isArray(items) ? items[0] : null).toEqual({
      id: ids[4],
      evento: 'ticket.creado',
      ticketId: expect.any(String),
      numero: 'SOP-2026-00105',
      estado: 'PENDIENTE',
      intentos: 0,
      ultimoCodigo: null,
      ultimoError: null,
      createdAt: '2026-10-13T12:00:05.000Z',
      proximoIntentoAt: expect.any(String),
      entregadaAt: null,
    });
    expect(prop(tercera.data, 'items')).toEqual([expect.objectContaining({ id: ids[0] })]);
    expect((await llamar('GET', '/entregas?porPagina=101', a.adminToken)).status).toBe(400);
    expect((await llamar('GET', '/entregas?pagina=0', a.adminToken)).status).toBe(400);
  });
});
