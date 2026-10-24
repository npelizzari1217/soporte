/**
 * [INTEGRATION] Actualizaciones perdidas en las tareas de un ticket (odd/tareas-con-tecnico T10,
 * JD-W1, y T13, JD-S1 y JD-S2), contra Postgres REAL en una base de INQUILINO EFÍMERA, con los repositorios Prisma
 * reales.
 *
 * Los casos de uso cargan la tarea fuera de la transacción. Cada caso reproduce una carrera de
 * forma determinista, sin paralelismo real: el repositorio que recibe el caso de uso devuelve la
 * tarea que leyó, pero antes deja que otra acción se complete por debajo. Así el caso de uso
 * valida un estado que ya no es el de la base, y su escritura tiene que fallar o no pisar lo
 * ajeno.
 *
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { PrismaBloqueoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-bloqueo-ticket.repository';
import { PrismaEstadoRepository } from '../../infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaTareaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { ActorTarea } from '../services/tareas-ticket.reglas';
import { VerificadorTicketEditable } from '../services/ticket-editable-para-tareas';
import { AsignarTecnicoTareaUseCase } from './asignar-tecnico-tarea.use-case';
import { CompletarTareaUseCase } from './completar-tarea.use-case';
import { DescompletarTareaUseCase } from './descompletar-tarea.use-case';
import { EliminarTareaUseCase } from './eliminar-tarea.use-case';
import { Result } from '../../../shared/domain/result';

// odd/ticket-cerrado-solo-lectura tiene su propio spec unitario; acá el ticket es editable salvo en
// la carrera contra su resolución (odd/cerrado-solo-comentarios), que usa el verificador real.
const siempreEditable = {
  verificar: async () => Result.ok(undefined),
  verificarEstado: async () => Result.ok(undefined),
};

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_tareas_concurrencia_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'cliente-tareas-concurrencia';
const SOLICITANTE = '01900000-0000-7000-8000-000000000301';
const RESPONSABLE = '01900000-0000-7000-8000-000000000302';
const TECNICO_A = '01900000-0000-7000-8000-000000000303';
const TECNICO_B = '01900000-0000-7000-8000-000000000304';

/** Sin restricción por tipo: estos casos prueban la concurrencia, no el acceso. */
const actor = (id: string, esAdministrador = false): ActorTarea => ({
  id,
  esAdministrador,
  permisosPorTipo: null,
});
const RESPONSABLE_ACTOR = actor(RESPONSABLE);
const ADMIN_ACTOR = actor('01900000-0000-7000-8000-000000000305', true);

