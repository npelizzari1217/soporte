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
 * Ref spec: sdd/premium/spec D1. Ref design: "Archivos afectados" PR-D,
 * matriz de tests. Tarea: D3.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { CalendarioLaboralSemanal } from '../../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
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
const CALENDARIO_L_A_V_9_A_18: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: null, cierreMinuto: null },
];

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
  const ciclosWu8: string[] = [];
  const obtenerCalendario = vi.fn(async () => CALENDARIO_L_A_V_9_A_18);

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
    repo = new PrismaDashboardRepository(
      tenantContext,
      { obtener: obtenerCalendario },
      {
        obtener: async () => new Set<string>(),
      },
    );

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

  describe('tiempoPromedioResolucionHoras()', () => {
    it('cierre el mismo día da una duración positiva correcta (09:39 → 16:07 ≈ 6.5h)', async () => {
      // Reproduce el caso real que exponía el bug: `fechaCierre` ahora es
      // `@db.Timestamptz` (WU1) y guarda el instante real de cierre, no un
      // día truncado a medianoche UTC — la resta contra `createdAt` es una
      // duración instante-a-instante genuina, nunca negativa.
      const cicloMismoDia = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_SOLICITANTE_ID,
          nombre: `D_TEST_CICLO_MISMO_DIA_${RUN_PREFIX}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      await withTenant(async () => {
        await crearTicket({
          cicloId: cicloMismoDia.id,
          createdAt: new Date('2026-08-07T09:39:55Z'),
          fechaCierre: new Date('2026-08-07T16:07:00Z'),
        });

        const promedio = await repo.tiempoPromedioResolucionHoras({ cicloId: cicloMismoDia.id });
        expect(promedio).toBeCloseTo(6.45, 1);
        expect(promedio).toBeGreaterThanOrEqual(0);
      });

      await tenantClient.ticket.deleteMany({ where: { cicloId: cicloMismoDia.id } });
      await tenantClient.cicloCliente.delete({ where: { id: cicloMismoDia.id } });
    });

    it('promedia fechaCierre - createdAt (horas) sobre los cerrados del scope, nunca negativo', async () => {
      const cicloAvg = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_SOLICITANTE_ID,
          nombre: `D_TEST_CICLO_AVG_${RUN_PREFIX}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      // Instantes con hora real (no medianoche) — `fechaCierre` ya no trunca
      // el time-of-day, así que el promedio en horas es exacto, no solo
      // aproximado por redondeo de día.
      await withTenant(async () => {
        const createdAt = new Date('2026-01-01T08:00:00Z');
        await crearTicket({
          cicloId: cicloAvg.id,
          createdAt,
          fechaCierre: new Date('2026-01-02T08:00:00Z'), // 24h
        });
        await crearTicket({
          cicloId: cicloAvg.id,
          createdAt,
          fechaCierre: new Date('2026-01-03T08:00:00Z'), // 48h
        });

        const promedio = await repo.tiempoPromedioResolucionHoras({ cicloId: cicloAvg.id });
        expect(promedio).toBeCloseTo(36, 0);
        expect(promedio).toBeGreaterThanOrEqual(0);
      });

      await tenantClient.ticket.deleteMany({ where: { cicloId: cicloAvg.id } });
      await tenantClient.cicloCliente.delete({ where: { id: cicloAvg.id } });
    });

    it('null cuando no hay ningún cerrado en el scope', async () => {
      await withTenant(async () => {
        const promedio = await repo.tiempoPromedioResolucionHoras({ cicloId: cicloOtroId });
        expect(promedio).toBeNull();
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

    it('el rellenado sin meta entra al tiempo medio, medido en horas hábiles con el calendario cargado una vez', async () => {
      const ciclo = await cicloNuevo();
      obtenerCalendario.mockClear();
      await withTenant(async () => {
        // Viernes 17:00 local (20:00Z) respondido el lunes 10:00 (2 h hábiles).
        const viernes17 = new Date('2026-08-07T20:00:00Z');
        await crearTicket({
          cicloId: ciclo,
          createdAt: viernes17,
          primeraRespuestaVenceAt: new Date('2026-08-10T14:00:00Z'),
          primeraRespuestaAt: new Date('2026-08-10T13:00:00Z'),
        });
        // Sin meta (rellenado): viernes 17:00 respondido 17:30 (0,5 h hábiles).
        await crearTicket({
          cicloId: ciclo,
          createdAt: viernes17,
          primeraRespuestaAt: new Date('2026-08-07T20:30:00Z'),
        });
        // Sin respuesta: no entra al tiempo medio.
        await crearTicket({ cicloId: ciclo, createdAt: viernes17 });

        const horas = await repo.tiempoPromedioPrimeraRespuestaHoras({ cicloId: ciclo });
        expect(horas).toBeCloseTo(1.25, 10);
        expect(obtenerCalendario).toHaveBeenCalledTimes(1);
      });
    });

    it('sin datos el tiempo medio es null y no consulta el calendario', async () => {
      const ciclo = await cicloNuevo();
      obtenerCalendario.mockClear();
      await withTenant(async () => {
        expect(await repo.tiempoPromedioPrimeraRespuestaHoras({ cicloId: ciclo })).toBeNull();
        expect(await repo.cumplimientoPrimeraRespuesta({ cicloId: ciclo })).toEqual({
          conMeta: 0,
          aTiempo: 0,
        });
        expect(obtenerCalendario).not.toHaveBeenCalled();
      });
    });
  });

  describe('preventivos excluidos (dashboard-metricas-sla R4)', () => {
    it('un preventivo resuelto con respuesta de un técnico no altera ninguna de las tres métricas', async () => {
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
        });
        const medir = async () => ({
          resolucion: await repo.cumplimientoSla({ cicloId: ciclo }),
          primera: await repo.cumplimientoPrimeraRespuesta({ cicloId: ciclo }),
          tiempo: await repo.tiempoPromedioPrimeraRespuestaHoras({ cicloId: ciclo }),
        });
        const antes = await medir();
        expect(antes.resolucion).toEqual({ cerradosConSla: 1, cerradosATiempo: 1 });

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
        });

        expect(await medir()).toEqual(antes);
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
