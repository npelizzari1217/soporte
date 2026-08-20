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
 * Ref spec: sdd/premium/spec D1. Ref design: "Archivos afectados" PR-D,
 * matriz de tests. Tarea: D3.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaDashboardRepository } from './prisma-dashboard.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr-d';
const DUMMY_SOLICITANTE_ID = '01900000-0000-7000-8000-000000000201';
const AGENTE_1_ID = '01900000-0000-7000-8000-000000000301';
const AGENTE_2_ID = '01900000-0000-7000-8000-000000000302';

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
  }) {
    return tenantClient.ticket.create({
      data: {
        numero: nextNumero(),
        titulo: 'Ticket dashboard test',
        descripcion: null,
        tipoId: overrides.tipoId ?? tipoId,
        estadoId: estadoNuevoId,
        prioridadId: overrides.prioridadId ?? prioridadAltaId,
        cicloId: overrides.cicloId === undefined ? cicloId : overrides.cicloId,
        solicitanteId: DUMMY_SOLICITANTE_ID,
        asignadoId: overrides.asignadoId ?? null,
        slaVenceAt: overrides.slaVenceAt ?? null,
        vencido: overrides.vencido ?? false,
        fechaCierre: overrides.fechaCierre ?? null,
        createdAt: overrides.createdAt ?? new Date(),
      },
    });
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
    await tenantClient.ticket.deleteMany({ where: { tipoId: { in: [tipoId, tipoOtroId] } } });
    await tenantClient.cicloCliente.deleteMany({ where: { id: { in: [cicloId, cicloOtroId] } } });
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

  describe('cumplimientoSla()', () => {
    it('cuenta cerradosConSla y cerradosATiempo (cerrados_no_vencidos) del scope', async () => {
      const cicloSla = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_SOLICITANTE_ID,
          nombre: `D_TEST_CICLO_SLA_${RUN_PREFIX}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      await withTenant(async () => {
        // cerrado, con SLA, a tiempo (no vencido)
        await crearTicket({
          cicloId: cicloSla.id,
          fechaCierre: new Date(),
          slaVenceAt: new Date('2099-01-01'),
          vencido: false,
        });
        // cerrado, con SLA, vencido
        await crearTicket({
          cicloId: cicloSla.id,
          fechaCierre: new Date(),
          slaVenceAt: new Date('2020-01-01'),
          vencido: true,
        });
        // cerrado, SIN SLA aplicable (no cuenta en el denominador)
        await crearTicket({
          cicloId: cicloSla.id,
          fechaCierre: new Date(),
          slaVenceAt: null,
          vencido: false,
        });
        // abierto (no cuenta, no está cerrado)
        await crearTicket({
          cicloId: cicloSla.id,
          fechaCierre: null,
          slaVenceAt: new Date('2099-01-01'),
          vencido: false,
        });

        const result = await repo.cumplimientoSla({ cicloId: cicloSla.id });
        expect(result.cerradosConSla).toBe(2);
        expect(result.cerradosATiempo).toBe(1);
      });

      await tenantClient.ticket.deleteMany({ where: { cicloId: cicloSla.id } });
      await tenantClient.cicloCliente.delete({ where: { id: cicloSla.id } });
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