describe('Tareas de un ticket: escrituras condicionadas ante carreras (T10 y T13, tenant efímero)', () => {
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
  // La elegibilidad no es lo que se prueba acá: los dos técnicos del spec son elegibles.
  const elegibilidad = {
    esAgenteDeTipo: async (usuarioId: string): Promise<boolean> =>
      [TECNICO_A, TECNICO_B].includes(usuarioId),
  };
  let ticketId: string;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, fn);

  /**
   * El repositorio real, salvo que `buscarPorId` corre `porDebajo` entre la lectura y la
   * devolución: la acción ajena se completa después de que el caso de uso leyó la tarea y antes
   * de que la valide y la escriba. Solo intercepta la primera lectura.
   */
  function repoConCarrera(porDebajo: () => Promise<unknown>): PrismaTareaTicketRepository {
    let yaCorrio = false;
    return new Proxy(tareaRepo, {
      get(target, prop, receiver) {
        if (prop !== 'buscarPorId') return Reflect.get(target, prop, receiver);
        return async (id: string): Promise<TareaTicketEntity | null> => {
          const leida = await target.buscarPorId(id);
          if (!yaCorrio) {
            yaCorrio = true;
            await porDebajo();
          }
          return leida;
        };
      },
    });
  }

  // El avance de estado por tareas (odd/estado-por-tareas) tiene su propio spec de integración;
  // un doble inerte deja estas carreras de tarea contra tarea como estaban.
  const sinAvanceDeEstado = { aplicar: async () => null };

  const completar = (repo = tareaRepo) =>
    new CompletarTareaUseCase(
      ticketRepo,
      repo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      sinAvanceDeEstado,
      siempreEditable,
    );
  const descompletar = (repo = tareaRepo) =>
    new DescompletarTareaUseCase(
      ticketRepo,
      repo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      sinAvanceDeEstado,
      siempreEditable,
    );
  const eliminar = (repo = tareaRepo) =>
    new EliminarTareaUseCase(
      ticketRepo,
      tipoTicketRepo,
      repo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      siempreEditable,
    );
  const asignar = (repo = tareaRepo) =>
    new AsignarTecnicoTareaUseCase(
      ticketRepo,
      tipoTicketRepo,
      repo,
      elegibilidad,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      siempreEditable,
    );

  async function sembrarTarea(tecnicoId: string | null = TECNICO_A): Promise<TareaTicketEntity> {
    const tarea = TareaTicketEntity.crear({
      ticketId,
      descripcion: 'Revisar la fuente',
      orden: 0,
      tecnicoId,
    });
    await enTenant(() => tareaRepo.crear(tarea));
    return tarea;
  }

  async function codigosDelHistorial(): Promise<string[]> {
    const operaciones = await client.operacionTicket.findMany({
      where: { ticketId, tipoOperacion: { codigo: { startsWith: 'TAREA_' } } },
      include: { tipoOperacion: true },
      orderBy: { createdAt: 'asc' },
    });
    return operaciones.map((o) => o.tipoOperacion.codigo);
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
        data: { codigo: 'T-CONCURRENCIA', nombre: 'Soporte', modulo: 'TICKETS' },
      })
    ).id;
    const estadoId = (
      await client.estado.create({ data: { codigo: 'E-CONCURRENCIA', nombre: 'En proceso' } })
    ).id;
    const prioridadId = (
      await client.prioridad.create({ data: { codigo: 'P-CONCURRENCIA', nombre: 'Media' } })
    ).id;
    ticketId = (
      await client.ticket.create({
        data: {
          numero: 'CC-1',
          titulo: 'Ticket con tareas en carrera',
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

  it('completar contra eliminar: no revive la tarea borrada y da TAREA_NO_ENCONTRADA', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const repo = repoConCarrera(() =>
      eliminar().execute({ ticketId, tareaId: tarea.id, actor: RESPONSABLE_ACTOR }),
    );

    const result = await enTenant(() =>
      completar(repo).execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TAREA_NO_ENCONTRADA');
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.deletedAt).not.toBeNull();
    expect(fila.completada).toBe(false);
    expect(fila.completadaPorId).toBeNull();
    // El técnico ya no ve el ticket por la tarea (CA10): la tarea sigue dada de baja.
    expect(await enTenant(() => ticketRepo.esVisiblePara(ticketId, TECNICO_A))).toBe(false);
    expect(await codigosDelHistorial()).toEqual(['TAREA_ELIMINADA']);
  });

  it('asignar contra completar: conserva el completado y cambia el técnico', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const repo = repoConCarrera(() =>
      completar().execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );

    const result = await enTenant(() =>
      asignar(repo).execute({
        ticketId,
        tareaId: tarea.id,
        actor: RESPONSABLE_ACTOR,
        clienteId: CLIENTE_ID,
        tecnicoId: TECNICO_B,
      }),
    );

    expect(result.isOk()).toBe(true);
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.tecnicoId).toBe(TECNICO_B);
    expect(fila.completada).toBe(true);
    expect(fila.completadaPorId).toBe(TECNICO_A);
    expect(fila.completadaEn).not.toBeNull();
    expect(await codigosDelHistorial()).toEqual(['TAREA_COMPLETADA', 'TAREA_ASIGNADA']);
  });

  it('completar contra asignar: conserva el técnico nuevo', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const repo = repoConCarrera(() =>
      asignar().execute({
        ticketId,
        tareaId: tarea.id,
        actor: RESPONSABLE_ACTOR,
        clienteId: CLIENTE_ID,
        tecnicoId: TECNICO_B,
      }),
    );

    const result = await enTenant(() =>
      completar(repo).execute({ ticketId, tareaId: tarea.id, actor: RESPONSABLE_ACTOR }),
    );

    expect(result.isOk()).toBe(true);
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.tecnicoId).toBe(TECNICO_B);
    expect(fila.completada).toBe(true);
    expect(fila.completadaPorId).toBe(RESPONSABLE);
    expect(await codigosDelHistorial()).toEqual(['TAREA_ASIGNADA', 'TAREA_COMPLETADA']);
  });

  it('dos completar: el segundo da TAREA_YA_COMPLETADA, sin pisar el crédito ni duplicar historial', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const repo = repoConCarrera(() =>
      completar().execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );

    const result = await enTenant(() =>
      completar(repo).execute({ ticketId, tareaId: tarea.id, actor: ADMIN_ACTOR }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TAREA_YA_COMPLETADA');
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.completadaPorId).toBe(TECNICO_A);
    expect(await codigosDelHistorial()).toEqual(['TAREA_COMPLETADA']);
  });

  it('eliminar contra completar: la baja conserva quién completó', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const repo = repoConCarrera(() =>
      completar().execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );

    const result = await enTenant(() =>
      eliminar(repo).execute({ ticketId, tareaId: tarea.id, actor: RESPONSABLE_ACTOR }),
    );

    expect(result.isOk()).toBe(true);
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.deletedAt).not.toBeNull();
    expect(fila.completada).toBe(true);
    expect(fila.completadaPorId).toBe(TECNICO_A);
    expect(await codigosDelHistorial()).toEqual(['TAREA_COMPLETADA', 'TAREA_ELIMINADA']);
  });

  it('dos descompletar: el segundo da TAREA_NO_COMPLETADA y escribe un solo historial', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    await enTenant(() =>
      completar().execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );
    const repo = repoConCarrera(() =>
      descompletar().execute({ ticketId, tareaId: tarea.id, actor: RESPONSABLE_ACTOR }),
    );

    const result = await enTenant(() =>
      descompletar(repo).execute({ ticketId, tareaId: tarea.id, actor: ADMIN_ACTOR }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TAREA_NO_COMPLETADA');
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.completada).toBe(false);
    expect(await codigosDelHistorial()).toEqual(['TAREA_COMPLETADA', 'TAREA_DESCOMPLETADA']);
  });

  it('descompletar contra descompletar y volver a completar (ABA, JD-S1): da TAREA_YA_COMPLETADA y conserva el completado nuevo', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    await enTenant(() =>
      completar().execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );
    const repo = repoConCarrera(async () => {
      const descompletado = await descompletar().execute({
        ticketId,
        tareaId: tarea.id,
        actor: actor(TECNICO_A),
      });
      const completado = await completar().execute({
        ticketId,
        tareaId: tarea.id,
        actor: RESPONSABLE_ACTOR,
      });
      expect(descompletado.isOk() && completado.isOk()).toBe(true);
    });

    const result = await enTenant(() =>
      descompletar(repo).execute({ ticketId, tareaId: tarea.id, actor: ADMIN_ACTOR }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TAREA_YA_COMPLETADA');
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.completada).toBe(true);
    expect(fila.completadaPorId).toBe(RESPONSABLE);
    expect(fila.completadaEn).not.toBeNull();
    expect(await codigosDelHistorial()).toEqual([
      'TAREA_COMPLETADA',
      'TAREA_DESCOMPLETADA',
      'TAREA_COMPLETADA',
    ]);
  });

  it('completar del técnico contra reasignar (JD-S2): da TAREA_ACCION_NO_PERMITIDA y la tarea sigue pendiente', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const repo = repoConCarrera(() =>
      asignar().execute({
        ticketId,
        tareaId: tarea.id,
        actor: RESPONSABLE_ACTOR,
        clienteId: CLIENTE_ID,
        tecnicoId: TECNICO_B,
      }),
    );

    const result = await enTenant(() =>
      completar(repo).execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TAREA_ACCION_NO_PERMITIDA');
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.tecnicoId).toBe(TECNICO_B);
    expect(fila.completada).toBe(false);
    expect(fila.completadaPorId).toBeNull();
    expect(await codigosDelHistorial()).toEqual(['TAREA_ASIGNADA']);
  });

  it('descompletar del técnico contra reasignar (JD-S2): da TAREA_ACCION_NO_PERMITIDA y conserva el completado', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    await enTenant(() =>
      completar().execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );
    const repo = repoConCarrera(() =>
      asignar().execute({
        ticketId,
        tareaId: tarea.id,
        actor: RESPONSABLE_ACTOR,
        clienteId: CLIENTE_ID,
        tecnicoId: TECNICO_B,
      }),
    );

    const result = await enTenant(() =>
      descompletar(repo).execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TAREA_ACCION_NO_PERMITIDA');
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.tecnicoId).toBe(TECNICO_B);
    expect(fila.completada).toBe(true);
    expect(fila.completadaPorId).toBe(TECNICO_A);
    expect(await codigosDelHistorial()).toEqual(['TAREA_COMPLETADA', 'TAREA_ASIGNADA']);
  });

  it('descompletar del responsable contra reasignar: su permiso no depende del técnico y aplica', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    await enTenant(() =>
      completar().execute({ ticketId, tareaId: tarea.id, actor: actor(TECNICO_A) }),
    );
    const repo = repoConCarrera(() =>
      asignar().execute({
        ticketId,
        tareaId: tarea.id,
        actor: RESPONSABLE_ACTOR,
        clienteId: CLIENTE_ID,
        tecnicoId: TECNICO_B,
      }),
    );

    const result = await enTenant(() =>
      descompletar(repo).execute({ ticketId, tareaId: tarea.id, actor: RESPONSABLE_ACTOR }),
    );

    expect(result.isOk()).toBe(true);
    const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.tecnicoId).toBe(TECNICO_B);
    expect(fila.completada).toBe(false);
    expect(await codigosDelHistorial()).toEqual([
      'TAREA_COMPLETADA',
      'TAREA_ASIGNADA',
      'TAREA_DESCOMPLETADA',
    ]);
  });

  it('eliminar contra eliminar: la segunda baja da TAREA_NO_ENCONTRADA y no duplica historial', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const repo = repoConCarrera(() =>
      eliminar().execute({ ticketId, tareaId: tarea.id, actor: RESPONSABLE_ACTOR }),
    );

    const result = await enTenant(() =>
      eliminar(repo).execute({ ticketId, tareaId: tarea.id, actor: ADMIN_ACTOR }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TAREA_NO_ENCONTRADA');
    expect(await codigosDelHistorial()).toEqual(['TAREA_ELIMINADA']);
  });

  it('completar contra resolver el ticket: con el lock ve RESUELTO y da TICKET_SOLO_COMENTARIOS sin escribir (odd/cerrado-solo-comentarios)', async () => {
    const tarea = await sembrarTarea(TECNICO_A);
    const { estadoId: estadoOriginalId } = await client.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    const resuelto = await client.estado.upsert({
      where: { codigo: 'RESUELTO' },
      create: { codigo: 'RESUELTO', nombre: 'Resuelto' },
      update: {},
    });
    // Otra transacción resuelve el ticket y hace commit después de que el caso de uso lo leyó: la
    // verificación previa ve el estado anterior y deja pasar.
    const repo = repoConCarrera(() =>
      client.ticket.update({ where: { id: ticketId }, data: { estadoId: resuelto.id } }),
    );
    const verificador = new VerificadorTicketEditable(
      new PrismaEstadoRepository(tenantContext),
      new PrismaBloqueoTicketRepository(tenantContext),
    );

    try {
      const result = await enTenant(() =>
        new CompletarTareaUseCase(
          ticketRepo,
          repo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
          sinAvanceDeEstado,
          verificador,
        ).execute({ ticketId, tareaId: tarea.id, actor: RESPONSABLE_ACTOR }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_SOLO_COMENTARIOS');
      const fila = await client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
      expect(fila.completada).toBe(false);
      expect(fila.completadaPorId).toBeNull();
      expect(await codigosDelHistorial()).toEqual([]);
    } finally {
      await client.ticket.update({ where: { id: ticketId }, data: { estadoId: estadoOriginalId } });
    }
  });
});
