/**
 * [INTEGRATION] Certificados de avance (odd/edilicia-obra-externa, T3b, S4, S5, S6, S8), contra
 * Postgres REAL en una base de INQUILINO EFÍMERA, con los repositorios Prisma reales: el índice
 * único parcial de tareas vigentes, la anulación que libera tareas, el historial y el lock del
 * ticket se prueban donde viven.
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
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { PrismaCertificadoAvanceRepository } from '../../infrastructure/persistence/prisma/prisma-certificado-avance.repository';
import { PrismaEstadoRepository } from '../../infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaTareaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { AlcanceActorTicket } from '../services/visibilidad-ticket';
import { AnularCertificadoUseCase } from './anular-certificado.use-case';
import { EmitirCertificadoUseCase } from './emitir-certificado.use-case';
import { ListarCertificadosUseCase } from './listar-certificados.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_certificados_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'cliente-certificados';
const SOLICITANTE = '01900000-0000-7000-8000-000000000401';
const CERTIFICADOR = '01900000-0000-7000-8000-000000000402';
const LECTOR = '01900000-0000-7000-8000-000000000403';
const ADMIN = '01900000-0000-7000-8000-000000000404';

describe('Certificados de avance (T3b, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const ticketRepo = new PrismaTicketRepository(tenantContext);
  const tareaRepo = new PrismaTareaTicketRepository(tenantContext);
  const certificadoRepo = new PrismaCertificadoAvanceRepository(tenantContext);
  const estadoRepo = new PrismaEstadoRepository(tenantContext);
  const operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
  const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => undefined });

  const emitir = new EmitirCertificadoUseCase(
    ticketRepo,
    tareaRepo,
    certificadoRepo,
    estadoRepo,
    operacionRepo,
    tipoOperacionRepo,
    txRunner,
  );
  const anular = new AnularCertificadoUseCase(
    ticketRepo,
    certificadoRepo,
    estadoRepo,
    operacionRepo,
    tipoOperacionRepo,
    txRunner,
  );
  const listar = new ListarCertificadosUseCase(ticketRepo, certificadoRepo);

  let tipoId: string;
  let estadoEnProcesoId: string;
  let estadoCerradoId: string;
  let prioridadId: string;
  let numeroSeq = 0;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, fn);

  const alcance = (actorId: string, acciones: AccionTipoTicket[]): AlcanceActorTicket => ({
    actorId,
    permisosPorTipo: new Map([[tipoId, new Set(acciones)]]),
  });
  const CON_CERTIFICAR = (): AlcanceActorTicket =>
    alcance(CERTIFICADOR, ['LECTURA', 'VER_TODOS', 'CERTIFICAR']);
  const SIN_CERTIFICAR = (): AlcanceActorTicket => alcance(LECTOR, ['LECTURA', 'VER_TODOS']);
  const ADMINISTRADOR: AlcanceActorTicket = { actorId: ADMIN, permisosPorTipo: null };

  /** Ticket EXTERNA (o la modalidad dada) con tareas de los pesos dados; `completadas` por índice. */
  async function ticketCon(
    pesos: number[],
    completadas: number[],
    modalidad: 'INTERNA' | 'EXTERNA' = 'EXTERNA',
  ): Promise<{ ticketId: string; tareas: string[] }> {
    numeroSeq += 1;
    const ticket = await client.ticket.create({
      data: {
        numero: `CERT-${numeroSeq}`,
        titulo: 'Obra externa',
        tipoId,
        estadoId: estadoEnProcesoId,
        prioridadId,
        solicitanteId: SOLICITANTE,
        modalidad,
      },
    });
    const tareas: string[] = [];
    for (const [i, peso] of pesos.entries()) {
      const hecha = completadas.includes(i);
      const tarea = await client.tareaTicket.create({
        data: {
          ticketId: ticket.id,
          descripcion: `Tarea ${i}`,
          orden: i,
          peso,
          completada: hecha,
          completadaEn: hecha ? new Date() : null,
          completadaPorId: hecha ? SOLICITANTE : null,
        },
      });
      tareas.push(tarea.id);
    }
    return { ticketId: ticket.id, tareas };
  }

  async function codigosDelHistorial(ticketId: string): Promise<string[]> {
    const operaciones = await client.operacionTicket.findMany({
      where: { ticketId, tipoOperacion: { codigo: { startsWith: 'CERTIFICADO_' } } },
      include: { tipoOperacion: true },
      orderBy: { createdAt: 'asc' },
    });
    return operaciones.map((o) => o.tipoOperacion.codigo);
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: 'T-CERT', nombre: 'Edilicia', modulo: 'EDILICIA' },
      })
    ).id;
    estadoEnProcesoId = (
      await client.estado.upsert({
        where: { codigo: 'EN_PROCESO' },
        update: {},
        create: { codigo: 'EN_PROCESO', nombre: 'En proceso' },
      })
    ).id;
    estadoCerradoId = (
      await client.estado.upsert({
        where: { codigo: 'CERRADO' },
        update: {},
        create: { codigo: 'CERRADO', nombre: 'Cerrado' },
      })
    ).id;
    prioridadId = (await client.prioridad.create({ data: { codigo: 'P-CERT', nombre: 'Media' } }))
      .id;
  }, 120_000);

  afterAll(async () => {
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  it('emite con CERTIFICAR: copia los pesos, calcula el porcentaje, registra quién y lo deja en el historial', async () => {
    const { ticketId, tareas } = await ticketCon([20, 15, 65], [0, 1]);

    const result = await enTenant(() =>
      emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0], tareas[1]] }),
    );

    const certificado = result.getValue();
    expect(certificado.numero).toBe(1);
    expect(certificado.porcentaje).toBe(35);
    expect(certificado.emitidoPorId).toBe(CERTIFICADOR);
    const filas = await client.certificacionTarea.findMany({
      where: { certificacionId: certificado.id },
      orderBy: { peso: 'desc' },
    });
    expect(filas.map((f) => [f.tareaId, f.peso, f.vigente])).toEqual([
      [tareas[0], 20, true],
      [tareas[1], 15, true],
    ]);
    expect(await codigosDelHistorial(ticketId)).toEqual(['CERTIFICADO_EMITIDO']);
  });

  it('S8: cambiar el peso de la tarea después no altera lo certificado', async () => {
    const { ticketId, tareas } = await ticketCon([40, 60], [0]);
    const certificado = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();

    await client.tareaTicket.update({ where: { id: tareas[0] }, data: { peso: 10 } });

    const [releido] = (
      await enTenant(() => listar.execute({ ticketId, alcance: SIN_CERTIFICAR() }))
    ).getValue();
    expect(releido.id).toBe(certificado.id);
    expect(releido.porcentaje).toBe(40);
    expect(releido.tareas).toEqual([{ tareaId: tareas[0], peso: 40 }]);
  });

  it('S6: sin CERTIFICAR responde 403 y no escribe; ADMINISTRADOR certifica sin filas', async () => {
    const { ticketId, tareas } = await ticketCon([50, 50], [0, 1]);

    const sinPermiso = await enTenant(() =>
      emitir.execute({ ticketId, alcance: SIN_CERTIFICAR(), tareaIds: [tareas[0]] }),
    );
    expect(sinPermiso.getError().code).toBe('ACCION_SOBRE_TIPO_NO_PERMITIDA');
    expect(await client.certificacionAvance.count({ where: { ticketId } })).toBe(0);

    const delAdmin = await enTenant(() =>
      emitir.execute({ ticketId, alcance: ADMINISTRADOR, tareaIds: [tareas[0]] }),
    );
    expect(delAdmin.getValue().emitidoPorId).toBe(ADMIN);
  });

  it('S4: con pesos que no suman 100 rechaza y no escribe', async () => {
    const { ticketId, tareas } = await ticketCon([20, 15], [0, 1]);

    const result = await enTenant(() =>
      emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
    );

    expect(result.getError().code).toBe('PESOS_INCOMPLETOS_PARA_CERTIFICAR');
    expect(await client.certificacionAvance.count({ where: { ticketId } })).toBe(0);
  });

  it('S5: una tarea no entra en dos certificados vigentes; anular la libera y el correlativo sigue', async () => {
    const { ticketId, tareas } = await ticketCon([30, 70], [0, 1]);
    const primero = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();

    const repetido = await enTenant(() =>
      emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0], tareas[1]] }),
    );
    expect(repetido.getError().code).toBe('TAREA_NO_CERTIFICABLE');
    expect(await client.certificacionAvance.count({ where: { ticketId } })).toBe(1);

    const anulado = await enTenant(() =>
      anular.execute({
        ticketId,
        certificadoId: primero.id,
        alcance: CON_CERTIFICAR(),
        motivo: 'Se cargó mal',
      }),
    );
    expect(anulado.getValue().vigente).toBe(false);

    const segundo = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();
    expect(segundo.numero).toBe(2);
    expect(await codigosDelHistorial(ticketId)).toEqual([
      'CERTIFICADO_EMITIDO',
      'CERTIFICADO_ANULADO',
      'CERTIFICADO_EMITIDO',
    ]);
    const fila = await client.certificacionAvance.findUniqueOrThrow({ where: { id: primero.id } });
    expect(fila.motivoAnulacion).toBe('Se cargó mal');
    expect(fila.anuladoPorId).toBe(CERTIFICADOR);
  });

  it('S5 en la base: el índice único parcial rechaza una segunda fila vigente de la misma tarea', async () => {
    const { ticketId, tareas } = await ticketCon([100], [0]);
    const certificado = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();
    const otro = await client.certificacionAvance.create({
      data: { ticketId, numero: 99, porcentaje: 100, emitidoPorId: CERTIFICADOR },
    });

    await expect(
      client.certificacionTarea.create({
        data: { certificacionId: otro.id, tareaId: tareas[0], peso: 100 },
      }),
    ).rejects.toThrow();
    expect(
      await client.certificacionTarea.count({ where: { tareaId: tareas[0], vigente: true } }),
    ).toBe(1);
    expect(certificado.vigente).toBe(true);
  });

  it('anular dos veces da 409 y conserva la primera anulación', async () => {
    const { ticketId, tareas } = await ticketCon([100], [0]);
    const certificado = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();
    await enTenant(() =>
      anular.execute({
        ticketId,
        certificadoId: certificado.id,
        alcance: CON_CERTIFICAR(),
        motivo: 'Uno',
      }),
    );

    const segunda = await enTenant(() =>
      anular.execute({
        ticketId,
        certificadoId: certificado.id,
        alcance: ADMINISTRADOR,
        motivo: 'Dos',
      }),
    );

    expect(segunda.getError().code).toBe('CERTIFICADO_YA_ANULADO');
    const fila = await client.certificacionAvance.findUniqueOrThrow({
      where: { id: certificado.id },
    });
    expect(fila.motivoAnulacion).toBe('Uno');
    expect(await codigosDelHistorial(ticketId)).toEqual([
      'CERTIFICADO_EMITIDO',
      'CERTIFICADO_ANULADO',
    ]);
  });

  it('un certificado de otro ticket da 404 y no se anula', async () => {
    const a = await ticketCon([100], [0]);
    const b = await ticketCon([100], [0]);
    const deA = (
      await enTenant(() =>
        emitir.execute({
          ticketId: a.ticketId,
          alcance: CON_CERTIFICAR(),
          tareaIds: [a.tareas[0]],
        }),
      )
    ).getValue();

    const result = await enTenant(() =>
      anular.execute({
        ticketId: b.ticketId,
        certificadoId: deA.id,
        alcance: CON_CERTIFICAR(),
        motivo: 'x',
      }),
    );

    expect(result.getError().code).toBe('CERTIFICADO_NO_ENCONTRADO');
    const fila = await client.certificacionAvance.findUniqueOrThrow({ where: { id: deA.id } });
    expect(fila.anuladoEn).toBeNull();
  });

  it('un ticket INTERNA o CERRADO no certifica', async () => {
    const interno = await ticketCon([100], [0], 'INTERNA');
    const cerrado = await ticketCon([100], [0]);
    await client.ticket.update({
      where: { id: cerrado.ticketId },
      data: { estadoId: estadoCerradoId },
    });

    const r1 = await enTenant(() =>
      emitir.execute({
        ticketId: interno.ticketId,
        alcance: CON_CERTIFICAR(),
        tareaIds: [interno.tareas[0]],
      }),
    );
    const r2 = await enTenant(() =>
      emitir.execute({
        ticketId: cerrado.ticketId,
        alcance: CON_CERTIFICAR(),
        tareaIds: [cerrado.tareas[0]],
      }),
    );

    expect(r1.getError().code).toBe('CERTIFICADO_SOLO_EXTERNO');
    expect(r2.getError().code).toBe('CERTIFICACION_TICKET_CERRADO');
    expect(
      await client.certificacionAvance.count({
        where: { ticketId: { in: [interno.ticketId, cerrado.ticketId] } },
      }),
    ).toBe(0);
  });

  it('dos emisiones a la par con la misma tarea: una gana, la otra se rechaza (lock del ticket)', async () => {
    const { ticketId, tareas } = await ticketCon([100], [0]);

    const resultados = await Promise.all([
      enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      ),
      enTenant(() => emitir.execute({ ticketId, alcance: ADMINISTRADOR, tareaIds: [tareas[0]] })),
    ]);

    expect(resultados.filter((r) => r.isOk())).toHaveLength(1);
    expect(resultados.find((r) => r.isFail())?.getError().code).toBe('TAREA_NO_CERTIFICABLE');
    expect(await client.certificacionAvance.count({ where: { ticketId } })).toBe(1);
  });

  it('S6: anular sin CERTIFICAR responde 403 y no toca el certificado ni el historial', async () => {
    const { ticketId, tareas } = await ticketCon([100], [0]);
    const certificado = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();

    const result = await enTenant(() =>
      anular.execute({
        ticketId,
        certificadoId: certificado.id,
        alcance: SIN_CERTIFICAR(),
        motivo: 'Intento sin permiso',
      }),
    );

    expect(result.getError().code).toBe('ACCION_SOBRE_TIPO_NO_PERMITIDA');
    const fila = await client.certificacionAvance.findUniqueOrThrow({
      where: { id: certificado.id },
    });
    expect(fila.anuladoEn).toBeNull();
    expect(
      await client.certificacionTarea.count({
        where: { certificacionId: certificado.id, vigente: true },
      }),
    ).toBe(1);
    expect(await codigosDelHistorial(ticketId)).toEqual(['CERTIFICADO_EMITIDO']);
  });

  it('S6: con CERTIFICAR pero sin ver el ticket, emitir y anular dan 404 sin revelar el certificado', async () => {
    const { ticketId, tareas } = await ticketCon([100], [0]);
    const certificado = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();
    // Tiene LECTURA y CERTIFICAR pero no VER_TODOS: la regla de fila no lo deja ver un ticket ajeno.
    const sinVerLaFila = alcance(LECTOR, ['LECTURA', 'CERTIFICAR']);

    const anulacion = await enTenant(() =>
      anular.execute({
        ticketId,
        certificadoId: certificado.id,
        alcance: sinVerLaFila,
        motivo: 'x',
      }),
    );
    const emision = await enTenant(() =>
      emitir.execute({ ticketId, alcance: sinVerLaFila, tareaIds: [tareas[0]] }),
    );

    expect(anulacion.getError().code).toBe('TICKET_NO_ENCONTRADO');
    expect(emision.getError().code).toBe('TICKET_NO_ENCONTRADO');
    const fila = await client.certificacionAvance.findUniqueOrThrow({
      where: { id: certificado.id },
    });
    expect(fila.anuladoEn).toBeNull();
  });

  it('L26: con el ticket cerrado no se anula un certificado vigente', async () => {
    const { ticketId, tareas } = await ticketCon([100], [0]);
    const certificado = (
      await enTenant(() =>
        emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
      )
    ).getValue();
    await client.ticket.update({ where: { id: ticketId }, data: { estadoId: estadoCerradoId } });

    const result = await enTenant(() =>
      anular.execute({
        ticketId,
        certificadoId: certificado.id,
        alcance: ADMINISTRADOR,
        motivo: 'x',
      }),
    );

    expect(result.getError().code).toBe('CERTIFICACION_TICKET_CERRADO');
    const fila = await client.certificacionAvance.findUniqueOrThrow({
      where: { id: certificado.id },
    });
    expect(fila.anuladoEn).toBeNull();
  });

  it('S4/S5: una tarea borrada no se certifica ni cuenta para el 100', async () => {
    const { ticketId, tareas } = await ticketCon([70, 30], [0, 1]);
    await client.tareaTicket.update({ where: { id: tareas[1] }, data: { deletedAt: new Date() } });

    const result = await enTenant(() =>
      emitir.execute({ ticketId, alcance: CON_CERTIFICAR(), tareaIds: [tareas[0]] }),
    );

    expect(result.getError().code).toBe('PESOS_INCOMPLETOS_PARA_CERTIFICAR');
    expect(result.getError().message).toContain('70 %');
    expect(await client.certificacionAvance.count({ where: { ticketId } })).toBe(0);
  });

  it('listar exige ver el ticket: sin LECTURA es 404', async () => {
    const { ticketId } = await ticketCon([100], [0]);

    const result = await enTenant(() =>
      listar.execute({ ticketId, alcance: { actorId: LECTOR, permisosPorTipo: new Map() } }),
    );

    expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
  });
});
