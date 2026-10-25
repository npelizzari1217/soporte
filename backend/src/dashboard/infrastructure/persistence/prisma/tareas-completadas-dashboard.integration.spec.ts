/**
 * [INTEGRATION] Métrica "tareas completadas por técnico" del dashboard (odd/tareas-con-tecnico T4,
 * CA6) contra Postgres REAL, en una base de INQUILINO EFÍMERA migrada con todas las migraciones.
 * Arma `ObtenerMetricasUseCase` con los repositorios Prisma reales del dashboard, de las tareas y
 * de los ciclos; solo los nombres de master se reemplazan por un doble, porque no hace falta tocar
 * master para probar el conteo.
 *
 * Cubre: el borde del período sobre `completada_en`, la exclusión de tareas y tickets dados de
 * baja, el crédito para quien completó (no para el técnico asignado), que descompletar quita el
 * crédito, el alcance de TECNICO, y que las métricas por ticket no cambian al sumar tareas.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TareaTicketEntity } from '../../../../tickets/domain/entities/tarea-ticket.entity';
import { PrismaTareaTicketRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaCicloClienteRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import {
  MetricasResult,
  ObtenerMetricasUseCase,
} from '../../../application/use-cases/obtener-metricas.use-case';
import { AlcanceActorTicket } from '../../../../tickets/application/services/visibilidad-ticket';
import { alcancePorTipo } from '../../../../tickets/test-helpers/alcance-ticket';
import { PrismaCumplimientoTecnicoRepository } from '../../../../tiempo-tecnico/infrastructure/prisma-cumplimiento-tecnico.repository';
import { PrismaDashboardRepository } from './prisma-dashboard.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_dashboard_tareas_${randomBytes(4).toString('hex')}_test`;
const SOLICITANTE = '01900000-0000-7000-8000-000000000401';
const TECNICO_X = '01900000-0000-7000-8000-000000000402';
const TECNICO_Y = '01900000-0000-7000-8000-000000000403';
const CICLO_VIGENTE = '01900000-0000-7000-8000-000000000404';

describe('Dashboard: tareas completadas por técnico (T4, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const tareaRepo = new PrismaTareaTicketRepository(tenantContext);
  const nombres = new Map([
    [TECNICO_X, { nombre: 'Xenia', apellido: 'Ruiz' }],
    [TECNICO_Y, { nombre: 'Yago', apellido: 'Sosa' }],
  ]);
  const useCase = new ObtenerMetricasUseCase(
    new PrismaDashboardRepository(tenantContext),
    new PrismaCicloClienteRepository(tenantContext),
    { resumenPorScope: async () => ({ promedio: null, respuestas: 0 }) },
    tareaRepo,
    {
      resolverNombres: async (ids) => new Map([...nombres].filter(([id]) => ids.includes(id))),
    },
    new PrismaCumplimientoTecnicoRepository(tenantContext),
  );

  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let numero = 0;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-dashboard' }, fn);

  /** Por defecto sin restricción por tipo (ROOT y ADMINISTRADOR), salvo en los tests de alcance. */
  const metricas = (
    actorId: string,
    actorRol: string,
    cicloId: string,
    alcance: AlcanceActorTicket = { actorId, permisosPorTipo: null },
  ): Promise<MetricasResult> =>
    enTenant(() => useCase.execute({ actorId, actorRol, cicloId, alcance }));

  async function crearCiclo(fechaInicio: string, fechaFin: string): Promise<string> {
    const ciclo = await client.cicloCliente.create({
      data: {
        cicloVigenteId: CICLO_VIGENTE,
        nombre: `Ciclo ${fechaInicio}`,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        activo: false,
      },
    });
    return ciclo.id;
  }

  async function crearTicket(
    cicloId: string | null,
    asignadoId: string | null = null,
    tipo: string = tipoId,
  ) {
    numero += 1;
    const ticket = await client.ticket.create({
      data: {
        numero: `DT-${numero}`,
        titulo: 'Ticket con tareas del dashboard',
        tipoId: tipo,
        estadoId,
        prioridadId,
        solicitanteId: SOLICITANTE,
        cicloId,
        asignadoId,
      },
    });
    return ticket.id;
  }

  async function tareaCompletada(
    ticketId: string,
    por: string,
    en: string,
    tecnicoId: string | null = por,
  ): Promise<TareaTicketEntity> {
    const tarea = TareaTicketEntity.crear({
      ticketId,
      descripcion: `t-${en}`,
      orden: 0,
      tecnicoId,
    });
    await enTenant(() => tareaRepo.crear(tarea));
    expect(tarea.completar(por, new Date(en)).isOk()).toBe(true);
    await enTenant(() => tareaRepo.completarSiPendiente(tarea));
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
        data: { codigo: 'T-DASH-TAREAS', nombre: 'Tareas', modulo: 'TICKETS' },
      })
    ).id;
    estadoId = (
      await client.estado.create({ data: { codigo: 'E-DASH-TAREAS', nombre: 'Abierto' } })
    ).id;
    prioridadId = (
      await client.prioridad.create({ data: { codigo: 'P-DASH-TAREAS', nombre: 'Media' } })
    ).id;
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

  it('el período son los días argentinos del ciclo sobre completada_en (corta a las 03:00 UTC), sin importar el ciclo del ticket', async () => {
    const octubre = await crearCiclo('2026-10-01', '2026-10-31');
    const anterior = await crearCiclo('2026-09-01', '2026-09-30');
    const ticket = await crearTicket(octubre);
    const ticketCicloAnterior = await crearTicket(anterior);

    // Argentina es UTC-3 fijo: el día argentino 1/10 empieza a las 03:00 UTC (T11, JD-W2).
    await tareaCompletada(ticket, TECNICO_X, '2026-10-01T03:00:00.000Z'); // 00:00 ART del 1/10: entra
    await tareaCompletada(ticket, TECNICO_X, '2026-11-01T02:59:59.999Z'); // 23:59 ART del 31/10: entra
    await tareaCompletada(ticket, TECNICO_X, '2026-11-01T03:00:00.000Z'); // 00:00 ART del 1/11: afuera
    await tareaCompletada(ticket, TECNICO_X, '2026-10-01T02:59:59.999Z'); // 23:59 ART del 30/9: afuera
    // Ticket de otro ciclo, tarea completada en octubre: cuenta en octubre.
    await tareaCompletada(ticketCicloAnterior, TECNICO_Y, '2026-10-15T12:00:00.000Z');

    const result = await metricas('admin', 'ADMINISTRADOR', octubre);

    expect(result.tareasCompletadasPorTecnico).toEqual([
      { usuarioId: TECNICO_X, nombre: 'Xenia', apellido: 'Ruiz', completadas: 2 },
      { usuarioId: TECNICO_Y, nombre: 'Yago', apellido: 'Sosa', completadas: 1 },
    ]);
    const septiembre = await metricas('admin', 'ADMINISTRADOR', anterior);
    expect(septiembre.tareasCompletadasPorTecnico).toEqual([
      { usuarioId: TECNICO_X, nombre: 'Xenia', apellido: 'Ruiz', completadas: 1 },
    ]);
  });

  it('excluye tareas dadas de baja y tareas de tickets dados de baja', async () => {
    const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
    const ticket = await crearTicket(ciclo);
    const ticketBorrado = await crearTicket(ciclo);

    await tareaCompletada(ticket, TECNICO_X, '2026-10-05T10:00:00.000Z');
    const borrada = await tareaCompletada(ticket, TECNICO_X, '2026-10-06T10:00:00.000Z');
    await enTenant(() => tareaRepo.eliminar(borrada.id, new Date()));
    await tareaCompletada(ticketBorrado, TECNICO_Y, '2026-10-07T10:00:00.000Z');
    await client.ticket.update({ where: { id: ticketBorrado }, data: { deletedAt: new Date() } });

    const result = await metricas('admin', 'ADMINISTRADOR', ciclo);

    expect(result.tareasCompletadasPorTecnico).toEqual([
      { usuarioId: TECNICO_X, nombre: 'Xenia', apellido: 'Ruiz', completadas: 1 },
    ]);
  });

  it('el crédito es de quien completó, no del técnico asignado, y descompletar lo quita', async () => {
    const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
    const ticket = await crearTicket(ciclo, TECNICO_Y);

    // Tarea asignada a Y, completada por X: cuenta para X.
    await tareaCompletada(ticket, TECNICO_X, '2026-10-10T10:00:00.000Z', TECNICO_Y);
    const descompletada = await tareaCompletada(ticket, TECNICO_Y, '2026-10-11T10:00:00.000Z');

    const antes = await metricas('admin', 'ADMINISTRADOR', ciclo);
    expect(antes.tareasCompletadasPorTecnico.map((f) => [f.usuarioId, f.completadas])).toEqual([
      [TECNICO_X, 1],
      [TECNICO_Y, 1],
    ]);

    expect(descompletada.descompletar(new Date()).isOk()).toBe(true);
    await enTenant(() => tareaRepo.descompletarSiCompletada(descompletada));

    const despues = await metricas('admin', 'ADMINISTRADOR', ciclo);
    expect(despues.tareasCompletadasPorTecnico).toEqual([
      { usuarioId: TECNICO_X, nombre: 'Xenia', apellido: 'Ruiz', completadas: 1 },
    ]);
  });

  it('un TECNICO ve solo su fila, por completada_por_id; sin tareas en el período, lista vacía', async () => {
    const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
    // El ticket es de X: el alcance de las tareas no depende del responsable del ticket.
    const ticket = await crearTicket(ciclo, TECNICO_X);
    await tareaCompletada(ticket, TECNICO_X, '2026-10-02T10:00:00.000Z');
    await tareaCompletada(ticket, TECNICO_X, '2026-10-03T10:00:00.000Z');
    await tareaCompletada(ticket, TECNICO_Y, '2026-10-04T10:00:00.000Z');

    const deY = await metricas(TECNICO_Y, 'TECNICO', ciclo);
    expect(deY.tareasCompletadasPorTecnico).toEqual([
      { usuarioId: TECNICO_Y, nombre: 'Yago', apellido: 'Sosa', completadas: 1 },
    ]);

    const vacio = await crearCiclo('2026-12-01', '2026-12-31');
    const sinTareas = await metricas('admin', 'ADMINISTRADOR', vacio);
    expect(sinTareas.tareasCompletadasPorTecnico).toEqual([]);
  });

  it('CA6: sumar y completar tareas no cambia ninguna métrica por ticket', async () => {
    const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
    const ticket = await crearTicket(ciclo, TECNICO_Y);
    await crearTicket(ciclo, TECNICO_X);

    const sinTareas = await metricas('admin', 'ADMINISTRADOR', ciclo);
    await tareaCompletada(ticket, TECNICO_X, '2026-10-10T10:00:00.000Z', TECNICO_X);
    await tareaCompletada(ticket, TECNICO_X, '2026-10-11T10:00:00.000Z', TECNICO_X);
    const conTareas = await metricas('admin', 'ADMINISTRADOR', ciclo);

    const { tareasCompletadasPorTecnico: antes, ...porTicketAntes } = sinTareas;
    const { tareasCompletadasPorTecnico: despues, ...porTicketDespues } = conTareas;
    expect(antes).toEqual([]);
    expect(despues).toHaveLength(1);
    expect(porTicketDespues).toStrictEqual(porTicketAntes);
    // La carga sigue siendo del responsable del ticket, no de quien completó las tareas.
    expect(porTicketDespues.abiertos).toBe(2);
    expect(
      [...porTicketDespues.cargaPorAgente].sort((a, b) => a.asignadoId.localeCompare(b.asignadoId)),
    ).toEqual([
      { asignadoId: TECNICO_X, abiertos: 1 },
      { asignadoId: TECNICO_Y, abiertos: 1 },
    ]);
  });

  it('alcance por tipo (odd/permisos-por-tipo-ticket, D5 e): métricas por ticket y tareas agregan solo lo que el actor ve', async () => {
    const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
    const otroTipo = (
      await client.tipoTicket.create({
        data: {
          codigo: `T-DASH-SINLEC-${randomBytes(3).toString('hex')}`,
          nombre: 'Sin lectura',
          modulo: 'TICKETS',
        },
      })
    ).id;
    try {
      // X es responsable de `propio`: lo ve por la regla de fila. `ajeno` es de Y. `sinLectura`
      // es de X pero de un tipo sin LECTURA: no lo ve nadie con este alcance (S3).
      const propio = await crearTicket(ciclo, TECNICO_X);
      const ajeno = await crearTicket(ciclo, TECNICO_Y);
      const sinLectura = await crearTicket(ciclo, TECNICO_X, otroTipo);
      await tareaCompletada(propio, TECNICO_X, '2026-10-05T10:00:00.000Z');
      await tareaCompletada(ajeno, TECNICO_Y, '2026-10-06T10:00:00.000Z');
      await tareaCompletada(sinLectura, TECNICO_X, '2026-10-07T10:00:00.000Z');

      const porFila = await metricas(
        TECNICO_X,
        'COLABORADOR',
        ciclo,
        alcancePorTipo(TECNICO_X, { [tipoId]: ['LECTURA'], [otroTipo]: ['VER_TODOS'] }),
      );
      expect(porFila.abiertos).toBe(1);
      expect(porFila.cargaPorAgente).toEqual([{ asignadoId: TECNICO_X, abiertos: 1 }]);
      expect(porFila.distribucionPorTipo).toEqual([{ tipoId, total: 1 }]);
      expect(porFila.tareasCompletadasPorTecnico).toEqual([
        { usuarioId: TECNICO_X, nombre: 'Xenia', apellido: 'Ruiz', completadas: 1 },
      ]);

      // Con VER_TODOS sobre el tipo entra también el ajeno; el tipo sin LECTURA sigue afuera.
      const verTodos = await metricas(
        TECNICO_X,
        'COLABORADOR',
        ciclo,
        alcancePorTipo(TECNICO_X, { [tipoId]: ['LECTURA', 'VER_TODOS'] }),
      );
      expect(verTodos.abiertos).toBe(2);
      expect(verTodos.distribucionPorTipo).toEqual([{ tipoId, total: 2 }]);
      expect(verTodos.tareasCompletadasPorTecnico.map((f) => [f.usuarioId, f.completadas])).toEqual(
        [
          [TECNICO_X, 1],
          [TECNICO_Y, 1],
        ],
      );

      // Sin restricción (ADMINISTRADOR) entran los tres.
      expect((await metricas('admin', 'ADMINISTRADOR', ciclo)).abiertos).toBe(3);
    } finally {
      await limpiarFilas();
      await client.tipoTicket.delete({ where: { id: otroTipo } });
    }
  });
});
