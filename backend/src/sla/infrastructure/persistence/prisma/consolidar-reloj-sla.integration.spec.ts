/**
 * [INTEGRATION] WU-3b (sdd/sla-primera-respuesta-y-pausa, sla-reloj-activo R4): ConsolidarRelojSlaUseCase con
 * el PrismaRelojSlaRepository real contra `soporte_tenant_test`. Calendario y feriados son fakes (sin MASTER).
 * Siembra si faltan los estados y el tipo `CAMBIO_ESTADO` que usa (y borra solo los que creó); crea solo filas con el prefijo `WU3BC`, que
 * borra al final y también al empezar (por si una corrida anterior abortó).
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { CalcularSlaHabilVenceService } from '../../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ConsolidarRelojSlaUseCase } from '../../../application/use-cases/consolidar-reloj-sla.use-case';
import { calendarioSemanal } from '../../../domain/entities/reloj-sla.fixtures';
import { IRelojSlaRepository } from '../../../domain/ports/i-reloj-sla.repository';
import { PrismaRelojSlaRepository } from './prisma-reloj-sla.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO = '01900000-0000-7000-8000-000000000001';
const PREFIJO = 'WU3BC';
// Lunes 2026-08-10 09:00 y 12:00 locales (UTC-3).
const INICIO = new Date('2026-08-10T12:00:00.000Z');
const TRES_HORAS = new Date('2026-08-10T15:00:00.000Z');

describe('ConsolidarRelojSlaUseCase + PrismaRelojSlaRepository — Integration (WU-3b)', () => {
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaRelojSlaRepository;
  let tipoId: string;
  let prioridadId: string;
  let estados: Record<string, string>;
  let tipoOpId: string;
  const creados: Array<() => Promise<unknown>> = [];
  const logger = { error: vi.fn() };

  const crearUseCase = (r: IRelojSlaRepository = repo) =>
    new ConsolidarRelojSlaUseCase(
      r,
      new CalcularSlaHabilVenceService(),
      { obtener: async () => calendarioSemanal },
      { obtener: async () => new Set<string>() },
      logger,
    );

  async function limpiar(): Promise<void> {
    await client.operacionTicket.deleteMany({
      where: { ticket: { tipo: { codigo: { startsWith: PREFIJO } } } },
    });
    await client.ticket.deleteMany({ where: { tipo: { codigo: { startsWith: PREFIJO } } } });
    await client.tipoTicket.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await client.prioridad.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({ prismaClient: client, dbName: TENANT_TEST_DB_NAME, clienteId: 'wu3bc' });
    repo = new PrismaRelojSlaRepository(tenantContext);
    await limpiar();
    const s = randomBytes(3).toString('hex');
    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: `${PREFIJO}${s}`, nombre: 'WU3b', activo: true, modulo: 'SOPORTE' },
      })
    ).id;
    prioridadId = (
      await client.prioridad.create({
        data: { codigo: `${PREFIJO}P${s}`, nombre: 'WU3b', orden: 1, activo: true },
      })
    ).id;
    // Catálogos que el spec necesita: se crean solo si faltan (una base nueva no los trae) y al
    // terminar se borran únicamente los que creó este spec.
    for (const [codigo, orden] of [
      ['EN_PROCESO', 30],
      ['ESPERANDO_CLIENTE', 35],
    ] as const) {
      const previo = await client.estado.findUnique({ where: { codigo } });
      if (!previo) {
        const e = await client.estado.create({
          data: { codigo, nombre: codigo, orden, activo: true },
        });
        creados.push(() => client.estado.delete({ where: { id: e.id } }));
      }
    }
    const filas = await client.estado.findMany({
      where: { codigo: { in: ['EN_PROCESO', 'ESPERANDO_CLIENTE'] } },
    });
    estados = Object.fromEntries(filas.map((e) => [e.codigo, e.id]));
    const tipoOp = await client.tipoOperacion.findUnique({ where: { codigo: 'CAMBIO_ESTADO' } });
    if (tipoOp) {
      tipoOpId = tipoOp.id;
    } else {
      const t = await client.tipoOperacion.create({
        data: { codigo: 'CAMBIO_ESTADO', nombre: 'CAMBIO_ESTADO' },
      });
      tipoOpId = t.id;
      creados.push(() => client.tipoOperacion.delete({ where: { id: t.id } }));
    }
  }, 30_000);

  afterAll(async () => {
    await limpiar();
    for (const borrar of creados.reverse()) await borrar();
    await prismaService.onModuleDestroy();
  }, 30_000);

  beforeEach(() => logger.error.mockClear());

  /** Ticket en ESPERANDO_CLIENTE con una transición EN_PROCESO→ESPERANDO_CLIENTE marcada (seq 1, versión 1). */
  async function ticketPausado(): Promise<string> {
    const ticket = await client.ticket.create({
      data: {
        numero: `${PREFIJO}-${randomBytes(3).toString('hex')}`,
        titulo: 'Ticket WU-3b',
        tipoId,
        estadoId: estados.ESPERANDO_CLIENTE,
        prioridadId,
        solicitanteId: USUARIO,
        slaMetaS: 8 * 3600,
        slaCorreDesde: INICIO,
        slaRelojVersion: 1,
        slaRelojPendiente: true,
      },
    });
    await client.operacionTicket.create({
      data: {
        ticketId: ticket.id,
        tipoOperacionId: tipoOpId,
        autorId: USUARIO,
        estadoAnteriorId: estados.EN_PROCESO,
        estadoNuevoId: estados.ESPERANDO_CLIENTE,
        createdAt: TRES_HORAS,
        slaRelojSeq: 1,
      },
    });
    return ticket.id;
  }

  it('versión vieja entre la lectura y la escritura: devuelve conflicto, registra SLA_RELOJ_CONFLICTO y el ticket sigue pendiente', async () => {
    const id = await ticketPausado();
    // Otra transición entra durante el pliegue: sube la versión justo antes de cada escritura.
    const concurrente: IRelojSlaRepository = {
      leer: (t) => repo.leer(t),
      historialSinSecuencia: (t) => repo.historialSinSecuencia(t),
      transicionesDesde: (t, s) => repo.transicionesDesde(t, s),
      limpiarMetaPendiente: (t) => repo.limpiarMetaPendiente(t),
      findPendientes: () => repo.findPendientes(),
      guardarSiVersion: async (t, v, reloj) => {
        await client.ticket.update({
          where: { id: t },
          data: { slaRelojVersion: { increment: 1 } },
        });
        return repo.guardarSiVersion(t, v, reloj);
      },
    };

    expect(await crearUseCase(concurrente).execute(id)).toBe('conflicto');

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SLA_RELOJ_CONFLICTO'));
    const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.slaRelojPendiente).toBe(true);
    expect(fila.slaAcumuladoS).toBe(0);
  });

  it('consolida una vez y repetir el pliegue sin operaciones nuevas no cambia nada', async () => {
    const id = await ticketPausado();
    const uc = crearUseCase();

    expect(await uc.execute(id)).toBe('consolidado');
    const primera = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(primera).toMatchObject({
      slaAcumuladoS: 3 * 3600,
      slaRelojSeqHasta: 1,
      slaRelojPendiente: false,
    });
    expect(primera.slaCorreDesde).toBeNull();

    expect(await uc.execute(id)).toBe('consolidado');
    const segunda = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect({ ...segunda, updatedAt: null }).toEqual({ ...primera, updatedAt: null });
  });
});
