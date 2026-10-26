/**
 * D3 [INTEGRATION] — RED→GREEN: `PrismaDashboardRepository` contra Postgres
 * REAL (`soporte_tenant_test`). Cada agregación (D1): abiertos/cerrados,
 * tiempo promedio de resolución en horas, carga por agente, cumplimiento
 * SLA (insumos crudos), distribución por tipo/prioridad — filtrado por
 * `cicloId` y `asignadoId` (D2).
 *
 * Fixtures propios prefijados `D_TEST_*` (mismo patrón que T5/K5/SB3): la
 * DB de test NO corre `TenantSeederAdapter` automáticamente. Cleanup en
 * `afterAll` acotado por los ids de fixture de ESTA suite.
 *
 * sdd/sla-primera-respuesta-y-pausa WU-8: cumplimiento de resolución por tiempo activo, % y tiempo
 * medio de primera respuesta, exclusión de preventivos y abiertos en espera
 * (`dashboard-metricas-sla` R1, R2, R4, R5). Cada test usa su propio ciclo (`cicloNuevo`), así que los
 * conteos no se contaminan entre sí ni con el resto de la base compartida.
 *
 * odd/promedios-dashboard-habiles T5: los dos tiempos medios promedian con `AVG` los segundos hábiles
 * guardados por ticket (`resolucion_habil_s`, `primera_respuesta_habil_s`), no las fechas.
 *
 * Ref spec: sdd/premium/spec D1. Ref design: "Archivos afectados" PR-D,
 * matriz de tests. Tarea: D3.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TIPO_CODIGO_PREVENTIVO } from '../../../../tickets/domain/tipos-ticket.constants';
import { PrismaDashboardRepository } from './prisma-dashboard.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr-d';
const DUMMY_SOLICITANTE_ID = '01900000-0000-7000-8000-000000000201';
const AGENTE_1_ID = '01900000-0000-7000-8000-000000000301';
const AGENTE_2_ID = '01900000-0000-7000-8000-000000000302';

const H = 3_600_000;
/** Segundos por hora, para los valores de las columnas `*_habil_s`. */
const HS = 3600;

