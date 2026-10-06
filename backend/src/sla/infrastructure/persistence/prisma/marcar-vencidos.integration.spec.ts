/**
 * [INTEGRATION] WU-3c (sdd/sla-primera-respuesta-y-pausa, sla-reloj-activo R4, R7): el barrido
 * `MarcarVencidosUseCase` con los repos Prisma reales contra `soporte_tenant_test`. El calendario es fake
 * (sin MASTER). Los repos se acotan a las filas de este spec (prefijo `WU3C`) para que el barrido no
 * toque fixtures de otros specs de la base compartida. Borra sus filas al empezar y al terminar.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { CalcularSlaHabilVenceService } from '../../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ConsolidarRelojSlaUseCase } from '../../../application/use-cases/consolidar-reloj-sla.use-case';
import { MarcarVencidosUseCase } from '../../../application/use-cases/marcar-vencidos.use-case';
import { SlaVencidoEvent } from '../../../domain/events/sla-vencido.event';
import { SlaPrimeraRespuestaVencidaEvent } from '../../../domain/events/sla-primera-respuesta-vencida.event';
import { calendarioSemanal } from '../../../domain/entities/reloj-sla.fixtures';
import { PrismaRelojSlaRepository } from './prisma-reloj-sla.repository';
import { PrismaSlaTicketQueryRepository } from './prisma-sla-ticket-query.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO = '01900000-0000-7000-8000-000000000001';
const PREFIJO = 'WU3C';
const H = 3600_000;
const ESTADOS_USADOS = [
  'EN_PROCESO',
  'ESPERANDO_CLIENTE',
  'RESUELTO',
  'CERRADO',
  'CANCELADO',
] as const;
type EstadoUsado = (typeof ESTADOS_USADOS)[number];

describe('MarcarVencidosUseCase + repos Prisma — Integration (WU-3c)', () => {
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let relojRepo: PrismaRelojSlaRepository;
  let queryRepo: PrismaSlaTicketQueryRepository;
  let tipoId: string;
  let prioridadId: string;
  let tipoOpId: string;
  let estados: Record<string, string>;
  const propios = new Set<string>();
  const estadosCreados: string[] = [];
  const publish = vi.fn();

  const barrido = () =>
    new MarcarVencidosUseCase(
      {
        findPendientes: async () =>
          (await relojRepo.findPendientes()).filter((i) => propios.has(i)),
      },
      new ConsolidarRelojSlaUseCase(
        relojRepo,
        new CalcularSlaHabilVenceService(),
        { obtener: async () => calendarioSemanal },
        { obtener: async () => new Set<string>() },
        { error: vi.fn() },
      ),
      {
        findVencibles: async (now) =>
          (await queryRepo.findVencibles(now)).filter((t) => propios.has(t.id)),
        marcarVencido: (id) => queryRepo.marcarVencido(id),
        findPrimerasRespuestasVencidas: async (now) =>
          (await queryRepo.findPrimerasRespuestasVencidas(now)).filter((t) => propios.has(t.id)),
        marcarPrimeraRespuestaVencida: (id) => queryRepo.marcarPrimeraRespuestaVencida(id),
      },
      { publish },
    );

  const primerasVencidas = (id: string) =>
    publish.mock.calls.filter(
      ([e]) => e instanceof SlaPrimeraRespuestaVencidaEvent && e.ticketId === id,
    ).length;

  const notificados = (id: string) =>
    publish.mock.calls.filter(([e]) => e instanceof SlaVencidoEvent && e.ticketId === id).length;

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
    tenantContext.bind({ prismaClient: client, dbName: TENANT_TEST_DB_NAME, clienteId: 'wu3c' });
    relojRepo = new PrismaRelojSlaRepository(tenantContext);
    queryRepo = new PrismaSlaTicketQueryRepository(tenantContext);
    await limpiar();
    const s = randomBytes(3).toString('hex');
    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: `${PREFIJO}${s}`, nombre: 'WU3c', activo: true, modulo: 'SOPORTE' },
      })
    ).id;
    prioridadId = (
      await client.prioridad.create({
        data: { codigo: `${PREFIJO}P${s}`, nombre: 'WU3c', orden: 1, activo: true },
      })
    ).id;
    const filas = await client.estado.findMany({
      where: { codigo: { in: [...ESTADOS_USADOS] } },
    });
    // La base compartida solo trae los estados abiertos: se crean los terminales que falten (los
    // códigos reales, porque el barrido filtra por código) y se borran al terminar.
    for (const codigo of ESTADOS_USADOS.filter((c) => !filas.some((f) => f.codigo === c))) {
      filas.push(await client.estado.create({ data: { codigo, nombre: `WU7 ${codigo}` } }));
      estadosCreados.push(codigo);
    }
    estados = Object.fromEntries(filas.map((e) => [e.codigo, e.id]));
    tipoOpId = (
      await client.tipoOperacion.findUniqueOrThrow({ where: { codigo: 'CAMBIO_ESTADO' } })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await limpiar();
    await client.estado.deleteMany({ where: { codigo: { in: estadosCreados } } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  beforeEach(() => {
    publish.mockClear();
    propios.clear();
  });

  async function crearTicket(data: {
    estado: EstadoUsado;
    slaVenceAt?: Date;
    slaAcumuladoS?: number | null;
    slaCorreDesde?: Date | null;
    primeraRespuestaVenceAt?: Date;
    primeraRespuestaAt?: Date;
    primeraRespuestaVencida?: boolean;
    deletedAt?: Date;
    slaRegla?: string;
    slaMetaS?: number;
    slaRelojVersion?: number;
    slaRelojPendiente?: boolean;
  }): Promise<string> {
    const { estado, ...resto } = data;
    const ticket = await client.ticket.create({
      data: {
        numero: `${PREFIJO}-${randomBytes(3).toString('hex')}`,
        titulo: 'Ticket WU-3c',
        tipoId,
        estadoId: estados[estado],
        prioridadId,
        solicitanteId: USUARIO,
        ...resto,
      },
    });
    propios.add(ticket.id);
    return ticket.id;
  }

  async function transicion(ticketId: string, de: string, a: string, createdAt: Date, seq: number) {
    await client.operacionTicket.create({
      data: {
        ticketId,
        tipoOperacionId: tipoOpId,
        autorId: USUARIO,
        estadoAnteriorId: estados[de],
        estadoNuevoId: estados[a],
        createdAt,
        slaRelojSeq: seq,
      },
    });
  }

  it('[CRITICAL] huérfano de pausa con dos listeners caídos: reconcilia pausa, reanudación y pausa antes de evaluar, y el ticket en espera no se marca', async () => {
    const ahora = Date.now();
    const inicio = new Date(ahora - 72 * H);
    const id = await crearTicket({
      estado: 'ESPERANDO_CLIENTE',
      slaVenceAt: new Date(ahora - 24 * H),
      slaAcumuladoS: 0,
      slaCorreDesde: inicio,
      slaRegla: 'CORRIDO',
      slaMetaS: 10 * 3600,
      slaRelojVersion: 3,
      slaRelojPendiente: true,
    });
    await transicion(id, 'EN_PROCESO', 'ESPERANDO_CLIENTE', new Date(ahora - 62 * H), 1);
    await transicion(id, 'ESPERANDO_CLIENTE', 'EN_PROCESO', new Date(ahora - 50 * H), 2);
    await transicion(id, 'EN_PROCESO', 'ESPERANDO_CLIENTE', new Date(ahora - 48 * H), 3);

    expect(await barrido().execute()).toBe(0);

    const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({
      slaAcumuladoS: 12 * 3600,
      slaRelojPendiente: false,
      vencido: false,
    });
    expect(fila.slaCorreDesde).toBeNull();
    expect(notificados(id)).toBe(0);
  });

  it('[CRITICAL] huérfano reanudado: el vencimiento viejo no lo marca, el pliegue lo deriva hacia adelante', async () => {
    const ahora = Date.now();
    const id = await crearTicket({
      estado: 'EN_PROCESO',
      slaVenceAt: new Date(ahora - 30 * H),
      slaAcumuladoS: 0,
      slaCorreDesde: new Date(ahora - 48 * H),
      slaRegla: 'CORRIDO',
      slaMetaS: 10 * 3600,
      slaRelojVersion: 2,
      slaRelojPendiente: true,
    });
    await transicion(id, 'EN_PROCESO', 'ESPERANDO_CLIENTE', new Date(ahora - 40 * H), 1);
    await transicion(id, 'ESPERANDO_CLIENTE', 'EN_PROCESO', new Date(ahora - 1 * H), 2);

    expect(await barrido().execute()).toBe(0);

    const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.slaRelojPendiente).toBe(false);
    expect(fila.vencido).toBe(false);
    // 8 h activas antes de la pausa + meta 10 h: quedan 2 h desde la reanudación (hace 1 h).
    expect(fila.slaVenceAt?.getTime()).toBeCloseTo(ahora + 1 * H, -4);
    expect(notificados(id)).toBe(0);
  });

  it('[CRITICAL] un previo corriendo se marca por estado aunque sla_corre_desde sea NULL, y se notifica una vez', async () => {
    const id = await crearTicket({
      estado: 'EN_PROCESO',
      slaVenceAt: new Date(Date.now() - 2 * H),
      slaAcumuladoS: null,
      slaCorreDesde: null,
    });

    expect(await barrido().execute()).toBe(1);
    expect(await barrido().execute()).toBe(0);

    expect((await client.ticket.findUniqueOrThrow({ where: { id } })).vencido).toBe(true);
    expect(notificados(id)).toBe(1);
  });

  it('un ticket en ESPERANDO_CLIENTE con vencimiento pasado no se marca ni se notifica', async () => {
    const id = await crearTicket({
      estado: 'ESPERANDO_CLIENTE',
      slaVenceAt: new Date(Date.now() - 2 * H),
      slaAcumuladoS: 3 * 3600,
      slaCorreDesde: null,
    });

    expect(await barrido().execute()).toBe(0);

    expect((await client.ticket.findUniqueOrThrow({ where: { id } })).vencido).toBe(false);
    expect(notificados(id)).toBe(0);
  });

  describe('primera respuesta (WU-7, sla-primera-respuesta R4)', () => {
    const vencida = () => new Date(Date.now() - 2 * H);

    it('[CRITICAL] marca y notifica una vez; un segundo barrido no re-notifica', async () => {
      const id = await crearTicket({ estado: 'EN_PROCESO', primeraRespuestaVenceAt: vencida() });

      await barrido().execute();
      await barrido().execute();

      expect(
        (await client.ticket.findUniqueOrThrow({ where: { id } })).primeraRespuestaVencida,
      ).toBe(true);
      expect(primerasVencidas(id)).toBe(1);
    });

    it('[CRITICAL] la primera respuesta no se pausa: ESPERANDO_CLIENTE sin respuesta se marca y notifica', async () => {
      const id = await crearTicket({
        estado: 'ESPERANDO_CLIENTE',
        primeraRespuestaVenceAt: vencida(),
        slaRelojPendiente: true,
      });

      await barrido().execute();

      expect(primerasVencidas(id)).toBe(1);
    });

    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'] as const)(
      'excluye el estado %s',
      async (estado) => {
        const id = await crearTicket({ estado, primeraRespuestaVenceAt: vencida() });

        await barrido().execute();

        expect(primerasVencidas(id)).toBe(0);
        expect(
          (await client.ticket.findUniqueOrThrow({ where: { id } })).primeraRespuestaVencida,
        ).toBe(false);
      },
    );

    it('excluye al ya respondido, al ya marcado, al borrado, al que aún no venció y al sin meta', async () => {
      const ids = [
        await crearTicket({
          estado: 'EN_PROCESO',
          primeraRespuestaVenceAt: vencida(),
          primeraRespuestaAt: new Date(Date.now() - 3 * H),
        }),
        await crearTicket({
          estado: 'EN_PROCESO',
          primeraRespuestaVenceAt: vencida(),
          primeraRespuestaVencida: true,
        }),
        await crearTicket({
          estado: 'EN_PROCESO',
          primeraRespuestaVenceAt: vencida(),
          deletedAt: new Date(),
        }),
        await crearTicket({
          estado: 'EN_PROCESO',
          primeraRespuestaVenceAt: new Date(Date.now() + 2 * H),
        }),
        await crearTicket({ estado: 'EN_PROCESO' }),
      ];

      await barrido().execute();

      expect(ids.map(primerasVencidas)).toEqual([0, 0, 0, 0, 0]);
    });

    it('el CAS no marca a un ticket que recibió respuesta entre la lectura y la marca', async () => {
      const id = await crearTicket({ estado: 'EN_PROCESO', primeraRespuestaVenceAt: vencida() });
      await client.ticket.update({ where: { id }, data: { primeraRespuestaAt: new Date() } });

      expect(await queryRepo.marcarPrimeraRespuestaVencida(id)).toBe(false);
    });

    it('no toca el marcado de resolución: `vencido` queda como estaba', async () => {
      const id = await crearTicket({ estado: 'EN_PROCESO', primeraRespuestaVenceAt: vencida() });

      expect(await barrido().execute()).toBe(0);

      expect((await client.ticket.findUniqueOrThrow({ where: { id } })).vencido).toBe(false);
    });
  });
});
