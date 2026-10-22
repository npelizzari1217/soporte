/**
 * [INTEGRATION] Escrituras sobre un ticket contra su borrado concurrente
 * (odd/tasks/permisos-por-tipo-ticket.md, L45), contra Postgres REAL en una base de INQUILINO
 * EFÍMERA, con los repositorios Prisma reales.
 *
 * Crear una tarea, descompletarla y vincular una compra a la reparación cargan el ticket fuera de
 * la transacción. Si el ticket se borra en el medio, la escritura dejaría una tarea pendiente o una
 * compra vinculada en un ticket borrado, que es justo lo que el borrado rechaza (L40).
 *
 * - Los tres primeros casos reproducen la carrera de forma determinista (mismo patrón que
 *   `tareas-ticket.concurrencia.integration.spec.ts`): un puerto del caso de uso corre el borrado
 *   completo entre la carga y la transacción.
 * - El último corre las dos transacciones a la vez: la creación de la tarea tiene el lock del
 *   ticket y el borrado tiene que esperarla, así que ve la tarea nueva y responde 422.
 *
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { CompraEntity } from '../../../compras/domain/entities/compra.entity';
import { VincularCompraAReparacionUseCase } from '../../../reparaciones/application/use-cases/vincular-compra-a-reparacion.use-case';
import { PrismaReparacionCompraRepository } from '../../../reparaciones/infrastructure/persistence/prisma/prisma-reparacion-compra.repository';
import { PrismaTicketEdiliciaRepository } from '../../../reparaciones/infrastructure/persistence/prisma/prisma-ticket-edilicia.repository';
import { DomainError, Result } from '../../../shared/domain/result';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import {
  TicketConPendientesNoBorrableError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { PrismaBloqueoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-bloqueo-ticket.repository';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaTareaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { ActorTarea } from '../services/tareas-ticket.reglas';
import { BorrarTicketUseCase } from './borrar-ticket.use-case';
import { CrearTareaTicketUseCase } from './crear-tarea-ticket.use-case';
import { DescompletarTareaUseCase } from './descompletar-tarea.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_borrar_concurrencia_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'cliente-borrar-concurrencia';
const ADMIN = '01900000-0000-7000-8000-000000000501';
const TECNICO = '01900000-0000-7000-8000-000000000502';

/** Sin restricción por tipo: estos casos prueban la concurrencia, no el acceso. */
const ADMIN_ACTOR: ActorTarea = { id: ADMIN, esAdministrador: true, permisosPorTipo: null };

