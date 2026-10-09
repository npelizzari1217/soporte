/**
 * [INTEGRATION] Regla de asignación automática en los canales Soporte, formulario público y
 * Edilicia, y el alta de `POST /tickets` con la membresía del responsable dada de baja, contra
 * Postgres REAL (DB tenant efímera, migrada y sembrada). sdd/asignacion-automatica-por-tipo:
 * A1, A3, A4, A6, A7, N1.
 *
 * No levanta HTTP: prueba los casos de uso sobre la base real (mismo cableado que los módulos).
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
import { PrismaTicketSoporteRepository } from '../../../equipos/infrastructure/persistence/prisma/prisma-ticket-soporte.repository';
import { PrismaEquipoInformaticoRepository } from '../../../equipos/infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaTicketEdiliciaRepository } from '../../../reparaciones/infrastructure/persistence/prisma/prisma-ticket-edilicia.repository';
import { CrearTicketSoporteUseCase } from '../../../equipos/application/use-cases/crear-ticket-soporte.use-case';
import { CrearTicketEdilicioUseCase } from '../../../reparaciones/application/use-cases/crear-ticket-edilicio.use-case';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import { AUTOR_SISTEMA } from '../../domain/constants/autor-sistema.constants';
import { AUTOR_FORMULARIO_PUBLICO } from '../../domain/constants/formulario-publico.constants';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ResolverCicloActivoParaCreacion } from '../services/resolver-ciclo-activo.service';
import { ResolverAsignacionAutomatica } from '../services/resolver-asignacion-automatica.service';
import { CrearTicketUseCase } from './crear-ticket.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_DB_NAME = `soporte_prov_asigCanales_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'asig-canales-cliente';
const SOLICITANTE = '01900000-0000-7000-8000-000000000201';
const RESPONSABLE = '01900000-0000-7000-8000-000000000202';

class RecordingPublisher implements IDomainEventPublisher {
  readonly publicados: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.publicados.push(event);
  }
}

describe('Regla de asignación en Soporte, formulario público, Edilicia y POST /tickets — integración (A1, A3, A4, A6, A7)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let reglaRepo: PrismaReglaAsignacionRepository;
  let operacionRepo: PrismaOperacionTicketRepository;
  let soporte: CrearTicketSoporteUseCase;
  let edilicio: CrearTicketEdilicioUseCase;
  let general: CrearTicketUseCase;
  let publisher: RecordingPublisher;
  let tecnicos: { id: string; nombre: string; apellido: string }[];
  let ids: {
    soporte: string;
    edilicia: string;
    prioridad: string;
    asignado: string;
    nuevo: string;
    asignacion: string;
    externo: string;
  };
  let contador = 0;

  const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: TENANT_DB_NAME, clienteId: CLIENTE_ID }, fn);

  const base = (titulo: string) => ({
    titulo,
    prioridadId: ids.prioridad,
    clienteId: CLIENTE_ID,
    anio: 2026,
  });

  const fijarRegla = (tipoId: string) =>
    withTenant(() => reglaRepo.fijar(tipoId, RESPONSABLE, SOLICITANTE));

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_DB_NAME);
    tenantContext = new TenantContext();

    const ticketRepo = new PrismaTicketRepository(tenantContext);
    const estadoRepo = new PrismaEstadoRepository(tenantContext);
    const tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
    const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
    const cicloResolver = new ResolverCicloActivoParaCreacion(
      new PrismaCicloClienteRepository(tenantContext),
    );
    const numerador = new NumeradorTicket(ticketRepo);
    const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
    reglaRepo = new PrismaReglaAsignacionRepository(tenantContext);
    publisher = new RecordingPublisher();
    tecnicos = [{ id: RESPONSABLE, nombre: 'Tina', apellido: 'T' }];
    const checker: IUsuarioMasterChecker = {
      existeEnTenant: async () => true,
      estaActivoEnTenant: async () => true,
      resolverNombres: async () => new Map(),
      getAutorizacionModulos: async () => ({ esAdminTotal: false, modulos: [] }),
      listarTecnicosAsignables: async () => tecnicos,
    };
    const resolver = new ResolverAsignacionAutomatica(
      reglaRepo,
      checker,
      estadoRepo,
      tipoOperacionRepo,
      { log: () => {}, error: () => {} },
    );
    general = new CrearTicketUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      new PrismaPrioridadRepository(tenantContext),
      tipoOperacionRepo,
      checker,
      numerador,
      cicloResolver,
      resolver,
      publisher,
      txRunner,
    );
    soporte = new CrearTicketSoporteUseCase(
      ticketRepo,
      operacionRepo,
      new PrismaTicketSoporteRepository(tenantContext),
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      checker,
      numerador,
      cicloResolver,
      resolver,
      new PrismaEquipoInformaticoRepository(tenantContext),
      publisher,
      txRunner,
    );
    edilicio = new CrearTicketEdilicioUseCase(
      ticketRepo,
      operacionRepo,
      new PrismaTicketEdiliciaRepository(tenantContext),
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      checker,
      numerador,
      cicloResolver,
      resolver,
      publisher,
      txRunner,
    );

    const idDe = async <T extends { id: string }>(q: Promise<T>) => (await q).id;
    ids = {
      soporte: await idDe(client.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } })),
      edilicia: await idDe(client.tipoTicket.findUniqueOrThrow({ where: { codigo: 'EDILICIA' } })),
      prioridad: await idDe(client.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } })),
      asignado: await idDe(client.estado.findUniqueOrThrow({ where: { codigo: 'ASIGNADO' } })),
      nuevo: await idDe(client.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } })),
      asignacion: await idDe(
        client.tipoOperacion.findUniqueOrThrow({ where: { codigo: 'ASIGNACION' } }),
      ),
      externo: await idDe(
        client.solicitanteExterno.create({
          data: {
            nombre: 'Ana Externa',
            email: 'ana-canales@example.com',
            emailVerificadoAt: new Date(),
          },
        }),
      ),
    };
    await client.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000002',
        nombre: 'Asignacion canales',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });
  }, 60_000);

  afterEach(async () => {
    publisher.publicados.length = 0;
    tecnicos = [{ id: RESPONSABLE, nombre: 'Tina', apellido: 'T' }];
    await withTenant(() => reglaRepo.quitar(ids.soporte));
    await withTenant(() => reglaRepo.quitar(ids.edilicia));
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 30_000);

  async function verificarNacidoAsignado(ticketId: string, autorApertura: string) {
    const fila = await client.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(fila.estadoId).toBe(ids.asignado);
    expect(fila.asignadoId).toBe(RESPONSABLE);
    const ops = await client.operacionTicket.findMany({ where: { ticketId } });
    expect(ops).toHaveLength(2);
    expect(ops.find((o) => o.tipoOperacionId !== ids.asignacion)).toMatchObject({
      estadoAnteriorId: null,
      estadoNuevoId: ids.asignado,
      autorId: autorApertura,
    });
    expect(ops.find((o) => o.tipoOperacionId === ids.asignacion)).toMatchObject({
      autorId: AUTOR_SISTEMA,
      metadata: { origen: 'REGLA_TIPO', asignadoId: RESPONSABLE },
    });
    expect(publisher.publicados.map((e) => e.name)).toEqual(['ticket.creado', 'ticket.asignado']);
  }

  it('Soporte con regla: nace ASIGNADO, apertura del solicitante y ASIGNACION de AUTOR_SISTEMA', async () => {
    await fijarRegla(ids.soporte);

    const r = await withTenant(() =>
      soporte.execute({
        ...base(`CAN soporte ${++contador}`),
        solicitanteId: SOLICITANTE,
        autorId: SOLICITANTE,
      }),
    );

    await verificarNacidoAsignado(r.getValue().ticket.id, SOLICITANTE);
  });

  it('formulario público con regla: la apertura conserva AUTOR_FORMULARIO_PUBLICO y la ASIGNACION es del sistema', async () => {
    await fijarRegla(ids.soporte);

    const r = await withTenant(() =>
      soporte.execute({
        ...base(`CAN publico ${++contador}`),
        solicitanteExternoId: ids.externo,
        autorId: AUTOR_FORMULARIO_PUBLICO,
      }),
    );

    await verificarNacidoAsignado(r.getValue().ticket.id, AUTOR_FORMULARIO_PUBLICO);
  });

  it('Edilicia con regla: nace ASIGNADO con apertura y ASIGNACION de AUTOR_SISTEMA', async () => {
    await fijarRegla(ids.edilicia);

    const r = await withTenant(() =>
      edilicio.execute({
        ...base(`CAN edilicia ${++contador}`),
        solicitanteId: SOLICITANTE,
        autorId: SOLICITANTE,
      }),
    );

    await verificarNacidoAsignado(r.getValue().ticket.id, SOLICITANTE);
  });

  it('A7 Soporte: si falla el save de la ASIGNACION no quedan ticket, operaciones ni eventos (ROLLBACK)', async () => {
    await fijarRegla(ids.soporte);
    const titulo = `CAN rollback ${++contador}`;
    const antes = await client.operacionTicket.count();
    const spy = vi.spyOn(operacionRepo, 'save').mockImplementation(async (op) => {
      if (op.tipoOperacionId === ids.asignacion) throw new Error('save forzado a fallar');
    });

    try {
      await expect(
        withTenant(() =>
          soporte.execute({ ...base(titulo), solicitanteId: SOLICITANTE, autorId: SOLICITANTE }),
        ),
      ).rejects.toThrow('save forzado a fallar');
    } finally {
      spy.mockRestore();
    }

    expect(await client.ticket.count({ where: { titulo } })).toBe(0);
    expect(await client.operacionTicket.count()).toBe(antes);
    expect(publisher.publicados).toHaveLength(0);
  });

  it('A4 POST /tickets: con la membresía del responsable dada de baja el alta responde ok, NUEVO y sin asignado', async () => {
    await fijarRegla(ids.soporte);
    tecnicos = [];

    const r = await withTenant(() =>
      general.execute({
        ...base(`CAN baja ${++contador}`),
        tipoId: ids.soporte,
        solicitanteId: SOLICITANTE,
        autorId: SOLICITANTE,
      }),
    );

    const fila = await client.ticket.findUniqueOrThrow({ where: { id: r.getValue().id } });
    expect(fila.estadoId).toBe(ids.nuevo);
    expect(fila.asignadoId).toBeNull();
    expect(await client.operacionTicket.count({ where: { ticketId: fila.id } })).toBe(1);
    expect(publisher.publicados.map((e) => e.name)).toEqual(['ticket.creado']);
  });
});
