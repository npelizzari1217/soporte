/**
 * [INTEGRATION] Las escrituras manuales del ticket no pisan un estado recién escrito
 * (odd/escrituras-manuales-con-lock, S5), contra Postgres REAL en una base de INQUILINO EFÍMERA.
 *
 * La carrera se reproduce de forma determinista: el repositorio que recibe el caso de uso manual
 * devuelve la PRIMERA lectura del ticket, pero antes deja que, por debajo, alguien complete la última
 * tarea (el ticket pasa a RESUELTO por odd/estado-por-tareas). El caso de uso sigue con una lectura
 * vieja; su transacción bloquea la fila, relee y decide sobre el estado real. Antes del cambio, el
 * guardado de la fila entera devolvía el ticket al estado viejo sin error.
 *
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaSectorRepository } from '../../../sectores/infrastructure/persistence/prisma/prisma-sector.repository';
import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import {
  TicketBloqueadoParaEdicionError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { PrismaEstadoRepository } from '../../infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaPrioridadRepository } from '../../infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaRelojSlaMarcador } from '../../infrastructure/persistence/prisma/prisma-reloj-sla-marcador';
import { PrismaTareaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { AvanzarEstadoPorTareasService } from '../services/avanzar-estado-por-tareas.service';
import { ActorTarea } from '../services/tareas-ticket.reglas';
import { AsignarTicketUseCase } from './asignar-ticket.use-case';
import { AsignarYPonerEnProcesoUseCase } from './asignar-y-poner-en-proceso.use-case';
import { CompletarTareaUseCase } from './completar-tarea.use-case';
import { EditarTicketUseCase } from './editar-ticket.use-case';
import { TransicionarEstadoUseCase } from './transicionar-estado.use-case';
import { Result } from '../../../shared/domain/result';

// odd/ticket-cerrado-solo-lectura tiene su propio spec unitario; acá el ticket siempre es editable.
const siempreEditable = { verificar: async () => Result.ok(undefined) };

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_escrituras_lock_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'cliente-escrituras-lock';
const SOLICITANTE = '01900000-0000-7000-8000-000000000501';
const RESPONSABLE = '01900000-0000-7000-8000-000000000502';
const TECNICO = '01900000-0000-7000-8000-000000000503';
const OTRO = '01900000-0000-7000-8000-000000000504';

const ESTADOS = [
  'NUEVO',
  'ASIGNADO',
  'EN_PROCESO',
  'ESPERANDO_CLIENTE',
  'RESUELTO',
  'CERRADO',
  'CANCELADO',
];
const TIPOS_OPERACION = ['ASIGNACION', 'CAMBIO_ESTADO'];

const tecnico: ActorTarea = {
  id: TECNICO,
  esAdministrador: false,
  tienePermisoVerTodos: true,
  modulosConModificacion: ['TICKETS'],
};

describe('Las escrituras manuales no pisan un estado recién escrito (S5, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const ticketRepo = new PrismaTicketRepository(tenantContext);
  const tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
  const tareaRepo = new PrismaTareaTicketRepository(tenantContext);
  const operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
  const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
  const estadoRepo = new PrismaEstadoRepository(tenantContext);
  const prioridadRepo = new PrismaPrioridadRepository(tenantContext);
  const sectorRepo = new PrismaSectorRepository(tenantContext);
  const relojMarcador = new PrismaRelojSlaMarcador(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => undefined });
  const eventPublisher = { publish: (_e: DomainEvent) => undefined };
  const stateMachineFactory = new TicketStateMachineFactory();
  const usuarioMasterChecker = {
    estaActivoEnTenant: async () => true,
    getAutorizacionModulos: async () => ({ esAdminTotal: true, modulos: [] as string[] }),
  };
  const estadoIds = new Map<string, string>();
  let tipoId: string;
  let prioridadId: string;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, fn);

  const avanzarEstado = new AvanzarEstadoPorTareasService(
    ticketRepo,
    tareaRepo,
    operacionRepo,
    estadoRepo,
    tipoTicketRepo,
    tipoOperacionRepo,
    stateMachineFactory,
    relojMarcador,
    eventPublisher,
    txRunner,
  );
  const completar = new CompletarTareaUseCase(
    ticketRepo,
    tareaRepo,
    operacionRepo,
    tipoOperacionRepo,
    txRunner,
    avanzarEstado,
    siempreEditable,
  );

  /**
   * El repositorio real, salvo que la PRIMERA llamada a `metodo` corre `porDebajo` —en su propia
   * transacción— entre la llamada y la devolución. Con `findById`, el caso de uso se queda con el
   * ticket tal como estaba antes de que otro actor lo cambiara (la lectura previa a la transacción,
   * en asignar y asignar-en-proceso). Con `bloquear`, el otro actor gana la carrera justo antes del
   * lock (transicionar y editar ya no leen nada antes de bloquear): la relectura tiene que verlo.
   */
  function repoConCarrera(
    metodo: 'findById' | 'bloquear',
    porDebajo: () => Promise<unknown>,
  ): PrismaTicketRepository {
    let yaCorrio = false;
    return new Proxy(ticketRepo, {
      get(target, prop, receiver) {
        if (prop !== metodo) return Reflect.get(target, prop, receiver);
        return async (id: string) => {
          if (metodo === 'bloquear') {
            if (!yaCorrio) {
              yaCorrio = true;
              await porDebajo();
            }
            return target.bloquear(id);
          }
          const leido = await target.findById(id);
          if (!yaCorrio) {
            yaCorrio = true;
            await porDebajo();
          }
          return leido;
        };
      },
    });
  }

  function idDeEstado(codigo: string): string {
    const id = estadoIds.get(codigo);
    if (!id) throw new Error(`El spec no sembró el estado ${codigo}`);
    return id;
  }

  /** Ticket en `estado` con una única tarea pendiente del técnico: completarla lo resuelve. */
  async function ticketConUltimaTarea(
    estado: string,
  ): Promise<{ ticketId: string; tareaId: string }> {
    const ticket = await client.ticket.create({
      data: {
        numero: `LCK-${randomBytes(3).toString('hex')}`,
        titulo: 'Titulo original',
        tipoId,
        estadoId: idDeEstado(estado),
        prioridadId,
        solicitanteId: SOLICITANTE,
        asignadoId: RESPONSABLE,
      },
    });
    const tarea = TareaTicketEntity.crear({
      ticketId: ticket.id,
      descripcion: 'Ultima tarea',
      orden: 0,
      tecnicoId: TECNICO,
    });
    await enTenant(() => tareaRepo.crear(tarea));
    return { ticketId: ticket.id, tareaId: tarea.id };
  }

  /** Resuelve el ticket por tareas en una transacción propia, fuera de la del caso de uso manual. */
  const resolverPorDebajo = (ticketId: string, tareaId: string) => () =>
    enTenant(async () => {
      const r = await completar.execute({ ticketId, tareaId, actor: tecnico });
      if (r.isFail()) throw new Error(`No se pudo resolver por debajo: ${r.getError().message}`);
    });

  async function estadoDelTicket(ticketId: string) {
    const fila = await client.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { estado: true },
    });
    return {
      codigo: fila.estado.codigo,
      asignadoId: fila.asignadoId,
      fechaCierre: fila.fechaCierre,
      titulo: fila.titulo,
    };
  }

  async function codigosDeCambioDeEstado(ticketId: string): Promise<string[]> {
    const operaciones = await client.operacionTicket.findMany({
      where: { ticketId, tipoOperacion: { codigo: 'CAMBIO_ESTADO' } },
      include: { estadoNuevo: true },
      orderBy: { createdAt: 'asc' },
    });
    return operaciones.map((o) => o.estadoNuevo?.codigo ?? '?');
  }

  async function limpiarFilas(): Promise<void> {
    await client.operacionTicket.deleteMany();
    await client.tareaTicket.deleteMany();
    await client.ticket.deleteMany();
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);

    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: 'T-ESCRITURAS-LOCK', nombre: 'Soporte', modulo: 'TICKETS' },
      })
    ).id;
    prioridadId = (
      await client.prioridad.create({ data: { codigo: 'P-ESCRITURAS-LOCK', nombre: 'Media' } })
    ).id;
    for (const codigo of ESTADOS) {
      const estado = await client.estado.upsert({
        where: { codigo },
        update: {},
        create: { codigo, nombre: codigo },
      });
      estadoIds.set(codigo, estado.id);
    }
    for (const codigo of TIPOS_OPERACION) {
      await client.tipoOperacion.upsert({
        where: { codigo },
        update: {},
        create: { codigo, nombre: codigo },
      });
    }
  }, 120_000);

  afterAll(async () => {
    try {
      await limpiarFilas();
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

  beforeEach(limpiarFilas);

  it('transicionar (EN_PROCESO → ESPERANDO_CLIENTE) cuando otro resuelve justo antes del lock se rechaza y el ticket sigue RESUELTO', async () => {
    const { ticketId, tareaId } = await ticketConUltimaTarea('EN_PROCESO');
    const useCase = new TransicionarEstadoUseCase(
      repoConCarrera('bloquear', resolverPorDebajo(ticketId, tareaId)),
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      stateMachineFactory,
      eventPublisher,
      txRunner,
      relojMarcador,
    );

    const resultado = await enTenant(() =>
      useCase.execute({
        ticketId,
        nuevoEstadoCodigo: 'ESPERANDO_CLIENTE',
        autorId: RESPONSABLE,
        actorEsCorrector: false,
      }),
    );

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(TransicionInvalidaError);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('RESUELTO');
    expect(ticket.fechaCierre).not.toBeNull();
    expect(await codigosDeCambioDeEstado(ticketId)).toEqual(['RESUELTO']);
  });

  it('editar como no ROOT cuando otro resuelve justo antes del lock se rechaza y el título no cambia', async () => {
    const { ticketId, tareaId } = await ticketConUltimaTarea('NUEVO');
    const useCase = new EditarTicketUseCase(
      repoConCarrera('bloquear', resolverPorDebajo(ticketId, tareaId)),
      prioridadRepo,
      estadoRepo,
      eventPublisher,
      sectorRepo,
      txRunner,
    );

    const resultado = await enTenant(() =>
      useCase.execute({ ticketId, titulo: 'Titulo pisado', actorEsRoot: false }),
    );

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(TicketBloqueadoParaEdicionError);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('RESUELTO');
    expect(ticket.titulo).toBe('Titulo original');
  });

  it('asignar con lectura vieja (NUEVO) cambia el responsable y conserva RESUELTO, sin CAMBIO_ESTADO a ASIGNADO', async () => {
    const { ticketId, tareaId } = await ticketConUltimaTarea('NUEVO');
    const useCase = new AsignarTicketUseCase(
      repoConCarrera('findById', resolverPorDebajo(ticketId, tareaId)),
      operacionRepo,
      usuarioMasterChecker,
      tipoTicketRepo,
      tipoOperacionRepo,
      txRunner,
      estadoRepo,
      eventPublisher,
    );

    const resultado = await enTenant(() =>
      useCase.execute({ ticketId, asignadoId: OTRO, clienteId: CLIENTE_ID, autorId: RESPONSABLE }),
    );

    expect(resultado.isOk()).toBe(true);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('RESUELTO');
    expect(ticket.asignadoId).toBe(OTRO);
    expect(ticket.fechaCierre).not.toBeNull();
    // Los tres arcos de la resolución por tareas; ninguno NUEVO → ASIGNADO de la asignación manual.
    expect(await codigosDeCambioDeEstado(ticketId)).toEqual(['ASIGNADO', 'EN_PROCESO', 'RESUELTO']);
  });

  it('asignar y poner en proceso con lectura vieja (NUEVO) se rechaza y el ticket sigue RESUELTO', async () => {
    const { ticketId, tareaId } = await ticketConUltimaTarea('NUEVO');
    const useCase = new AsignarYPonerEnProcesoUseCase(
      repoConCarrera('findById', resolverPorDebajo(ticketId, tareaId)),
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      stateMachineFactory,
      txRunner,
      eventPublisher,
    );

    const resultado = await enTenant(() =>
      useCase.execute({ ticketId, asignadoId: OTRO, autorId: RESPONSABLE, clienteId: CLIENTE_ID }),
    );

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(TransicionInvalidaError);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('RESUELTO');
    expect(ticket.asignadoId).toBe(RESPONSABLE);
    expect(await codigosDeCambioDeEstado(ticketId)).toEqual(['ASIGNADO', 'EN_PROCESO', 'RESUELTO']);
  });
});
