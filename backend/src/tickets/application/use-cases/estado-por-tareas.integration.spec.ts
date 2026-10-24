/**
 * [INTEGRATION] El estado del ticket sigue a sus tareas (odd/estado-por-tareas, S5-S6), contra
 * Postgres REAL en una base de INQUILINO EFÍMERA, con los repositorios Prisma reales y el servicio
 * `AvanzarEstadoPorTareasService` cableado como en `TicketsModule`.
 *
 * - Carrera real: las dos últimas tareas se completan en paralelo (dos transacciones de verdad).
 *   El lock de la fila del ticket serializa las dos, y el ticket queda RESUELTO una sola vez, con
 *   un solo CAMBIO_ESTADO a RESUELTO.
 * - Descompletar en RESUELTO vuelve a EN_PROCESO y limpia `fecha_cierre`.
 * - Si falla el cambio de estado, la tarea no queda completada (misma transacción).
 * - Completar en NUEVO sin responsable asigna solo a un agente del tipo: un ADMINISTRADOR deja el
 *   ticket sin responsable. Los permisos por tipo son los del tenant real; master es un doble.
 *
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { PrismaEstadoRepository } from '../../infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaRelojSlaMarcador } from '../../infrastructure/persistence/prisma/prisma-reloj-sla-marcador';
import { PrismaTareaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaPermisoTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-permiso-tipo-ticket.repository';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { AvanzarEstadoPorTareasService } from '../services/avanzar-estado-por-tareas.service';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import { ActorTarea } from '../services/tareas-ticket.reglas';
import { CompletarTareaUseCase } from './completar-tarea.use-case';
import { DescompletarTareaUseCase } from './descompletar-tarea.use-case';
import { Result } from '../../../shared/domain/result';

// odd/ticket-cerrado-solo-lectura tiene su propio spec unitario; acá el ticket siempre es editable.
const siempreEditable = {
  verificar: async () => Result.ok(undefined),
  verificarEstado: async () => Result.ok(undefined),
};

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_estado_por_tareas_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'cliente-estado-por-tareas';
const SOLICITANTE = '01900000-0000-7000-8000-000000000401';
const RESPONSABLE = '01900000-0000-7000-8000-000000000402';
const TECNICO_A = '01900000-0000-7000-8000-000000000403';
const TECNICO_B = '01900000-0000-7000-8000-000000000404';
const ADMINISTRADOR = '01900000-0000-7000-8000-000000000405';

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

/** Sin restricción por tipo: estos casos prueban el estado por tareas, no el acceso. */
const actor = (id: string): ActorTarea => ({ id, esAdministrador: false, permisosPorTipo: null });

