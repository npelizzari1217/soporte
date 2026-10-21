/**
 * [INTEGRATION] Casos de uso de tareas (odd/tareas-con-tecnico T2) contra Postgres REAL, en una
 * base de INQUILINO EFÍMERA migrada con todas las migraciones: el cambio de la tarea y su entrada
 * en `operaciones_ticket` se escriben en la misma transacción (CA8). Si falla la segunda
 * escritura, la primera se deshace.
 * También prueba que la migración `20261013150000_tipos_operacion_tareas` sembró los tipos.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaTareaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { ActorTarea } from '../services/tareas-ticket.reglas';
import { CompletarTareaUseCase } from './completar-tarea.use-case';
import { CrearTareaTicketUseCase } from './crear-tarea-ticket.use-case';
import { Result } from '../../../shared/domain/result';

// odd/ticket-cerrado-solo-lectura tiene su propio spec unitario; acá el ticket siempre es editable.
const siempreEditable = { verificar: async () => Result.ok(undefined) };

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_tareas_atomicidad_${randomBytes(4).toString('hex')}_test`;
const SOLICITANTE = '01900000-0000-7000-8000-000000000201';
const RESPONSABLE = '01900000-0000-7000-8000-000000000202';

const RESPONSABLE_ACTOR: ActorTarea = {
  id: RESPONSABLE,
  esAdministrador: false,
  tienePermisoVerTodos: true,
  modulosConModificacion: ['EDILICIA'],
  modulosPermitidos: ['EDILICIA'],
};

describe('Tareas de un ticket: tarea + historial en una transacción (T2, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const ticketRepo = new PrismaTicketRepository(tenantContext);
  const tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
  const tareaRepo = new PrismaTareaTicketRepository(tenantContext);
  const operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
  const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => undefined });
  let ticketId: string;

  /** Repositorio de operaciones que falla al guardar: la segunda escritura de la transacción. */
  const operacionRepoQueFalla = {
    save: async (_operacion: OperacionTicketEntity): Promise<void> => {
      throw new Error('falla simulada al guardar la operación');
    },
  };

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-tareas' }, fn);

  const crearUseCase = (repoOperaciones: Pick<PrismaOperacionTicketRepository, 'save'>) =>
    new CrearTareaTicketUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      repoOperaciones,
      tipoOperacionRepo,
      txRunner,
      siempreEditable,
    );

  // El avance de estado por tareas (odd/estado-por-tareas) se prueba en su propio spec de
  // integración; acá un doble inerte deja la prueba de atomicidad tarea + historial como estaba.
  const sinAvanceDeEstado = { aplicar: async () => null };

  const completarUseCase = (repoOperaciones: Pick<PrismaOperacionTicketRepository, 'save'>) =>
    new CompletarTareaUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      repoOperaciones,
      tipoOperacionRepo,
      txRunner,
      sinAvanceDeEstado,
      siempreEditable,
    );

  async function sembrarTarea(): Promise<TareaTicketEntity> {
    const tarea = TareaTicketEntity.crear({
      ticketId,
      descripcion: 'Cambiar el flotante',
      orden: 0,
    });
    await enTenant(() => tareaRepo.crear(tarea));
    return tarea;
  }

  async function operacionesDeTareas() {
    return client.operacionTicket.findMany({
      where: { ticketId, tipoOperacion: { codigo: { startsWith: 'TAREA_' } } },
      include: { tipoOperacion: true },
    });
  }

  async function limpiarFilas(): Promise<void> {
    await client.operacionTicket.deleteMany();
    await client.tareaTicket.deleteMany();
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);

    const tipoId = (
      await client.tipoTicket.create({
        data: { codigo: 'T-ATOMICIDAD', nombre: 'Edilicia', modulo: 'EDILICIA' },
      })
    ).id;
    const estadoId = (
      await client.estado.create({ data: { codigo: 'E-ATOMICIDAD', nombre: 'En proceso' } })
    ).id;
    const prioridadId = (
      await client.prioridad.create({ data: { codigo: 'P-ATOMICIDAD', nombre: 'Media' } })
    ).id;
    ticketId = (
      await client.ticket.create({
        data: {
          numero: 'AT-1',
          titulo: 'Ticket con tareas',
          tipoId,
          estadoId,
          prioridadId,
          solicitanteId: SOLICITANTE,
          asignadoId: RESPONSABLE,
        },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    try {
      await limpiarFilas();
      await client.ticket.deleteMany();
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

  it('la migración siembra los cinco tipos de operación de tareas', async () => {
    const codigos = await client.tipoOperacion.findMany({
      where: { codigo: { in: Object.values(TIPO_OPERACION_TAREA) } },
      select: { codigo: true },
    });
    expect(codigos.map((c) => c.codigo).sort()).toEqual(Object.values(TIPO_OPERACION_TAREA).sort());
  });

  it('completar escribe la tarea y TAREA_COMPLETADA juntas', async () => {
    const tarea = await sembrarTarea();

    const result = await enTenant(() =>
      completarUseCase(operacionRepo).execute({
        ticketId,
        tareaId: tarea.id,
        actor: RESPONSABLE_ACTOR,
      }),
    );

    expect(result.isOk()).toBe(true);
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.completada).toBe(true);
    expect(fila.completadaPorId).toBe(RESPONSABLE);
    const operaciones = await operacionesDeTareas();
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0].tipoOperacion.codigo).toBe('TAREA_COMPLETADA');
    expect(operaciones[0].autorId).toBe(RESPONSABLE);
  });

  it('si falla la entrada del historial, completar no deja la tarea completada', async () => {
    const tarea = await sembrarTarea();

    await expect(
      enTenant(() =>
        completarUseCase(operacionRepoQueFalla).execute({
          ticketId,
          tareaId: tarea.id,
          actor: RESPONSABLE_ACTOR,
        }),
      ),
    ).rejects.toThrow('falla simulada');

    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.completada).toBe(false);
    expect(fila.completadaPorId).toBeNull();
    expect(fila.completadaEn).toBeNull();
    expect(await operacionesDeTareas()).toHaveLength(0);
  });

  it('si falla la entrada del historial, el alta no deja la tarea creada', async () => {
    await expect(
      enTenant(() =>
        crearUseCase(operacionRepoQueFalla).execute({
          ticketId,
          actor: RESPONSABLE_ACTOR,
          descripcion: 'No debería quedar',
        }),
      ),
    ).rejects.toThrow('falla simulada');

    expect(await client.tareaTicket.count({ where: { ticketId } })).toBe(0);
    expect(await operacionesDeTareas()).toHaveLength(0);
  });
});
