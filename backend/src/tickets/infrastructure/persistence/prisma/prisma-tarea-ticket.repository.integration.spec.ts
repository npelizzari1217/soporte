/**
 * [INTEGRATION] PrismaTareaTicketRepository (odd/tareas-con-tecnico T1) contra Postgres REAL, en
 * una base de INQUILINO EFÍMERA migrada con todas las migraciones: alta, listado ordenado y por
 * lote, guardado de cambios, baja lógica, la métrica de completadas por técnico, el CHECK de
 * completado y la FK con ON DELETE RESTRICT.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TareaTicketEntity } from '../../../domain/entities/tarea-ticket.entity';
import { PrismaTareaTicketRepository } from './prisma-tarea-ticket.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_tareas_ticket_${randomBytes(4).toString('hex')}_test`;
const SOLICITANTE = '01900000-0000-7000-8000-000000000101';
const TECNICO_A = '01900000-0000-7000-8000-000000000102';
const TECNICO_B = '01900000-0000-7000-8000-000000000103';
const CICLO_FUERA = '01900000-0000-7000-8000-000000000104';

describe('PrismaTareaTicketRepository (T1, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const repo = new PrismaTareaTicketRepository(tenantContext);
  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let numero = 0;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-tareas' }, fn);

  async function crearTicket(extra: { cicloId?: string } = {}): Promise<string> {
    numero += 1;
    const ticket = await client.ticket.create({
      data: {
        numero: `TT-${numero}`,
        titulo: 'Ticket con tareas',
        tipoId,
        estadoId,
        prioridadId,
        solicitanteId: SOLICITANTE,
        cicloId: extra.cicloId ?? null,
      },
    });
    return ticket.id;
  }

  async function crearTarea(
    ticketId: string,
    descripcion: string,
    orden: number,
    tecnicoId: string | null = null,
  ): Promise<TareaTicketEntity> {
    const tarea = TareaTicketEntity.crear({ ticketId, descripcion, orden, tecnicoId });
    await enTenant(() => repo.crear(tarea));
    return tarea;
  }

  async function limpiarFilas(): Promise<void> {
    await client.tareaTicket.deleteMany();
    await client.ticket.deleteMany();
    await client.cicloCliente.deleteMany();
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);

    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: 'T-TAREAS', nombre: 'Tareas', modulo: 'TICKETS' },
      })
    ).id;
    estadoId = (await client.estado.create({ data: { codigo: 'E-TAREAS', nombre: 'Abierto' } })).id;
    prioridadId = (await client.prioridad.create({ data: { codigo: 'P-TAREAS', nombre: 'Media' } }))
      .id;
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

  it('crear + buscarPorId persiste todos los campos', async () => {
    const ticketId = await crearTicket();
    const tarea = await crearTarea(ticketId, 'Revisar tablero', 3, TECNICO_A);

    const leida = await enTenant(() => repo.buscarPorId(tarea.id));

    expect(leida).not.toBeNull();
    expect(leida!.ticketId).toBe(ticketId);
    expect(leida!.descripcion).toBe('Revisar tablero');
    expect(leida!.orden).toBe(3);
    expect(leida!.tecnicoId).toBe(TECNICO_A);
    expect(leida!.completada).toBe(false);
    expect(leida!.completadaEn).toBeNull();
    expect(leida!.completadaPorId).toBeNull();
    expect(leida!.deletedAt).toBeNull();
  });

  it('buscarPorId devuelve null si no existe e incluye las dadas de baja', async () => {
    const ticketId = await crearTicket();
    const tarea = await crearTarea(ticketId, 'Borrada', 0);
    await enTenant(() => repo.eliminar(tarea.id, new Date('2026-10-13T12:00:00Z')));

    await expect(
      enTenant(() => repo.buscarPorId('99999999-9999-4999-8999-999999999999')),
    ).resolves.toBeNull();
    const borrada = await enTenant(() => repo.buscarPorId(tarea.id));
    expect(borrada!.deletedAt).toEqual(new Date('2026-10-13T12:00:00Z'));
  });

  it('listarPorTicket devuelve solo las activas del ticket, por orden', async () => {
    const ticketId = await crearTicket();
    const otroTicket = await crearTicket();
    await crearTarea(ticketId, 'segunda', 2);
    await crearTarea(ticketId, 'primera', 1);
    const borrada = await crearTarea(ticketId, 'borrada', 0);
    await crearTarea(otroTicket, 'ajena', 0);
    await enTenant(() => repo.eliminar(borrada.id, new Date()));

    const tareas = await enTenant(() => repo.listarPorTicket(ticketId));

    expect(tareas.map((t) => t.descripcion)).toEqual(['primera', 'segunda']);
  });

  it('listarPorTickets agrupa por ticket, conserva el orden y omite los tickets sin tareas', async () => {
    const a = await crearTicket();
    const b = await crearTicket();
    const sinTareas = await crearTicket();
    await crearTarea(a, 'a2', 2);
    await crearTarea(b, 'b1', 1);
    await crearTarea(a, 'a1', 1);

    const porTicket = await enTenant(() => repo.listarPorTickets([a, b, sinTareas]));

    expect(porTicket.get(a)!.map((t) => t.descripcion)).toEqual(['a1', 'a2']);
    expect(porTicket.get(b)!.map((t) => t.descripcion)).toEqual(['b1']);
    expect(porTicket.has(sinTareas)).toBe(false);
    await expect(enTenant(() => repo.listarPorTickets([]))).resolves.toEqual(new Map());
  });

  it('las escrituras condicionadas persisten técnico, completado, descompletado y baja lógica', async () => {
    const ticketId = await crearTicket();
    const tarea = await crearTarea(ticketId, 'Cambiar lámpara', 0);
    const ahora = new Date('2026-10-13T15:00:00Z');

    tarea.asignarTecnico(TECNICO_A, ahora);
    await expect(enTenant(() => repo.asignarTecnicoSiActiva(tarea))).resolves.toBe(true);
    tarea.completar(TECNICO_B, ahora);
    await expect(enTenant(() => repo.completarSiPendiente(tarea))).resolves.toBe(true);
    const completada = await enTenant(() => repo.buscarPorId(tarea.id));
    expect(completada!.tecnicoId).toBe(TECNICO_A);
    expect(completada!.completada).toBe(true);
    expect(completada!.completadaEn).toEqual(ahora);
    expect(completada!.completadaPorId).toBe(TECNICO_B);

    tarea.descompletar(ahora);
    await expect(enTenant(() => repo.descompletarSiCompletada(tarea))).resolves.toBe(true);
    tarea.eliminar(ahora);
    await expect(enTenant(() => repo.darDeBajaSiActiva(tarea))).resolves.toBe(true);
    const final = await enTenant(() => repo.buscarPorId(tarea.id));
    expect(final!.completada).toBe(false);
    expect(final!.completadaEn).toBeNull();
    expect(final!.completadaPorId).toBeNull();
    expect(final!.deletedAt).toEqual(ahora);
  });

  it('una escritura condicionada que no cumple su condición devuelve false y no escribe', async () => {
    const ticketId = await crearTicket();
    const leer = async (id: string): Promise<TareaTicketEntity> => {
      const tarea = await enTenant(() => repo.buscarPorId(id));
      if (!tarea) throw new Error(`no existe la tarea ${id}`);
      return tarea;
    };
    const ahora = new Date('2026-10-13T15:00:00Z');

    // Completada por debajo: un segundo completado no pisa el crédito.
    const completada = await crearTarea(ticketId, 'Ya completada', 0);
    const primera = await leer(completada.id);
    primera.completar(TECNICO_A, ahora);
    await enTenant(() => repo.completarSiPendiente(primera));
    completada.completar(TECNICO_B, new Date('2026-10-13T16:00:00Z'));
    await expect(enTenant(() => repo.completarSiPendiente(completada))).resolves.toBe(false);
    expect((await leer(completada.id)).completadaPorId).toBe(TECNICO_A);

    // Pendiente: descompletar no aplica.
    const pendiente = await crearTarea(ticketId, 'Pendiente', 1);
    const copia = await leer(pendiente.id);
    copia.completar(TECNICO_A, ahora);
    copia.descompletar(ahora);
    await expect(enTenant(() => repo.descompletarSiCompletada(copia))).resolves.toBe(false);

    // Dada de baja por debajo: ninguna escritura la revive ni la cambia.
    const borrada = await crearTarea(ticketId, 'Borrada', 2);
    const baja = await leer(borrada.id);
    baja.eliminar(ahora);
    await enTenant(() => repo.darDeBajaSiActiva(baja));
    borrada.asignarTecnico(TECNICO_A, ahora);
    await expect(enTenant(() => repo.asignarTecnicoSiActiva(borrada))).resolves.toBe(false);
    borrada.completar(TECNICO_A, ahora);
    await expect(enTenant(() => repo.completarSiPendiente(borrada))).resolves.toBe(false);
    await expect(enTenant(() => repo.darDeBajaSiActiva(baja))).resolves.toBe(false);
    const final = await leer(borrada.id);
    expect(final.deletedAt).toEqual(ahora);
    expect(final.tecnicoId).toBeNull();
    expect(final.completada).toBe(false);
  });

  it('contarCompletadasPorTecnico cuenta por quien completó, en [desde, hasta), sin bajas', async () => {
    const ciclo = await client.cicloCliente.create({
      data: {
        cicloVigenteId: CICLO_FUERA,
        nombre: 'Ciclo de test',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
      },
    });
    const ticket = await crearTicket({ cicloId: ciclo.id });
    const otroTicket = await crearTicket();
    const desde = new Date('2026-10-01T00:00:00Z');
    const hasta = new Date('2026-11-01T00:00:00Z');

    const completarEn = async (
      ticketId: string,
      por: string,
      en: Date,
    ): Promise<TareaTicketEntity> => {
      const t = await crearTarea(ticketId, `t-${en.toISOString()}`, 0, TECNICO_A);
      t.completar(por, en);
      await enTenant(() => repo.completarSiPendiente(t));
      return t;
    };
    await completarEn(ticket, TECNICO_A, desde); // borde inferior: entra
    await completarEn(ticket, TECNICO_A, new Date('2026-10-15T00:00:00Z'));
    await completarEn(otroTicket, TECNICO_B, new Date('2026-10-20T00:00:00Z'));
    await completarEn(ticket, TECNICO_B, hasta); // borde superior: queda afuera
    await completarEn(ticket, TECNICO_B, new Date('2026-09-30T23:59:59Z')); // antes: afuera
    const borrada = await completarEn(ticket, TECNICO_B, new Date('2026-10-10T00:00:00Z'));
    await enTenant(() => repo.eliminar(borrada.id, new Date()));
    await crearTarea(ticket, 'pendiente', 0, TECNICO_B);

    await expect(
      enTenant(() => repo.contarCompletadasPorTecnico({ desde, hasta })),
    ).resolves.toEqual([
      { completadaPorId: TECNICO_A, completadas: 2 },
      { completadaPorId: TECNICO_B, completadas: 1 },
    ]);
    await expect(
      enTenant(() =>
        repo.contarCompletadasPorTecnico({ desde, hasta, completadaPorId: TECNICO_B }),
      ),
    ).resolves.toEqual([{ completadaPorId: TECNICO_B, completadas: 1 }]);
    await expect(
      enTenant(() => repo.contarCompletadasPorTecnico({ desde, hasta, cicloId: ciclo.id })),
    ).resolves.toEqual([{ completadaPorId: TECNICO_A, completadas: 2 }]);

    await client.ticket.update({ where: { id: ticket }, data: { deletedAt: new Date() } });
    await expect(
      enTenant(() => repo.contarCompletadasPorTecnico({ desde, hasta })),
    ).resolves.toEqual([{ completadaPorId: TECNICO_B, completadas: 1 }]);
  });

  it('el CHECK rechaza una tarea completada sin quién o cuándo, y una pendiente con registro', async () => {
    const ticketId = await crearTicket();
    const base = { ticketId, descripcion: 'x', orden: 0 };

    await expect(
      client.tareaTicket.create({ data: { ...base, completada: true, completadaEn: new Date() } }),
    ).rejects.toThrow(/tareas_ticket_completada_check/);
    await expect(
      client.tareaTicket.create({
        data: { ...base, completada: true, completadaPorId: TECNICO_A },
      }),
    ).rejects.toThrow(/tareas_ticket_completada_check/);
    await expect(
      client.tareaTicket.create({
        data: { ...base, completada: false, completadaPorId: TECNICO_A },
      }),
    ).rejects.toThrow(/tareas_ticket_completada_check/);
  });

  it('la FK exige un ticket existente y frena el borrado físico de un ticket con tareas', async () => {
    const ticketId = await crearTicket();
    await crearTarea(ticketId, 'ancla', 0);

    await expect(
      enTenant(() =>
        repo.crear(TareaTicketEntity.crear({ ticketId: CICLO_FUERA, descripcion: 'x', orden: 0 })),
      ),
    ).rejects.toThrow();
    await expect(client.ticket.delete({ where: { id: ticketId } })).rejects.toThrow();
  });
});