describe('El estado del ticket sigue a sus tareas (S5-S6, tenant efímero)', () => {
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
  const relojMarcador = new PrismaRelojSlaMarcador(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => undefined });
  const master = new MasterAgentesEnMemoria();
  master.agregar({ id: TECNICO_A, rol: 'TECNICO', celdas: [] });
  master.agregar({ id: TECNICO_B, rol: 'TECNICO', celdas: [] });
  master.agregar({ id: ADMINISTRADOR, rol: 'ADMINISTRADOR', celdas: [] });
  const elegibilidad = new ElegibilidadAsignado(
    master,
    new PrismaPermisoTipoTicketRepository(tenantContext),
  );
  const publicados: DomainEvent[] = [];
  const eventPublisher = { publish: (e: DomainEvent) => void publicados.push(e) };
  const estadoIds = new Map<string, string>();
  let tipoId: string;
  let prioridadId: string;

  const servicio = (
    repoOperaciones: Pick<PrismaOperacionTicketRepository, 'save'> = operacionRepo,
  ) =>
    new AvanzarEstadoPorTareasService(
      ticketRepo,
      tareaRepo,
      repoOperaciones,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      new TicketStateMachineFactory(),
      relojMarcador,
      eventPublisher,
      txRunner,
      elegibilidad,
    );
  const completar = (avance = servicio()) =>
    new CompletarTareaUseCase(
      ticketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      avance,
      siempreEditable,
    );
  const descompletar = () =>
    new DescompletarTareaUseCase(
      ticketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      servicio(),
      siempreEditable,
    );

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, fn);

  function idDeEstado(codigo: string): string {
    const id = estadoIds.get(codigo);
    if (!id) throw new Error(`El spec no sembró el estado ${codigo}`);
    return id;
  }

  async function sembrarTicket(estado: string, asignadoId: string | null): Promise<string> {
    const ticket = await client.ticket.create({
      data: {
        numero: `EPT-${randomBytes(3).toString('hex')}`,
        titulo: 'Ticket con tareas',
        tipoId,
        estadoId: idDeEstado(estado),
        prioridadId,
        solicitanteId: SOLICITANTE,
        asignadoId,
        fechaCierre: estado === 'RESUELTO' ? new Date('2026-10-15T10:00:00Z') : null,
      },
    });
    return ticket.id;
  }

  async function sembrarTarea(
    ticketId: string,
    orden: number,
    tecnicoId: string,
    completada = false,
  ): Promise<TareaTicketEntity> {
    const tarea = TareaTicketEntity.crear({
      ticketId,
      descripcion: `Tarea ${orden}`,
      orden,
      tecnicoId,
    });
    if (completada) tarea.completar(tecnicoId, new Date());
    await enTenant(() => tareaRepo.crear(tarea));
    return tarea;
  }

  async function estadoDelTicket(ticketId: string) {
    const fila = await client.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { estado: true },
    });
    return {
      codigo: fila.estado.codigo,
      asignadoId: fila.asignadoId,
      fechaCierre: fila.fechaCierre,
    };
  }

  async function cambiosDeEstado(ticketId: string): Promise<Array<[string | null, string | null]>> {
    const operaciones = await client.operacionTicket.findMany({
      where: { ticketId, tipoOperacion: { codigo: 'CAMBIO_ESTADO' } },
      include: { estadoAnterior: true, estadoNuevo: true },
      orderBy: { createdAt: 'asc' },
    });
    return operaciones.map((o) => [
      o.estadoAnterior?.codigo ?? null,
      o.estadoNuevo?.codigo ?? null,
    ]);
  }

  async function limpiarFilas(): Promise<void> {
    await client.operacionTicket.deleteMany();
    await client.tareaTicket.deleteMany();
    await client.ticket.deleteMany();
    publicados.length = 0;
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);

    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: 'T-ESTADO-TAREAS', nombre: 'Soporte', modulo: 'TICKETS' },
      })
    ).id;
    // Los tres tienen LECTURA sobre el tipo: lo que deja afuera al ADMINISTRADOR es el rol.
    await client.permisoTipoTicket.createMany({
      data: [TECNICO_A, TECNICO_B, ADMINISTRADOR].map((usuarioId) => ({
        usuarioId,
        tipoId,
        accion: 'LECTURA',
      })),
    });
    prioridadId = (
      await client.prioridad.create({ data: { codigo: 'P-ESTADO-TAREAS', nombre: 'Media' } })
    ).id;
    // Las migraciones siembran los estados fijos; los tipos de operación los siembra el seeder del
    // tenant, así que acá se crean si faltan.
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

  it('las dos últimas tareas completadas en paralelo dejan el ticket RESUELTO una sola vez (S6)', async () => {
    const ticketId = await sembrarTicket('EN_PROCESO', RESPONSABLE);
    const tareaA = await sembrarTarea(ticketId, 0, TECNICO_A);
    const tareaB = await sembrarTarea(ticketId, 1, TECNICO_B);

    const [resultadoA, resultadoB] = await Promise.all([
      enTenant(() =>
        completar().execute({
          clienteId: CLIENTE_ID,
          ticketId,
          tareaId: tareaA.id,
          actor: actor(TECNICO_A),
        }),
      ),
      enTenant(() =>
        completar().execute({
          clienteId: CLIENTE_ID,
          ticketId,
          tareaId: tareaB.id,
          actor: actor(TECNICO_B),
        }),
      ),
    ]);

    expect(resultadoA.isOk()).toBe(true);
    expect(resultadoB.isOk()).toBe(true);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('RESUELTO');
    expect(ticket.fechaCierre).not.toBeNull();
    expect(await cambiosDeEstado(ticketId)).toEqual([['EN_PROCESO', 'RESUELTO']]);
    const filas = await client.tareaTicket.findMany({ where: { ticketId } });
    expect(filas.every((t) => t.completada)).toBe(true);
  });

  it('completar una tarea de un ticket NUEVO sin responsable lo asigna a quien completa y lo pone EN_PROCESO (S2)', async () => {
    const ticketId = await sembrarTicket('NUEVO', null);
    const tarea = await sembrarTarea(ticketId, 0, TECNICO_A);
    await sembrarTarea(ticketId, 1, TECNICO_B);

    const resultado = await enTenant(() =>
      completar().execute({
        clienteId: CLIENTE_ID,
        ticketId,
        tareaId: tarea.id,
        actor: actor(TECNICO_A),
      }),
    );

    expect(resultado.isOk()).toBe(true);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('EN_PROCESO');
    expect(ticket.asignadoId).toBe(TECNICO_A);
    expect(ticket.fechaCierre).toBeNull();
    expect(await cambiosDeEstado(ticketId)).toEqual([
      ['NUEVO', 'ASIGNADO'],
      ['ASIGNADO', 'EN_PROCESO'],
    ]);
    const asignaciones = await client.operacionTicket.count({
      where: { ticketId, tipoOperacion: { codigo: 'ASIGNACION' } },
    });
    expect(asignaciones).toBe(1);
    // Los eventos salen recién después del commit.
    expect(publicados.map((e) => e.name)).toEqual(['ticket.asignado']);
  });

  it('un ADMINISTRADOR que completa una tarea de un ticket NUEVO sin responsable lo pone EN_PROCESO sin asignárselo', async () => {
    const ticketId = await sembrarTicket('NUEVO', null);
    const tarea = await sembrarTarea(ticketId, 0, TECNICO_A);
    await sembrarTarea(ticketId, 1, TECNICO_B);

    const resultado = await enTenant(() =>
      completar().execute({
        clienteId: CLIENTE_ID,
        ticketId,
        tareaId: tarea.id,
        actor: { id: ADMINISTRADOR, esAdministrador: true, permisosPorTipo: null },
      }),
    );

    expect(resultado.isOk()).toBe(true);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('EN_PROCESO');
    expect(ticket.asignadoId).toBeNull();
    expect(await cambiosDeEstado(ticketId)).toEqual([
      ['NUEVO', 'ASIGNADO'],
      ['ASIGNADO', 'EN_PROCESO'],
    ]);
    const asignaciones = await client.operacionTicket.count({
      where: { ticketId, tipoOperacion: { codigo: 'ASIGNACION' } },
    });
    expect(asignaciones).toBe(0);
    expect(publicados.map((e) => e.name)).not.toContain('ticket.asignado');
  });

  it('descompletar una tarea de un ticket RESUELTO lo devuelve a EN_PROCESO y limpia fecha_cierre (S4)', async () => {
    const ticketId = await sembrarTicket('RESUELTO', RESPONSABLE);
    const tarea = await sembrarTarea(ticketId, 0, TECNICO_A, true);

    const resultado = await enTenant(() =>
      descompletar().execute({
        clienteId: CLIENTE_ID,
        ticketId,
        tareaId: tarea.id,
        actor: actor(RESPONSABLE),
      }),
    );

    expect(resultado.isOk()).toBe(true);
    const ticket = await estadoDelTicket(ticketId);
    expect(ticket.codigo).toBe('EN_PROCESO');
    expect(ticket.fechaCierre).toBeNull();
    expect(await cambiosDeEstado(ticketId)).toEqual([['RESUELTO', 'EN_PROCESO']]);
    expect(publicados.map((e) => e.name)).toEqual(['ticket.transicionado']);
  });

  it('si falla el cambio de estado, la tarea no queda completada (S5)', async () => {
    const ticketId = await sembrarTicket('EN_PROCESO', RESPONSABLE);
    const tarea = await sembrarTarea(ticketId, 0, TECNICO_A);
    const operacionesQueFallanEnElCambioDeEstado = {
      save: async (operacion: OperacionTicketEntity): Promise<void> => {
        if (operacion.estadoNuevoId !== null) throw new Error('falla simulada en CAMBIO_ESTADO');
        await operacionRepo.save(operacion);
      },
    };

    await expect(
      enTenant(() =>
        completar(servicio(operacionesQueFallanEnElCambioDeEstado)).execute({
          clienteId: CLIENTE_ID,
          ticketId,
          tareaId: tarea.id,
          actor: actor(TECNICO_A),
        }),
      ),
    ).rejects.toThrow('falla simulada en CAMBIO_ESTADO');

    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.completada).toBe(false);
    expect((await estadoDelTicket(ticketId)).codigo).toBe('EN_PROCESO');
    expect(await client.operacionTicket.count({ where: { ticketId } })).toBe(0);
    expect(publicados).toEqual([]);
  });
});
