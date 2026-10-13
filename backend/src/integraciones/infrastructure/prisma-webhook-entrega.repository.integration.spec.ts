/**
 * [INTEGRATION] Cola y registro de entregas de webhook (odd/webhooks, T2) contra Postgres REAL, en
 * una base de INQUILINO EFÍMERA migrada con todas las migraciones: encolado con sus valores
 * iniciales, filtro y orden de vencidas, entrega y fallo (con reprogramación y FALLIDA), listado
 * paginado más nuevo primero, el borde de la purga, el CHECK de estado y el `rollback.sql`.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { DatosEncolarEntrega, LARGO_MAXIMO_ERROR_ENTREGA } from '../domain/webhook-entrega';
import { PrismaWebhookEntregaRepository } from './prisma-webhook-entrega.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB = `soporte_webhook_entregas_${sufijo}_test`;
const CARPETA = path.resolve(
  __dirname,
  '../../../prisma_tenant/migrations/20261013130000_webhook_entregas',
);
const TICKET = '11111111-1111-4111-8111-111111111111';
const INEXISTENTE = '99999999-9999-4999-8999-999999999999';
const AHORA = new Date('2026-10-13T12:00:00.000Z');

const minutos = (n: number): Date => new Date(AHORA.getTime() + n * 60_000);

describe('PrismaWebhookEntregaRepository (odd/webhooks T2, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const repo = new PrismaWebhookEntregaRepository(tenantContext);

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-a' }, fn);

  const datos = (cambios: Partial<DatosEncolarEntrega> = {}): DatosEncolarEntrega => ({
    evento: 'TICKET_CREADO',
    ticketId: TICKET,
    payload: { evento: 'TICKET_CREADO', ticket: { id: TICKET, numero: 'T-1' } },
    proximoIntentoAt: AHORA,
    ...cambios,
  });

  /** Encola y fija `createdAt`, que en producción pone la base. */
  async function encolarCreadaEn(createdAt: Date, cambios: Partial<DatosEncolarEntrega> = {}) {
    const entrega = await enTenant(() => repo.encolar(datos(cambios)));
    await client.webhookEntrega.update({ where: { id: entrega.id }, data: { createdAt } });
    return entrega.id;
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
  }, 120_000);

  afterAll(async () => {
    try {
      await client?.webhookEntrega.deleteMany();
    } catch {
      /* no-op: el test del rollback ya borró la tabla */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    await client.webhookEntrega.deleteMany();
  });

  it('encolar crea la entrega PENDIENTE, sin intentos, con el payload exacto y un id de entrega', async () => {
    const entrega = await enTenant(() => repo.encolar(datos()));

    expect(entrega).toMatchObject({
      evento: 'TICKET_CREADO',
      ticketId: TICKET,
      payload: { evento: 'TICKET_CREADO', ticket: { id: TICKET, numero: 'T-1' } },
      estado: 'PENDIENTE',
      intentos: 0,
      proximoIntentoAt: AHORA,
      ultimoCodigo: null,
      ultimoError: null,
      entregadaAt: null,
    });
    expect(entrega.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tomarVencidas devuelve solo PENDIENTES con proximoIntentoAt <= ahora, la más atrasada primero', async () => {
    const enElBorde = await enTenant(() => repo.encolar(datos({ proximoIntentoAt: AHORA })));
    const atrasada = await enTenant(() => repo.encolar(datos({ proximoIntentoAt: minutos(-5) })));
    await enTenant(() => repo.encolar(datos({ proximoIntentoAt: minutos(1) })));
    const entregada = await enTenant(() => repo.encolar(datos({ proximoIntentoAt: minutos(-9) })));
    await enTenant(() => repo.marcarEntregada(entregada.id, 200, AHORA));
    const fallida = await enTenant(() => repo.encolar(datos({ proximoIntentoAt: minutos(-9) })));
    await enTenant(() =>
      repo.registrarFallo(fallida.id, { error: 'agotada', proximoIntentoAt: null }),
    );

    const vencidas = await enTenant(() => repo.tomarVencidas(AHORA, 10));

    expect(vencidas.map((e) => e.id)).toEqual([atrasada.id, enElBorde.id]);
  });

  it('tomarVencidas respeta el límite', async () => {
    const primera = await enTenant(() => repo.encolar(datos({ proximoIntentoAt: minutos(-3) })));
    await enTenant(() => repo.encolar(datos({ proximoIntentoAt: minutos(-2) })));
    await enTenant(() => repo.encolar(datos({ proximoIntentoAt: minutos(-1) })));

    const vencidas = await enTenant(() => repo.tomarVencidas(AHORA, 1));

    expect(vencidas.map((e) => e.id)).toEqual([primera.id]);
  });

  it('marcarEntregada deja ENTREGADA, suma el intento y no reabre una entrega terminada', async () => {
    const entrega = await enTenant(() => repo.encolar(datos()));
    await enTenant(() =>
      repo.registrarFallo(entrega.id, { codigo: 500, error: 'HTTP 500', proximoIntentoAt: AHORA }),
    );

    await expect(enTenant(() => repo.marcarEntregada(entrega.id, 204, AHORA))).resolves.toBe(true);
    await expect(enTenant(() => repo.marcarEntregada(entrega.id, 200, minutos(1)))).resolves.toBe(
      false,
    );
    await expect(enTenant(() => repo.marcarEntregada(INEXISTENTE, 200, AHORA))).resolves.toBe(
      false,
    );

    const fila = await client.webhookEntrega.findUniqueOrThrow({ where: { id: entrega.id } });
    expect(fila).toMatchObject({
      estado: 'ENTREGADA',
      intentos: 2,
      ultimoCodigo: 204,
      ultimoError: null,
      entregadaAt: AHORA,
    });
  });

  it('registrarFallo con proximoIntentoAt reprograma la entrega y la deja PENDIENTE', async () => {
    const entrega = await enTenant(() => repo.encolar(datos()));

    await expect(
      enTenant(() =>
        repo.registrarFallo(entrega.id, {
          codigo: 503,
          error: 'HTTP 503',
          proximoIntentoAt: minutos(2),
        }),
      ),
    ).resolves.toBe(true);

    const fila = await client.webhookEntrega.findUniqueOrThrow({ where: { id: entrega.id } });
    expect(fila).toMatchObject({
      estado: 'PENDIENTE',
      intentos: 1,
      ultimoCodigo: 503,
      ultimoError: 'HTTP 503',
      proximoIntentoAt: minutos(2),
      entregadaAt: null,
    });
  });

  it('registrarFallo con proximoIntentoAt null deja FALLIDA, sin código si no hubo respuesta, y no vuelve a tocarla', async () => {
    const entrega = await enTenant(() => repo.encolar(datos()));
    await enTenant(() =>
      repo.registrarFallo(entrega.id, { codigo: 500, error: 'HTTP 500', proximoIntentoAt: AHORA }),
    );

    await expect(
      enTenant(() => repo.registrarFallo(entrega.id, { error: 'timeout', proximoIntentoAt: null })),
    ).resolves.toBe(true);
    await expect(
      enTenant(() =>
        repo.registrarFallo(entrega.id, { error: 'otra vez', proximoIntentoAt: minutos(1) }),
      ),
    ).resolves.toBe(false);

    const fila = await client.webhookEntrega.findUniqueOrThrow({ where: { id: entrega.id } });
    expect(fila).toMatchObject({
      estado: 'FALLIDA',
      intentos: 2,
      ultimoCodigo: null,
      ultimoError: 'timeout',
      proximoIntentoAt: AHORA,
    });
  });

  it('registrarFallo recorta el error al largo de la columna', async () => {
    const entrega = await enTenant(() => repo.encolar(datos()));

    await enTenant(() =>
      repo.registrarFallo(entrega.id, { error: 'x'.repeat(2_000), proximoIntentoAt: AHORA }),
    );

    const fila = await client.webhookEntrega.findUniqueOrThrow({ where: { id: entrega.id } });
    expect(fila.ultimoError).toHaveLength(LARGO_MAXIMO_ERROR_ENTREGA);
  });

  it('listar pagina de la más nueva a la más vieja y devuelve el total', async () => {
    const vieja = await encolarCreadaEn(minutos(-30));
    const media = await encolarCreadaEn(minutos(-20));
    const nueva = await encolarCreadaEn(minutos(-10));

    const primera = await enTenant(() => repo.listar({ pagina: 1, porPagina: 2 }));
    const segunda = await enTenant(() => repo.listar({ pagina: 2, porPagina: 2 }));

    expect(primera.total).toBe(3);
    expect(primera.items.map((e) => e.id)).toEqual([nueva, media]);
    expect(segunda.total).toBe(3);
    expect(segunda.items.map((e) => e.id)).toEqual([vieja]);
  });

  it('purgarAnterioresA borra las creadas antes de la fecha, en cualquier estado, y conserva la del borde', async () => {
    const corte = minutos(-60);
    const viejaPendiente = await encolarCreadaEn(minutos(-61));
    const viejaEntregada = await encolarCreadaEn(minutos(-90));
    await enTenant(() => repo.marcarEntregada(viejaEntregada, 200, AHORA));
    const enElBorde = await encolarCreadaEn(corte);
    const reciente = await encolarCreadaEn(minutos(-1));

    await expect(enTenant(() => repo.purgarAnterioresA(corte))).resolves.toBe(2);

    const quedan = await client.webhookEntrega.findMany({ select: { id: true } });
    expect(quedan.map((e) => e.id).sort()).toEqual([enElBorde, reciente].sort());
    expect(quedan.map((e) => e.id)).not.toContain(viejaPendiente);
  });

  it('el CHECK de la tabla rechaza un estado fuera de PENDIENTE / ENTREGADA / FALLIDA', async () => {
    const entrega = await enTenant(() => repo.encolar(datos()));

    await expect(
      client.webhookEntrega.update({ where: { id: entrega.id }, data: { estado: 'REINTENTANDO' } }),
    ).rejects.toThrow();
  });

  it('las operaciones corren contra el tenant del contexto: sin contexto fallan', async () => {
    await expect(repo.listar({ pagina: 1, porPagina: 10 })).rejects.toThrow();
  });

  // Último: borra la tabla.
  it('rollback.sql elimina la tabla y es re-ejecutable', async () => {
    const rollback = fs.readFileSync(path.join(CARPETA, 'rollback.sql'), 'utf8');

    await client.$executeRawUnsafe(rollback);
    await client.$executeRawUnsafe(rollback);

    const filas = await client.$queryRawUnsafe<{ existe: boolean }[]>(
      `SELECT to_regclass('webhook_entregas') IS NOT NULL AS existe`,
    );
    expect(filas[0].existe).toBe(false);
  });
});
