/**
 * [INTEGRATION] Lectura de los tramos del técnico (odd/tasks/tiempo-tecnico.md, T4, S4, S8) contra
 * Postgres REAL, en una base de inquilino efímera migrada con todas las migraciones.
 *
 * - Dashboard: `ObtenerMetricasUseCase` con los repositorios Prisma reales (dashboard, tareas,
 *   ciclos y `PrismaCumplimientoTecnicoRepository`). Cubre el borde del período sobre `fin_at` en
 *   la medianoche argentina, qué tramos cuentan (solo RESUELTO con veredicto), la exclusión de los
 *   tickets borrados, el alcance de TECNICO y el alcance por tipo.
 * - Detalle: `ListarTramosTicketUseCase` con `PrismaTicketRepository` real. Los tramos los ve
 *   exactamente quien ve el ticket.
 *
 * Los tramos se insertan con SQL directo (su escritura la prueba `tramos-tecnico.integration.spec.ts`);
 * `cumplido` se calcula como lo exige el CHECK. Master es un doble de nombres: no se toca master,
 * sin `usarLockMasterTest()`. Higiene: filas -> cerrar cliente -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { PrismaTareaTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaCicloClienteRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { PrismaTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaDashboardRepository } from '../dashboard/infrastructure/persistence/prisma/prisma-dashboard.repository';
import {
  MetricasResult,
  ObtenerMetricasUseCase,
} from '../dashboard/application/use-cases/obtener-metricas.use-case';
import { AlcanceActorTicket } from '../tickets/application/services/visibilidad-ticket';
import { TicketNoEncontradoError } from '../tickets/domain/errors/tickets.errors';
import { alcancePorTipo, alcanceSinRestriccion } from '../tickets/test-helpers/alcance-ticket';
import { ListarTramosTicketUseCase } from './application/listar-tramos-ticket.use-case';
import { MotivoFinTramo } from './domain/tramo-tecnico';
import { PrismaCumplimientoTecnicoRepository } from './infrastructure/prisma-cumplimiento-tecnico.repository';
import { PrismaTramoTecnicoRepository } from './infrastructure/prisma-tramo-tecnico.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_tiempo_lectura_${randomBytes(4).toString('hex')}_test`;
const SOLICITANTE = '01900000-0000-7000-8000-000000000d01';
const ANA = '01900000-0000-7000-8000-000000000d0a';
const BETO = '01900000-0000-7000-8000-000000000d0b';
const AJENO = '01900000-0000-7000-8000-000000000d0c';
const CICLO_VIGENTE = '01900000-0000-7000-8000-000000000d04';
const META_S = 4 * 3600;

interface Cierre {
  fin: string;
  motivo: MotivoFinTramo;
  habilS: number | null;
  metaS: number | null;
}

describe('Tiempo del técnico — lectura en el dashboard y en el detalle (T4, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const nombres = new Map([
    [ANA, { nombre: 'Ana', apellido: 'Paz' }],
    [BETO, { nombre: 'Beto', apellido: 'Sosa' }],
  ]);
  const metricasUseCase = new ObtenerMetricasUseCase(
    new PrismaDashboardRepository(tenantContext),
    new PrismaCicloClienteRepository(tenantContext),
    { resumenPorScope: async () => ({ promedio: null, respuestas: 0 }) },
    new PrismaTareaTicketRepository(tenantContext),
    {
      resolverNombres: async (ids) => new Map([...nombres].filter(([id]) => ids.includes(id))),
    },
    new PrismaCumplimientoTecnicoRepository(tenantContext),
  );
  const listarTramos = new ListarTramosTicketUseCase(
    new PrismaTicketRepository(tenantContext),
    new PrismaTramoTecnicoRepository(tenantContext),
  );

  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let numero = 0;

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-tiempo' }, fn);

  const metricas = (
    actorId: string,
    actorRol: string,
    cicloId: string,
    alcance: AlcanceActorTicket = alcanceSinRestriccion(actorId),
  ): Promise<MetricasResult> =>
    enTenant(() => metricasUseCase.execute({ actorId, actorRol, cicloId, alcance }));

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

  async function crearTicket(asignadoId: string | null, tipo: string = tipoId): Promise<string> {
    numero += 1;
    const ticket = await client.ticket.create({
      data: {
        numero: `TL-${numero}`,
        titulo: 'Ticket con tramos',
        tipoId: tipo,
        estadoId,
        prioridadId,
        solicitanteId: SOLICITANTE,
        asignadoId,
      },
    });
    return ticket.id;
  }

  /** Inserta un tramo cerrado (o abierto, sin `cierre`) con el `cumplido` que exige el CHECK. */
  async function tramo(
    ticketId: string,
    tecnicoId: string,
    inicio: string,
    cierre: Cierre | null,
  ): Promise<void> {
    const cumplido =
      cierre && cierre.motivo === 'RESUELTO' && cierre.habilS !== null && cierre.metaS !== null
        ? cierre.habilS <= cierre.metaS
        : null;
    await client.$executeRaw`
      INSERT INTO tramos_tecnico_ticket
        (ticket_id, tecnico_id, inicio_at, fin_at, motivo_fin, habil_s, meta_s, cumplido, updated_at)
      VALUES (${ticketId}::uuid, ${tecnicoId}::uuid, ${inicio}::timestamptz,
              ${cierre?.fin ?? null}::timestamptz, ${cierre?.motivo ?? null},
              ${cierre?.habilS ?? null}::integer, ${cierre?.metaS ?? null}::integer,
              ${cumplido}::boolean, now())
    `;
  }

  /** Tramo resuelto en `fin`, con la meta de 4 h; empieza una hora antes. */
  async function resuelto(tecnicoId: string, fin: string, habilS: number, ticketId?: string) {
    const ticket = ticketId ?? (await crearTicket(tecnicoId));
    const inicio = new Date(new Date(fin).getTime() - 3600_000).toISOString();
    await tramo(ticket, tecnicoId, inicio, { fin, motivo: 'RESUELTO', habilS, metaS: META_S });
    return ticket;
  }

  async function limpiarFilas(): Promise<void> {
    await client.$executeRaw`DELETE FROM tramos_tecnico_ticket`;
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
        data: { codigo: 'T-TIEMPO-LECT', nombre: 'Tiempo', modulo: 'TICKETS' },
      })
    ).id;
    estadoId = (
      await client.estado.create({ data: { codigo: 'E-TIEMPO-LECT', nombre: 'Abierto' } })
    ).id;
    prioridadId = (
      await client.prioridad.create({ data: { codigo: 'P-TIEMPO-LECT', nombre: 'Media' } })
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

  describe('dashboard: cumplimiento por técnico', () => {
    it('el período son los días argentinos del ciclo sobre fin_at (corta a las 03:00 UTC)', async () => {
      const octubre = await crearCiclo('2026-10-01', '2026-10-31');
      const septiembre = await crearCiclo('2026-09-01', '2026-09-30');

      // Argentina es UTC-3 fijo: el día argentino 1/10 empieza a las 03:00 UTC.
      await resuelto(ANA, '2026-10-01T03:00:00.000Z', 3600); // 00:00 ART del 1/10: entra
      await resuelto(ANA, '2026-11-01T02:59:59.999Z', 7200); // 23:59 ART del 31/10: entra
      await resuelto(ANA, '2026-11-01T03:00:00.000Z', 600); // 00:00 ART del 1/11: afuera
      await resuelto(ANA, '2026-10-01T02:59:59.999Z', 900); // 23:59 ART del 30/9: afuera

      const enOctubre = await metricas('admin', 'ADMINISTRADOR', octubre);
      expect(enOctubre.cumplimientoTecnico).toEqual([
        {
          usuarioId: ANA,
          nombre: 'Ana',
          apellido: 'Paz',
          total: 2,
          cumplidos: 2,
          porcentaje: 1,
          promedioHabilS: 5400,
        },
      ]);
      const enSeptiembre = await metricas('admin', 'ADMINISTRADOR', septiembre);
      expect(enSeptiembre.cumplimientoTecnico).toEqual([
        expect.objectContaining({ usuarioId: ANA, total: 1, promedioHabilS: 900 }),
      ]);
    });

    it('cuenta solo los tramos resueltos con veredicto, y excluye los de tickets borrados', async () => {
      const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
      // Ana: dos cumplidos y uno no cumplido (5 h contra 4 h).
      await resuelto(ANA, '2026-10-05T15:00:00.000Z', 3600);
      await resuelto(ANA, '2026-10-06T15:00:00.000Z', 7200);
      await resuelto(ANA, '2026-10-07T15:00:00.000Z', 18_000);
      // Beto: un cumplido que cuenta.
      await resuelto(BETO, '2026-10-08T15:00:00.000Z', 1800);
      // Beto, sin veredicto: reasignado, resuelto sin meta, cancelado y uno en curso.
      const conTramosSinVeredicto = await crearTicket(BETO);
      await tramo(conTramosSinVeredicto, BETO, '2026-10-09T12:00:00.000Z', {
        fin: '2026-10-09T13:00:00.000Z',
        motivo: 'REASIGNADO',
        habilS: 3600,
        metaS: META_S,
      });
      await tramo(conTramosSinVeredicto, BETO, '2026-10-09T14:00:00.000Z', {
        fin: '2026-10-09T15:00:00.000Z',
        motivo: 'RESUELTO',
        habilS: 3600,
        metaS: null,
      });
      await tramo(conTramosSinVeredicto, BETO, '2026-10-10T12:00:00.000Z', {
        fin: '2026-10-10T13:00:00.000Z',
        motivo: 'CANCELADO',
        habilS: 3600,
        metaS: META_S,
      });
      await tramo(conTramosSinVeredicto, BETO, '2026-10-11T12:00:00.000Z', null);
      // Beto, en un ticket borrado: un no cumplido que no debe contar.
      const borrado = await resuelto(BETO, '2026-10-12T15:00:00.000Z', 36_000);
      await client.ticket.update({ where: { id: borrado }, data: { deletedAt: new Date() } });

      const result = await metricas('admin', 'ADMINISTRADOR', ciclo);

      expect(result.cumplimientoTecnico).toEqual([
        {
          usuarioId: ANA,
          nombre: 'Ana',
          apellido: 'Paz',
          total: 3,
          cumplidos: 2,
          porcentaje: 2 / 3,
          promedioHabilS: 9600,
        },
        {
          usuarioId: BETO,
          nombre: 'Beto',
          apellido: 'Sosa',
          total: 1,
          cumplidos: 1,
          porcentaje: 1,
          promedioHabilS: 1800,
        },
      ]);
    });

    it('un TECNICO ve solo su fila; los tramos de otro técnico no aparecen', async () => {
      const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
      await resuelto(ANA, '2026-10-05T15:00:00.000Z', 3600);
      await resuelto(ANA, '2026-10-06T15:00:00.000Z', 18_000);
      await resuelto(BETO, '2026-10-07T15:00:00.000Z', 18_000);
      const alcanceDeBeto = alcancePorTipo(BETO, { [tipoId]: ['LECTURA', 'VER_TODOS'] });

      const deBeto = await metricas(BETO, 'TECNICO', ciclo, alcanceDeBeto);

      expect(deBeto.cumplimientoTecnico).toEqual([
        {
          usuarioId: BETO,
          nombre: 'Beto',
          apellido: 'Sosa',
          total: 1,
          cumplidos: 0,
          porcentaje: 0,
          promedioHabilS: 18_000,
        },
      ]);
      // El caso hermano: sin el alcance de TECNICO aparecen los dos.
      const todos = await metricas(BETO, 'COLABORADOR', ciclo, alcanceDeBeto);
      expect(todos.cumplimientoTecnico.map((f) => [f.usuarioId, f.total])).toEqual([
        [ANA, 2],
        [BETO, 1],
      ]);
    });

    it('alcance por tipo: un ticket de un tipo sin LECTURA, o que el actor no ve por fila, no cuenta', async () => {
      const ciclo = await crearCiclo('2026-10-01', '2026-10-31');
      const otroTipo = (
        await client.tipoTicket.create({
          data: {
            codigo: `T-TIEMPO-SINLEC-${randomBytes(3).toString('hex')}`,
            nombre: 'Sin lectura',
            modulo: 'TICKETS',
          },
        })
      ).id;
      try {
        await resuelto(ANA, '2026-10-05T15:00:00.000Z', 3600, await crearTicket(ANA));
        await resuelto(ANA, '2026-10-06T15:00:00.000Z', 3600, await crearTicket(ANA, otroTipo));
        await resuelto(BETO, '2026-10-07T15:00:00.000Z', 3600, await crearTicket(BETO));

        // Ana solo con LECTURA: ve por fila los tickets de los que es responsable, y nada del otro tipo.
        const porFila = await metricas(
          ANA,
          'COLABORADOR',
          ciclo,
          alcancePorTipo(ANA, { [tipoId]: ['LECTURA'] }),
        );
        expect(porFila.cumplimientoTecnico).toEqual([
          expect.objectContaining({ usuarioId: ANA, total: 1 }),
        ]);

        const sinRestriccion = await metricas('admin', 'ADMINISTRADOR', ciclo);
        expect(sinRestriccion.cumplimientoTecnico.map((f) => [f.usuarioId, f.total])).toEqual([
          [ANA, 2],
          [BETO, 1],
        ]);
      } finally {
        await limpiarFilas();
        await client.tipoTicket.delete({ where: { id: otroTipo } });
      }
    });
  });

  describe('detalle: tramos de un ticket', () => {
    async function ticketConDosTramos(): Promise<string> {
      const ticket = await crearTicket(BETO);
      await tramo(ticket, ANA, '2026-10-05T12:00:00.000Z', {
        fin: '2026-10-05T14:00:00.000Z',
        motivo: 'REASIGNADO',
        habilS: 7200,
        metaS: META_S,
      });
      await tramo(ticket, BETO, '2026-10-05T14:00:00.000Z', null);
      return ticket;
    }

    it('quien ve el ticket recibe todos sus tramos en orden, el abierto sin medición', async () => {
      const ticket = await ticketConDosTramos();

      // Beto es el responsable: lo ve por fila, y ve también el tramo anterior de Ana.
      const result = await enTenant(() =>
        listarTramos.execute({
          ticketId: ticket,
          ...alcancePorTipo(BETO, { [tipoId]: ['LECTURA'] }),
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(
        result.getValue().map((t) => ({
          tecnicoId: t.tecnicoId,
          inicioAt: t.inicioAt.toISOString(),
          finAt: t.finAt?.toISOString() ?? null,
          motivoFin: t.motivoFin,
          habilS: t.habilS,
          metaS: t.metaS,
          cumplido: t.cumplido,
        })),
      ).toEqual([
        {
          tecnicoId: ANA,
          inicioAt: '2026-10-05T12:00:00.000Z',
          finAt: '2026-10-05T14:00:00.000Z',
          motivoFin: 'REASIGNADO',
          habilS: 7200,
          metaS: META_S,
          cumplido: null,
        },
        {
          tecnicoId: BETO,
          inicioAt: '2026-10-05T14:00:00.000Z',
          finAt: null,
          motivoFin: null,
          habilS: null,
          metaS: null,
          cumplido: null,
        },
      ]);
    });

    it('quien no ve el ticket recibe TicketNoEncontradoError, aunque el ticket tenga tramos', async () => {
      const ticket = await ticketConDosTramos();

      const result = await enTenant(() =>
        listarTramos.execute({
          ticketId: ticket,
          ...alcancePorTipo(AJENO, { [tipoId]: ['LECTURA'] }),
        }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });

    it('un ticket borrado es TicketNoEncontradoError aun para quien no tiene restricción', async () => {
      const ticket = await ticketConDosTramos();
      await client.ticket.update({ where: { id: ticket }, data: { deletedAt: new Date() } });

      const result = await enTenant(() =>
        listarTramos.execute({ ticketId: ticket, ...alcanceSinRestriccion('admin') }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });
  });
});