describe('PrismaDashboardRepository — Integration (PR-D)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaDashboardRepository;

  let tipoId: string;
  let tipoOtroId: string;
  let estadoNuevoId: string;
  let prioridadAltaId: string;
  let prioridadBajaId: string;
  let cicloId: string;
  let cicloOtroId: string;
  let tipoPreventivoId: string;
  let tipoPreventivoCreado = false;
  let estadoEsperaId: string;
  let estadoCanceladoId: string;
  const ciclosWu8: string[] = [];

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `D${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  async function crearTicket(overrides: {
    tipoId?: string;
    prioridadId?: string;
    cicloId?: string | null;
    asignadoId?: string | null;
    createdAt?: Date;
    fechaCierre?: Date | null;
    slaVenceAt?: Date | null;
    vencido?: boolean;
    estadoId?: string;
    slaAcumuladoS?: number | null;
    slaCumplido?: boolean | null;
    primeraRespuestaAt?: Date | null;
    primeraRespuestaVenceAt?: Date | null;
    resolucionHabilS?: number | null;
    primeraRespuestaHabilS?: number | null;
  }) {
    return tenantClient.ticket.create({
      data: {
        numero: nextNumero(),
        titulo: 'Ticket dashboard test',
        descripcion: null,
        tipoId: overrides.tipoId ?? tipoId,
        estadoId: overrides.estadoId ?? estadoNuevoId,
        prioridadId: overrides.prioridadId ?? prioridadAltaId,
        cicloId: overrides.cicloId === undefined ? cicloId : overrides.cicloId,
        solicitanteId: DUMMY_SOLICITANTE_ID,
        asignadoId: overrides.asignadoId ?? null,
        slaVenceAt: overrides.slaVenceAt ?? null,
        vencido: overrides.vencido ?? false,
        fechaCierre: overrides.fechaCierre ?? null,
        createdAt: overrides.createdAt ?? new Date(),
        ...(overrides.slaAcumuladoS !== undefined && { slaAcumuladoS: overrides.slaAcumuladoS }),
        ...(overrides.slaCumplido !== undefined && { slaCumplido: overrides.slaCumplido }),
        ...(overrides.primeraRespuestaAt !== undefined && {
          primeraRespuestaAt: overrides.primeraRespuestaAt,
        }),
        ...(overrides.primeraRespuestaVenceAt !== undefined && {
          primeraRespuestaVenceAt: overrides.primeraRespuestaVenceAt,
        }),
        resolucionHabilS: overrides.resolucionHabilS ?? null,
        primeraRespuestaHabilS: overrides.primeraRespuestaHabilS ?? null,
      },
    });
  }

  async function cicloNuevo(): Promise<string> {
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_SOLICITANTE_ID,
        nombre: `D_TEST_CICLO_WU8_${RUN_PREFIX}_${ciclosWu8.length}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
      },
    });
    ciclosWu8.push(ciclo.id);
    return ciclo.id;
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    repo = new PrismaDashboardRepository(tenantContext);

    const tipo = await tenantClient.tipoTicket.create({
      data: {
        codigo: `D_TEST_TIPO_${RUN_PREFIX}`,
        nombre: 'Tipo Dashboard Test',
        activo: true,
        modulo: 'SOPORTE',
      },
    });
    tipoId = tipo.id;
    const tipoOtro = await tenantClient.tipoTicket.create({
      data: {
        codigo: `D_TEST_TIPO2_${RUN_PREFIX}`,
        nombre: 'Tipo Dashboard Test 2',
        activo: true,
        modulo: 'SOPORTE',
      },
    });
    tipoOtroId = tipoOtro.id;

    // El tipo PREVENTIVO tiene código fijo: se reutiliza el de la base compartida si existe y solo
    // se borra el que creó este spec.
    const preventivoExistente = await tenantClient.tipoTicket.findUnique({
      where: { codigo: TIPO_CODIGO_PREVENTIVO },
    });
    if (preventivoExistente) {
      tipoPreventivoId = preventivoExistente.id;
    } else {
      tipoPreventivoId = (
        await tenantClient.tipoTicket.create({
          data: {
            codigo: TIPO_CODIGO_PREVENTIVO,
            nombre: 'Preventivo Dashboard Test',
            activo: true,
            modulo: 'SOPORTE',
          },
        })
      ).id;
      tipoPreventivoCreado = true;
    }
    estadoEsperaId = (
      await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'ESPERANDO_CLIENTE' } })
    ).id;
    // El código importa (la regla mira 'CANCELADO'), así que se usa el real; upsert porque la base
    // de test compartida puede o no tenerlo ya.
    estadoCanceladoId = (
      await tenantClient.estado.upsert({
        where: { codigo: 'CANCELADO' },
        update: {},
        create: { codigo: 'CANCELADO', nombre: 'Cancelado', orden: 7, activo: true },
      })
    ).id;

    const estadoNuevo = await tenantClient.estado.create({
      data: { codigo: `D_TEST_NUEVO_${RUN_PREFIX}`, nombre: 'Nuevo', orden: 1, activo: true },
    });
    estadoNuevoId = estadoNuevo.id;

    const prioridadAlta = await tenantClient.prioridad.create({
      data: { codigo: `D_TEST_ALTA_${RUN_PREFIX}`, nombre: 'Alta', orden: 30, activo: true },
    });
    prioridadAltaId = prioridadAlta.id;
    const prioridadBaja = await tenantClient.prioridad.create({
      data: { codigo: `D_TEST_BAJA_${RUN_PREFIX}`, nombre: 'Baja', orden: 10, activo: true },
    });
    prioridadBajaId = prioridadBaja.id;

    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_SOLICITANTE_ID,
        nombre: `D_TEST_CICLO_${RUN_PREFIX}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });
    cicloId = ciclo.id;
    const cicloOtro = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_SOLICITANTE_ID,
        nombre: `D_TEST_CICLO_OTRO_${RUN_PREFIX}`,
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2025-12-31'),
        activo: false,
      },
    });
    cicloOtroId = cicloOtro.id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.ticket.deleteMany({
      where: { OR: [{ tipoId: { in: [tipoId, tipoOtroId] } }, { cicloId: { in: ciclosWu8 } }] },
    });
    if (tipoPreventivoCreado) {
      await tenantClient.tipoTicket.deleteMany({ where: { id: tipoPreventivoId } });
    }
    await tenantClient.cicloCliente.deleteMany({
      where: { id: { in: [cicloId, cicloOtroId, ...ciclosWu8] } },
    });
    await tenantClient.prioridad.deleteMany({
      where: { id: { in: [prioridadAltaId, prioridadBajaId] } },
    });
    await tenantClient.estado.delete({ where: { id: estadoNuevoId } });
    await tenantClient.tipoTicket.deleteMany({ where: { id: { in: [tipoId, tipoOtroId] } } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('conteoPorEstadoAgrupado()', () => {
    it('cuenta abiertos (fechaCierre null) vs cerrados (fechaCierre no null) del ciclo', async () => {
      await withTenant(async () => {
        await crearTicket({ fechaCierre: null });
        await crearTicket({ fechaCierre: null });
        await crearTicket({ fechaCierre: new Date() });

        const result = await repo.conteoPorEstadoAgrupado({ cicloId });
        expect(result.abiertos).toBeGreaterThanOrEqual(2);
        expect(result.cerrados).toBeGreaterThanOrEqual(1);
      });
    });

    it('filtra por cicloId — no mezcla tickets de otro ciclo', async () => {
      await withTenant(async () => {
        await crearTicket({ cicloId: cicloOtroId, fechaCierre: null });

        const result = await repo.conteoPorEstadoAgrupado({ cicloId: cicloOtroId });
        expect(result.abiertos).toBe(1);
        expect(result.cerrados).toBe(0);
      });
    });
  });

  describe('tiempoPromedioResolucionHoras() — AVG de resolucion_habil_s', () => {
    it('promedia el tiempo hábil guardado, no fechaCierre - createdAt, y deja afuera las filas sin dato', async () => {
      const ciclo = await cicloNuevo();
      const createdAt = new Date('2026-01-01T08:00:00Z');
      await withTenant(async () => {
        // 24 h y 48 h de pared, pero 6 h y 9 h hábiles sin pausas: cuenta lo guardado.
        await crearTicket({
          cicloId: ciclo,
          createdAt,
          fechaCierre: new Date('2026-01-02T08:00:00Z'),
          resolucionHabilS: 6 * HS,
        });
        await crearTicket({
          cicloId: ciclo,
          createdAt,
          fechaCierre: new Date('2026-01-03T08:00:00Z'),
          resolucionHabilS: 9 * HS,
        });
        // Cerrado sin el dato (reabierto o previo sin backfill): no entra, aunque tenga fechaCierre.
        await crearTicket({
          cicloId: ciclo,
          createdAt,
          fechaCierre: new Date('2026-01-10T08:00:00Z'),
          resolucionHabilS: null,
        });

        expect(await repo.tiempoPromedioResolucionHoras({ cicloId: ciclo })).toBe(7.5);
      });
    });

    it('respeta el filtro por responsable y por ciclo', async () => {
      const ciclo = await cicloNuevo();
      const otroCiclo = await cicloNuevo();
      await withTenant(async () => {
        await crearTicket({ cicloId: ciclo, asignadoId: AGENTE_1_ID, resolucionHabilS: 2 * HS });
        await crearTicket({ cicloId: ciclo, asignadoId: AGENTE_2_ID, resolucionHabilS: 10 * HS });
        await crearTicket({
          cicloId: otroCiclo,
          asignadoId: AGENTE_1_ID,
          resolucionHabilS: 30 * HS,
        });

        expect(await repo.tiempoPromedioResolucionHoras({ cicloId: ciclo })).toBe(6);
        expect(
          await repo.tiempoPromedioResolucionHoras({ cicloId: ciclo, asignadoId: AGENTE_1_ID }),
        ).toBe(2);
      });
    });

    it('null cuando no hay ningún ticket con el dato en el scope', async () => {
      const ciclo = await cicloNuevo();
      await withTenant(async () => {
        await crearTicket({ cicloId: ciclo, fechaCierre: new Date(), resolucionHabilS: null });

        expect(await repo.tiempoPromedioResolucionHoras({ cicloId: ciclo })).toBeNull();
      });
    });
  });

  describe('cargaPorAgente()', () => {
    it('agrupa tickets ABIERTOS por asignadoId, excluye sin asignar', async () => {
      const cicloCarga = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_SOLICITANTE_ID,
          nombre: `D_TEST_CICLO_CARGA_${RUN_PREFIX}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      await withTenant(async () => {
        await crearTicket({ cicloId: cicloCarga.id, asignadoId: AGENTE_1_ID, fechaCierre: null });
        await crearTicket({ cicloId: cicloCarga.id, asignadoId: AGENTE_1_ID, fechaCierre: null });
        await crearTicket({
          cicloId: cicloCarga.id,
          asignadoId: AGENTE_1_ID,
          fechaCierre: new Date(),
        }); // cerrado, no cuenta
        await crearTicket({ cicloId: cicloCarga.id, asignadoId: AGENTE_2_ID, fechaCierre: null });
        await crearTicket({ cicloId: cicloCarga.id, asignadoId: null, fechaCierre: null }); // sin asignar

        const result = await repo.cargaPorAgente({ cicloId: cicloCarga.id });
        const agente1 = result.find((r) => r.asignadoId === AGENTE_1_ID);
        const agente2 = result.find((r) => r.asignadoId === AGENTE_2_ID);
        expect(agente1?.abiertos).toBe(2);
        expect(agente2?.abiertos).toBe(1);
        expect(result.every((r) => r.asignadoId !== null)).toBe(true);
      });

      await tenantClient.ticket.deleteMany({ where: { cicloId: cicloCarga.id } });
      await tenantClient.cicloCliente.delete({ where: { id: cicloCarga.id } });
    });

    it('con asignadoId fijo (scope TECNICO) retorna a lo sumo una fila — la propia', async () => {
      await withTenant(async () => {
        await crearTicket({ asignadoId: AGENTE_1_ID, fechaCierre: null });

        const result = await repo.cargaPorAgente({ cicloId, asignadoId: AGENTE_1_ID });
        expect(result.length).toBeLessThanOrEqual(1);
        expect(result.every((r) => r.asignadoId === AGENTE_1_ID)).toBe(true);
      });
    });
  });

  describe('cumplimientoSla() — por tiempo activo (dashboard-metricas-sla R1)', () => {
    it('cuenta el cumplimiento fijado en cada resolución y, en los previos, fechaCierre <= slaVenceAt', async () => {
      const ciclo = await cicloNuevo();
      const creado = new Date('2026-08-03T12:00:00Z');
      await withTenant(async () => {
        // Incorporado resuelto tarde (9 h activas sobre 8 h), sin marca del barrido: no cumplido.
        await crearTicket({
          cicloId: ciclo,
          fechaCierre: new Date(creado.getTime() + 9 * H),
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: 9 * 3600,
          slaCumplido: false,
          vencido: false,
        });
        // Incorporado: 5 h activas y 7 días de espera, resuelto bastante después del vencimiento
        // original y hasta con la marca del barrido: cumplido (no se lee `vencido`).
        await crearTicket({
          cicloId: ciclo,
          fechaCierre: new Date(creado.getTime() + 7 * 24 * H),
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: 5 * 3600,
          slaCumplido: true,
          vencido: true,
        });
        // Previo (nunca incorporado) cerrado tarde y sin marca de vencido: no cumplido.
        await crearTicket({
          cicloId: ciclo,
          fechaCierre: new Date(creado.getTime() + 10 * H),
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: null,
          vencido: false,
        });
        // Previo cerrado a tiempo: cumplido.
        await crearTicket({
          cicloId: ciclo,
          fechaCierre: new Date(creado.getTime() + 6 * H),
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: null,
          vencido: true,
        });
        // Reabierto: fechaCierre y cumplido nulos mientras su reloj corre; no está resuelto.
        await crearTicket({
          cicloId: ciclo,
          fechaCierre: null,
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: 3 * 3600,
          slaCumplido: null,
        });
        // Resuelto con el pliegue pendiente (cumplido todavía nulo): afuera hasta el barrido.
        await crearTicket({
          cicloId: ciclo,
          fechaCierre: new Date(creado.getTime() + 2 * H),
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: 2 * 3600,
          slaCumplido: null,
        });
        // Resuelto sin meta: afuera.
        await crearTicket({
          cicloId: ciclo,
          fechaCierre: new Date(creado.getTime() + 2 * H),
          slaVenceAt: null,
          slaAcumuladoS: null,
        });

        expect(await repo.cumplimientoSla({ cicloId: ciclo })).toEqual({
          cerradosConSla: 4,
          cerradosATiempo: 2,
        });
      });
    });

    it('sin datos devuelve ceros (el use case lo traduce a porcentaje nulo)', async () => {
      const ciclo = await cicloNuevo();
      await withTenant(async () => {
        expect(await repo.cumplimientoSla({ cicloId: ciclo })).toEqual({
          cerradosConSla: 0,
          cerradosATiempo: 0,
        });
      });
    });
  });

  describe('primera respuesta (dashboard-metricas-sla R2)', () => {
    const creado = new Date('2026-08-03T12:00:00Z'); // lunes 09:00 en Argentina
    const venceAt = new Date(creado.getTime() + 2 * H);

    it('cuatro tickets con meta (dos a tiempo, uno tarde, uno sin respuesta y vencido) dan 2 de 4', async () => {
      const ciclo = await cicloNuevo();
      await withTenant(async () => {
        const conMeta = (primeraRespuestaAt: Date | null, vence = venceAt) =>
          crearTicket({
            cicloId: ciclo,
            createdAt: creado,
            primeraRespuestaVenceAt: vence,
            primeraRespuestaAt,
          });
        await conMeta(new Date(creado.getTime() + 1 * H));
        await conMeta(venceAt); // en el vencimiento exacto: a tiempo
        await conMeta(new Date(creado.getTime() + 3 * H));
        await conMeta(null); // sin respuesta y ya vencido
        // Sin respuesta y todavía en plazo: no entra al universo.
        await conMeta(null, new Date(Date.now() + 24 * H));
        // Rellenado sin meta: no entra al porcentaje.
        await crearTicket({
          cicloId: ciclo,
          createdAt: creado,
          primeraRespuestaAt: new Date(creado.getTime() + 1 * H),
        });

        expect(await repo.cumplimientoPrimeraRespuesta({ cicloId: ciclo })).toEqual({
          conMeta: 4,
          aTiempo: 2,
        });
      });
    });

    it('el tiempo medio es el AVG de primera_respuesta_habil_s, con meta o sin ella', async () => {
      const ciclo = await cicloNuevo();
      await withTenant(async () => {
        const viernes17 = new Date('2026-08-07T20:00:00Z');
        // Con meta: 2 h hábiles guardadas (viernes 17:00 → lunes 10:00, 65 h de pared).
        await crearTicket({
          cicloId: ciclo,
          createdAt: viernes17,
          primeraRespuestaVenceAt: new Date('2026-08-10T14:00:00Z'),
          primeraRespuestaAt: new Date('2026-08-10T13:00:00Z'),
          primeraRespuestaHabilS: 2 * HS,
        });
        // Sin meta (rellenado): 0,5 h hábiles guardadas.
        await crearTicket({
          cicloId: ciclo,
          createdAt: viernes17,
          primeraRespuestaAt: new Date('2026-08-07T20:30:00Z'),
          primeraRespuestaHabilS: 0.5 * HS,
        });
        // Con respuesta pero sin el dato (previo sin backfill): no entra.
        await crearTicket({
          cicloId: ciclo,
          createdAt: viernes17,
          primeraRespuestaAt: new Date('2026-08-20T20:30:00Z'),
        });
        // Sin respuesta: no entra.
        await crearTicket({ cicloId: ciclo, createdAt: viernes17 });

        expect(await repo.tiempoPromedioPrimeraRespuestaHoras({ cicloId: ciclo })).toBe(1.25);
      });
    });

    it('sin datos el tiempo medio es null', async () => {
      const ciclo = await cicloNuevo();
      await withTenant(async () => {
        expect(await repo.tiempoPromedioPrimeraRespuestaHoras({ cicloId: ciclo })).toBeNull();
        expect(await repo.cumplimientoPrimeraRespuesta({ cicloId: ciclo })).toEqual({
          conMeta: 0,
          aTiempo: 0,
        });
      });
    });
  });

  describe('preventivos excluidos (dashboard-metricas-sla R4)', () => {
    it('un preventivo resuelto con respuesta de un técnico no altera ninguna de las cuatro métricas', async () => {
      const ciclo = await cicloNuevo();
      const creado = new Date('2026-08-03T12:00:00Z');
      await withTenant(async () => {
        await crearTicket({
          cicloId: ciclo,
          createdAt: creado,
          fechaCierre: new Date(creado.getTime() + 6 * H),
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: 6 * 3600,
          slaCumplido: true,
          primeraRespuestaVenceAt: new Date(creado.getTime() + 2 * H),
          primeraRespuestaAt: new Date(creado.getTime() + 1 * H),
          resolucionHabilS: 6 * HS,
          primeraRespuestaHabilS: 1 * HS,
        });
        const medir = async () => ({
          resolucion: await repo.cumplimientoSla({ cicloId: ciclo }),
          primera: await repo.cumplimientoPrimeraRespuesta({ cicloId: ciclo }),
          tiempo: await repo.tiempoPromedioPrimeraRespuestaHoras({ cicloId: ciclo }),
          tiempoResolucion: await repo.tiempoPromedioResolucionHoras({ cicloId: ciclo }),
        });
        const antes = await medir();
        expect(antes.resolucion).toEqual({ cerradosConSla: 1, cerradosATiempo: 1 });
        expect(antes.tiempoResolucion).toBe(6);
        expect(antes.tiempo).toBe(1);

        // Un preventivo que incumple todo: tarde, con meta y con comentario público de un técnico.
        await crearTicket({
          cicloId: ciclo,
          tipoId: tipoPreventivoId,
          createdAt: creado,
          fechaCierre: new Date(creado.getTime() + 20 * H),
          slaVenceAt: new Date(creado.getTime() + 8 * H),
          slaAcumuladoS: 20 * 3600,
          slaCumplido: false,
          primeraRespuestaVenceAt: new Date(creado.getTime() + 2 * H),
          primeraRespuestaAt: new Date(creado.getTime() + 10 * H),
          resolucionHabilS: 20 * HS,
          primeraRespuestaHabilS: 10 * HS,
        });

        expect(await medir()).toEqual(antes);
      });
    });
  });

  describe('tickets cancelados (odd/tasks/defectos-ayuda.md, S4)', () => {
    it('un CANCELADO no cuenta en abiertos ni en la carga del técnico; un abierto sí', async () => {
      const ciclo = await cicloNuevo();
      await withTenant(async () => {
        // Un cancelado nunca recibe fecha de cierre: era lo que lo hacía pasar por abierto.
        await crearTicket({
          cicloId: ciclo,
          estadoId: estadoCanceladoId,
          asignadoId: AGENTE_1_ID,
          fechaCierre: null,
        });
        await crearTicket({ cicloId: ciclo, asignadoId: AGENTE_1_ID, fechaCierre: null });

        expect(await repo.conteoPorEstadoAgrupado({ cicloId: ciclo })).toEqual({
          abiertos: 1,
          cerrados: 0,
        });
        expect(await repo.cargaPorAgente({ cicloId: ciclo })).toEqual([
          { asignadoId: AGENTE_1_ID, abiertos: 1 },
        ]);
      });
    });
  });

  describe('tickets en espera (dashboard-metricas-sla R5)', () => {
    it('un ticket asignado en ESPERANDO_CLIENTE cuenta en abiertos y en la carga, y no en el cumplimiento de resolución', async () => {
      const ciclo = await cicloNuevo();
      await withTenant(async () => {
        await crearTicket({
          cicloId: ciclo,
          estadoId: estadoEsperaId,
          asignadoId: AGENTE_1_ID,
          fechaCierre: null,
          slaVenceAt: new Date('2099-01-01'),
          slaAcumuladoS: 3600,
        });

        expect(await repo.conteoPorEstadoAgrupado({ cicloId: ciclo })).toEqual({
          abiertos: 1,
          cerrados: 0,
        });
        expect(await repo.cargaPorAgente({ cicloId: ciclo })).toEqual([
          { asignadoId: AGENTE_1_ID, abiertos: 1 },
        ]);
        expect(await repo.cumplimientoSla({ cicloId: ciclo })).toEqual({
          cerradosConSla: 0,
          cerradosATiempo: 0,
        });
      });
    });
  });

  describe('distribucionPorTipo() / distribucionPorPrioridad()', () => {
    it('distribuye por tipo y por prioridad — cualquier estado, dentro del ciclo', async () => {
      const cicloDist = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_SOLICITANTE_ID,
          nombre: `D_TEST_CICLO_DIST_${RUN_PREFIX}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      await withTenant(async () => {
        await crearTicket({ cicloId: cicloDist.id, tipoId, prioridadId: prioridadAltaId });
        await crearTicket({ cicloId: cicloDist.id, tipoId, prioridadId: prioridadAltaId });
        await crearTicket({
          cicloId: cicloDist.id,
          tipoId: tipoOtroId,
          prioridadId: prioridadBajaId,
        });

        const porTipo = await repo.distribucionPorTipo({ cicloId: cicloDist.id });
        const porPrioridad = await repo.distribucionPorPrioridad({ cicloId: cicloDist.id });

        expect(porTipo.find((t) => t.tipoId === tipoId)?.total).toBe(2);
        expect(porTipo.find((t) => t.tipoId === tipoOtroId)?.total).toBe(1);
        expect(porPrioridad.find((p) => p.prioridadId === prioridadAltaId)?.total).toBe(2);
        expect(porPrioridad.find((p) => p.prioridadId === prioridadBajaId)?.total).toBe(1);
      });

      await tenantClient.ticket.deleteMany({ where: { cicloId: cicloDist.id } });
      await tenantClient.cicloCliente.delete({ where: { id: cicloDist.id } });
    });
  });
});