describe('Escrituras sobre un ticket contra su borrado concurrente (L45, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const ticketRepo = new PrismaTicketRepository(tenantContext);
  const tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
  const tareaRepo = new PrismaTareaTicketRepository(tenantContext);
  const operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
  const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
  const bloqueoRepo = new PrismaBloqueoTicketRepository(tenantContext);
  const ediliciaRepo = new PrismaTicketEdiliciaRepository(tenantContext);
  const reparacionCompraRepo = new PrismaReparacionCompraRepository(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => undefined });
  const siempreEditable = { verificar: async () => Result.ok(undefined) };
  const sinAvanceDeEstado = { aplicar: async () => null };
  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let cicloId: string;
  let secuencia = 0;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, fn);

  const borrar = new BorrarTicketUseCase(
    ticketRepo,
    tipoTicketRepo,
    tareaRepo,
    bloqueoRepo,
    operacionRepo,
    tipoOperacionRepo,
    txRunner,
  );
  const borrarTicket = (ticketId: string): Promise<Result<void, DomainError>> =>
    enTenant(() => borrar.execute({ ticketId, ...alcanceSinRestriccion(ADMIN) }));

  const crearTarea = (
    repo: PrismaTareaTicketRepository = tareaRepo,
    verificador = siempreEditable,
  ): CrearTareaTicketUseCase =>
    new CrearTareaTicketUseCase(
      ticketRepo,
      tipoTicketRepo,
      repo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      verificador,
    );

  async function nuevoTicket(): Promise<string> {
    secuencia += 1;
    return (
      await client.ticket.create({
        data: {
          numero: `BC-${secuencia}`,
          titulo: 'Ticket borrado en carrera',
          tipoId,
          estadoId,
          prioridadId,
          solicitanteId: ADMIN,
          asignadoId: ADMIN,
        },
      })
    ).id;
  }

  async function deletedAt(ticketId: string): Promise<Date | null> {
    return (await client.ticket.findUniqueOrThrow({ where: { id: ticketId } })).deletedAt;
  }

  async function codigosDelHistorial(ticketId: string): Promise<string[]> {
    const operaciones = await client.operacionTicket.findMany({
      where: { ticketId },
      include: { tipoOperacion: true },
      orderBy: { createdAt: 'asc' },
    });
    return operaciones.map((o) => o.tipoOperacion.codigo);
  }

  /** Espera a que alguna transacción de esta base quede bloqueada por un lock, o a que `listo`. */
  async function esperarBloqueo(listo: () => boolean): Promise<void> {
    for (let intento = 0; intento < 100 && !listo(); intento += 1) {
      const [{ esperando }] = await client.$queryRaw<{ esperando: number }[]>`
        SELECT count(*)::int AS esperando FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (esperando > 0) return;
      await new Promise((resolver) => setTimeout(resolver, 50));
    }
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);

    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: 'T-BORRAR-CARRERA', nombre: 'Edilicia', modulo: 'EDILICIA' },
      })
    ).id;
    estadoId = (
      await client.estado.create({ data: { codigo: 'E-BORRAR-CARRERA', nombre: 'En proceso' } })
    ).id;
    prioridadId = (
      await client.prioridad.create({ data: { codigo: 'P-BORRAR-CARRERA', nombre: 'Media' } })
    ).id;
    cicloId = (
      await client.cicloCliente.create({
        data: {
          cicloVigenteId: ADMIN,
          nombre: 'Ciclo borrar en carrera',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  it('crear una tarea en un ticket borrado después de cargarlo: 404 y ni la tarea ni el historial', async () => {
    const ticketId = await nuevoTicket();
    // El borrado termina entre la carga del ticket y la transacción de la escritura.
    const verificador = {
      verificar: async () => {
        expect((await borrarTicket(ticketId)).isOk()).toBe(true);
        return Result.ok(undefined);
      },
    };

    const result = await enTenant(() =>
      crearTarea(tareaRepo, verificador).execute({
        ticketId,
        actor: ADMIN_ACTOR,
        descripcion: 'Revisar la bomba',
      }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(await deletedAt(ticketId)).not.toBeNull();
    expect(await client.tareaTicket.count({ where: { ticketId } })).toBe(0);
    expect(await codigosDelHistorial(ticketId)).toEqual(['TICKET_BORRADO']);
  });

  it('descompletar una tarea de un ticket borrado después de cargarla: 404 y la tarea sigue completada', async () => {
    const ticketId = await nuevoTicket();
    const tarea = await client.tareaTicket.create({
      data: {
        ticketId,
        descripcion: 'Cambiar el flotante',
        orden: 0,
        tecnicoId: TECNICO,
        completada: true,
        completadaEn: new Date('2026-10-22T10:00:00Z'),
        completadaPorId: TECNICO,
      },
    });
    // La tarea completada no frena el borrado (L44), que corre después de leer la tarea.
    let yaCorrio = false;
    const repo = new Proxy(tareaRepo, {
      get(target, prop, receiver) {
        if (prop !== 'buscarPorId') return Reflect.get(target, prop, receiver);
        return async (id: string): Promise<TareaTicketEntity | null> => {
          const leida = await target.buscarPorId(id);
          if (!yaCorrio) {
            yaCorrio = true;
            expect((await borrarTicket(ticketId)).isOk()).toBe(true);
          }
          return leida;
        };
      },
    });

    const result = await enTenant(() =>
      new DescompletarTareaUseCase(
        ticketRepo,
        repo,
        operacionRepo,
        tipoOperacionRepo,
        txRunner,
        sinAvanceDeEstado,
        siempreEditable,
      ).execute({ ticketId, tareaId: tarea.id, actor: ADMIN_ACTOR }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.completada).toBe(true);
    expect(fila.completadaPorId).toBe(TECNICO);
    expect(await codigosDelHistorial(ticketId)).toEqual(['TICKET_BORRADO']);
  });

  it('vincular una compra a la reparación de un ticket borrado después de cargarlo: 404 y sin vínculo', async () => {
    const ticketId = await nuevoTicket();
    const reparacion = await client.ticketEdilicia.create({ data: { ticketId } });
    secuencia += 1;
    const compra = await client.compra.create({
      data: {
        numero: `COM-2026-C${String(secuencia).padStart(4, '0')}`,
        fechaSolicitud: new Date('2026-10-01'),
        motivo: 'Repuesto',
        solicitanteId: ADMIN,
        cicloId,
      },
    });
    // La compra se valida después de cargar la reparación y su ticket: ahí corre el borrado.
    const compraRepo = {
      findByIdConItems: async (): Promise<CompraEntity | null> => {
        expect((await borrarTicket(ticketId)).isOk()).toBe(true);
        return CompraEntity.create(
          {
            numero: compra.numero,
            fechaSolicitud: compra.fechaSolicitud,
            motivo: compra.motivo,
            descripcion: null,
            solicitanteId: ADMIN,
            cicloId,
          },
          compra.id,
        );
      },
    };

    const result = await enTenant(() =>
      new VincularCompraAReparacionUseCase(
        ediliciaRepo,
        compraRepo,
        reparacionCompraRepo,
        ticketRepo,
        txRunner,
      ).execute({
        ticketEdiliciaId: reparacion.id,
        compraId: compra.id,
        alcance: alcanceSinRestriccion(ADMIN),
      }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(await deletedAt(ticketId)).not.toBeNull();
    expect(
      await client.reparacionCompra.count({ where: { ticketEdiliciaId: reparacion.id } }),
    ).toBe(0);
  });

  it('borrar mientras se crea una tarea: espera el lock, ve la tarea nueva y responde 422', async () => {
    const ticketId = await nuevoTicket();
    let borrado: Promise<Result<void, DomainError>> | undefined;
    let borradoTerminado = false;
    // Con la tarea ya escrita y la transacción abierta, el borrado arranca en otra transacción.
    const repo = new Proxy(tareaRepo, {
      get(target, prop, receiver) {
        if (prop !== 'crear') return Reflect.get(target, prop, receiver);
        return async (tarea: TareaTicketEntity): Promise<void> => {
          await target.crear(tarea);
          borrado = borrarTicket(ticketId).finally(() => {
            borradoTerminado = true;
          });
          await esperarBloqueo(() => borradoTerminado);
        };
      },
    });

    const creada = await enTenant(() =>
      crearTarea(repo).execute({ ticketId, actor: ADMIN_ACTOR, descripcion: 'Revisar la bomba' }),
    );
    if (!borrado) throw new Error('el borrado no arrancó');
    const resultadoBorrado = await borrado;

    expect(creada.isOk()).toBe(true);
    expect(resultadoBorrado.isFail()).toBe(true);
    expect(resultadoBorrado.getError()).toBeInstanceOf(TicketConPendientesNoBorrableError);
    expect(await deletedAt(ticketId)).toBeNull();
    expect(await client.tareaTicket.count({ where: { ticketId, completada: false } })).toBe(1);
    expect(await codigosDelHistorial(ticketId)).toEqual(['TAREA_CREADA']);
  });
});
