/**
 * [INTEGRATION] Barrido de envío de webhooks (odd/webhooks, T5) de punta a punta contra Postgres
 * REAL, en una base de INQUILINO EFÍMERA: entregas vencidas -> envío por un puerto HTTP falso ->
 * estados actualizados (ENTREGADA, reprogramada, FALLIDA), una no vencida intacta y la purga de las
 * de más de 30 días. El cliente y el destino (master) son fakes: no toca master, así que no usa
 * `usarLockMasterTest()`. Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { PostgresAdminService } from '../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../clientes/infrastructure/tenant-migration-runner.adapter';
import { Result } from '../../shared/domain/result';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { EnviarWebhooksPendientesUseCase } from '../application/enviar-webhooks-pendientes.use-case';
import { RespuestaWebhook, SolicitudWebhook } from '../domain/cliente-http-webhook.port';
import { firmarWebhook } from '../domain/firma-webhook';
import { PrismaWebhookEntregaRepository } from './prisma-webhook-entrega.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_webhook_envio_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const TICKET = '11111111-1111-4111-8111-111111111111';
const SECRETO = 'whsec_integracion';
const AHORA = new Date();
const DIA_MS = 24 * 60 * 60 * 1000;
const enMinutos = (n: number): Date => new Date(AHORA.getTime() + n * 60_000);

describe('EnviarWebhooksPendientesUseCase (odd/webhooks T5, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const tenantContext = new TenantContext();
  const repo = new PrismaWebhookEntregaRepository(tenantContext);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, fn);

  async function encolar(numero: string, cambios: { intentos?: number; proximo?: Date } = {}) {
    const entrega = await enTenant(() =>
      repo.encolar({
        evento: 'TICKET_CREADO',
        ticketId: TICKET,
        payload: { evento: 'ticket.creado', ticket: { id: TICKET, numero } },
        proximoIntentoAt: cambios.proximo ?? enMinutos(-1),
      }),
    );
    if (cambios.intentos) {
      await client.webhookEntrega.update({
        where: { id: entrega.id },
        data: { intentos: cambios.intentos },
      });
    }
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
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  it('envía las vencidas, actualiza su estado y purga las de más de 30 días', async () => {
    const ok = await encolar('SOP-1');
    const reintento = await encolar('SOP-2', { intentos: 2 });
    const agotada = await encolar('SOP-3', { intentos: 9 });
    const futura = await encolar('SOP-4', { proximo: enMinutos(30) });
    const vieja = await encolar('SOP-5', { proximo: enMinutos(30) });
    await client.webhookEntrega.update({
      where: { id: vieja },
      data: { createdAt: new Date(AHORA.getTime() - 31 * DIA_MS) },
    });

    const respuestas: Record<string, RespuestaWebhook> = {
      [ok]: { status: 200 },
      [reintento]: { status: 500 },
      [agotada]: { error: 'timeout' },
    };
    const enviadas: SolicitudWebhook[] = [];
    const useCase = new EnviarWebhooksPendientesUseCase(
      {
        findById: async () =>
          ClienteEntity.create(
            {
              nombre: 'Cliente A',
              razonSocial: null,
              cuit: null,
              dbName: DB,
              activo: true,
              apiHabilitada: true,
            },
            CLIENTE_ID,
          ),
      },
      {
        buscarPorCliente: async () => ({
          clienteId: CLIENTE_ID,
          url: 'https://erp.example.com/webhooks',
          eventos: ['TICKET_CREADO'],
          secretoCifrado: 'v1:iv:tag:ct',
          activo: true,
          createdAt: AHORA,
          updatedAt: AHORA,
        }),
      },
      { descifrar: () => Result.ok(SECRETO) },
      repo,
      {
        enviar: async (solicitud) => {
          enviadas.push(solicitud);
          return respuestas[solicitud.headers['X-Soporte-Entrega']] ?? { error: 'inesperada' };
        },
      },
      { error: () => undefined },
      async () => Result.ok([{ address: '93.184.215.14', family: 4 }]),
      () => AHORA,
    );

    const resultado = await enTenant(() => useCase.ejecutar(CLIENTE_ID));

    expect(resultado).toEqual({ purgadas: 1, entregadas: 1, fallos: 2 });
    expect(enviadas.map((s) => s.headers['X-Soporte-Entrega']).sort()).toEqual(
      [ok, reintento, agotada].sort(),
    );
    for (const solicitud of enviadas) {
      const timestamp = Number(solicitud.headers['X-Soporte-Timestamp']);
      expect(solicitud.headers['X-Soporte-Firma']).toBe(
        firmarWebhook(SECRETO, timestamp, solicitud.body),
      );
    }

    const filas = await client.webhookEntrega.findMany();
    const porId = new Map(filas.map((f) => [f.id, f]));
    expect(porId.has(vieja)).toBe(false);
    expect(porId.get(ok)).toMatchObject({ estado: 'ENTREGADA', intentos: 1, ultimoCodigo: 200 });
    expect(porId.get(reintento)).toMatchObject({
      estado: 'PENDIENTE',
      intentos: 3,
      ultimoCodigo: 500,
      ultimoError: 'HTTP 500',
      proximoIntentoAt: enMinutos(15),
    });
    expect(porId.get(agotada)).toMatchObject({
      estado: 'FALLIDA',
      intentos: 10,
      ultimoCodigo: null,
      ultimoError: 'timeout',
    });
    expect(porId.get(futura)).toMatchObject({ estado: 'PENDIENTE', intentos: 0 });
  });
});
