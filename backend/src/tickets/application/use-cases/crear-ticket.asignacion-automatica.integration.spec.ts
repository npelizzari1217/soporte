/**
 * [INTEGRATION] Alta con regla de asignación automática contra Postgres REAL (DB tenant efímera,
 * migrada y sembrada). sdd/asignacion-automatica-por-tipo: A1 (nace ASIGNADO), A3 (bitácora del
 * sistema), A7 (atómica con el alta), A9 (el SLA no cambia), N1 (el evento sale después del commit).
 *
 * `listarTecnicosAsignables` es un doble: este spec no puebla master. Solo se borra la regla creada.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  DomainEvent,
  IDomainEventPublisher,
} from '../../../shared/domain/ports/i-domain-event-publisher';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../../../clientes/infrastructure/tenant-seeder.adapter';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaEstadoRepository } from '../../infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PrismaPrioridadRepository } from '../../infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaCicloClienteRepository } from '../../infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { PrismaReglaAsignacionRepository } from '../../infrastructure/persistence/prisma/prisma-regla-asignacion.repository';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import { AUTOR_SISTEMA } from '../../domain/constants/autor-sistema.constants';
import { ESTADOS_RELOJ_CORRE } from '../../domain/state-machine/estados.constants';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ResolverCicloActivoParaCreacion } from '../services/resolver-ciclo-activo.service';
import { ResolverAsignacionAutomatica } from '../services/resolver-asignacion-automatica.service';
import { CrearTicketUseCase } from './crear-ticket.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_DB_NAME = `soporte_prov_asigAutoE2E_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'asig-auto-e2e-cliente';
const SOLICITANTE = '01900000-0000-7000-8000-000000000101';
const RESPONSABLE = '01900000-0000-7000-8000-000000000102';

class RecordingPublisher implements IDomainEventPublisher {
  readonly publicados: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.publicados.push(event);
  }
}

describe('CrearTicketUseCase con regla de asignación — integración (A1, A3, A7, A9, N1)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let reglaRepo: PrismaReglaAsignacionRepository;
  let operacionRepo: PrismaOperacionTicketRepository;
  let useCase: CrearTicketUseCase;
  let publisher: RecordingPublisher;
  let ids: { tipo: string; prioridad: string; asignado: string; nuevo: string; asignacion: string };
  let contador = 0;

  const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: TENANT_DB_NAME, clienteId: CLIENTE_ID }, fn);

  const crear = (titulo: string) =>
    withTenant(() =>
      useCase.execute({
        titulo,
        tipoId: ids.tipo,
        prioridadId: ids.prioridad,
        solicitanteId: SOLICITANTE,
        clienteId: CLIENTE_ID,
        autorId: SOLICITANTE,
        anio: 2026,
      }),
    );

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_DB_NAME);
    tenantContext = new TenantContext();

    const ticketRepo = new PrismaTicketRepository(tenantContext);
    const estadoRepo = new PrismaEstadoRepository(tenantContext);
    const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
    operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
    reglaRepo = new PrismaReglaAsignacionRepository(tenantContext);
    publisher = new RecordingPublisher();
    const checker: IUsuarioMasterChecker = {
      existeEnTenant: async () => true,
      estaActivoEnTenant: async () => true,
      resolverNombres: async () => new Map(),
      getAutorizacionModulos: async () => ({ esAdminTotal: false, modulos: [] }),
      listarTecnicosAsignables: async () => [{ id: RESPONSABLE, nombre: 'Tina', apellido: 'T' }],
    };
    useCase = new CrearTicketUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      new PrismaTipoTicketRepository(tenantContext),
      new PrismaPrioridadRepository(tenantContext),
      tipoOperacionRepo,
      checker,
      new NumeradorTicket(ticketRepo),
      new ResolverCicloActivoParaCreacion(new PrismaCicloClienteRepository(tenantContext)),
      new ResolverAsignacionAutomatica(reglaRepo, checker, estadoRepo, tipoOperacionRepo, {
        log: () => {},
        error: () => {},
      }),
      publisher,
      new PrismaTenantTransactionRunner(tenantContext, { error: () => {} }),
    );

    const porCodigo = async <T extends { id: string }>(q: Promise<T>) => (await q).id;
    ids = {
      tipo: await porCodigo(client.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } })),
      prioridad: await porCodigo(
        client.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } }),
      ),
      asignado: await porCodigo(client.estado.findUniqueOrThrow({ where: { codigo: 'ASIGNADO' } })),
      nuevo: await porCodigo(client.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } })),
      asignacion: await porCodigo(
        client.tipoOperacion.findUniqueOrThrow({ where: { codigo: 'ASIGNACION' } }),
      ),
    };
    await client.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'Asignacion automatica E2E',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });
  }, 60_000);

  afterEach(async () => {
    publisher.publicados.length = 0;
    await withTenant(() => reglaRepo.quitar(ids.tipo));
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 30_000);

  it('con regla: nace ASIGNADO, apertura null→ASIGNADO del solicitante y ASIGNACION de AUTOR_SISTEMA', async () => {
    await withTenant(() => reglaRepo.fijar(ids.tipo, RESPONSABLE, SOLICITANTE));

    const ticket = (await crear(`AAT con regla ${++contador}`)).getValue();

    const fila = await client.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(fila.estadoId).toBe(ids.asignado);
    expect(fila.asignadoId).toBe(RESPONSABLE);
    const ops = await client.operacionTicket.findMany({ where: { ticketId: ticket.id } });
    expect(ops).toHaveLength(2);
    const apertura = ops.find((o) => o.tipoOperacionId !== ids.asignacion);
    const asignacion = ops.find((o) => o.tipoOperacionId === ids.asignacion);
    expect(apertura).toMatchObject({
      estadoAnteriorId: null,
      estadoNuevoId: ids.asignado,
      autorId: SOLICITANTE,
    });
    expect(asignacion).toMatchObject({
      autorId: AUTOR_SISTEMA,
      esInterno: false,
      metadata: { origen: 'REGLA_TIPO', tipoId: ids.tipo, asignadoId: RESPONSABLE },
    });
    expect(publisher.publicados.map((e) => e.name)).toEqual(['ticket.creado', 'ticket.asignado']);
  });

  it('sin regla: nace NUEVO, sin asignado y con una sola operación (idéntico a hoy)', async () => {
    const ticket = (await crear(`AAT sin regla ${++contador}`)).getValue();

    const fila = await client.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(fila.estadoId).toBe(ids.nuevo);
    expect(fila.asignadoId).toBeNull();
    expect(await client.operacionTicket.count({ where: { ticketId: ticket.id } })).toBe(1);
    expect(publisher.publicados.map((e) => e.name)).toEqual(['ticket.creado']);
  });

  it('atomicidad: si falla el save de la ASIGNACION no quedan ni ticket ni operaciones, ni eventos', async () => {
    await withTenant(() => reglaRepo.fijar(ids.tipo, RESPONSABLE, SOLICITANTE));
    const titulo = `AAT atomica ${++contador}`;
    const original = operacionRepo.save.bind(operacionRepo);
    const spy = vi.spyOn(operacionRepo, 'save').mockImplementation(async (op) => {
      if (op.tipoOperacionId === ids.asignacion) throw new Error('save forzado a fallar');
      return original(op);
    });

    try {
      await expect(crear(titulo)).rejects.toThrow('save forzado a fallar');
    } finally {
      spy.mockRestore();
    }

    expect(await client.ticket.count({ where: { titulo } })).toBe(0);
    expect(publisher.publicados).toHaveLength(0);
  });

  it('A9: un ticket nacido ASIGNADO corre el reloj igual y no marca primera respuesta', async () => {
    await withTenant(() => reglaRepo.fijar(ids.tipo, RESPONSABLE, SOLICITANTE));
    const conRegla = (await crear(`AAT sla ${++contador}`)).getValue();
    await withTenant(() => reglaRepo.quitar(ids.tipo));
    const sinRegla = (await crear(`AAT sla ${++contador}`)).getValue();

    expect(ESTADOS_RELOJ_CORRE.has('ASIGNADO')).toBe(true);
    const [a, b] = await Promise.all(
      [conRegla, sinRegla].map((t) => client.ticket.findUniqueOrThrow({ where: { id: t.id } })),
    );
    expect(a.slaCorreDesde).not.toBeNull();
    expect(a.slaAcumuladoS).toBe(b.slaAcumuladoS);
    expect(a.slaRelojVersion).toBe(b.slaRelojVersion);
    expect(a.primeraRespuestaAt).toBeNull();
    expect(a.slaMetaPendiente).toBe(b.slaMetaPendiente);
  });
});
