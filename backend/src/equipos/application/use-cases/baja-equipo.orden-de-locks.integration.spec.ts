/**
 * [INTEGRATION] Testigos del ORDEN DE LOCKS de la baja de equipo completo (baja-equipo-completo,
 * ADR-2). Un solo archivo para todos los testigos; WU-4 agrega T4, WU-5 y WU-10 lo amplían.
 *
 * Patrón determinista (sin carreras de dos clientes): un cliente externo retiene un lock y la
 * operación bajo prueba queda esperándolo (`pg_blocking_pids`, espera acotada). Mientras espera
 * se sondea `pg_locks` del backend bloqueado: si la operación hubiera tomado un lock posterior
 * antes del LE del equipo, ya lo tendría. Nunca se mira `transactionid`: un `FOR SHARE` ya le
 * asigna un xid a la transacción.
 *
 * T4 (WU-4): el externo retiene LE `FOR NO KEY UPDATE`; `InstalarComponenteDesdeDeposito` (con
 * unidad) y `ReactivarComponente` esperan sin `RowShareLock` en `insumos` (L1) ni advisory (L2).
 */
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaEquipoInformaticoRepository } from '../../infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from '../../infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import { PrismaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaFamiliaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { RegistrarSalidaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-salida-insumo.use-case';
import { construirOperacionesReal } from '../../../insumos/testing/operaciones-unidad-real';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { InstalarComponenteDesdeDepositoUseCase } from './instalar-componente-desde-deposito.use-case';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO = '01900000-0000-7000-8000-000000000461';
const ESPERA_MAXIMA_MS = 5_000;
const PASO_MS = 25;

describe('Baja de equipo — orden de locks, testigos (ADR-2)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let insumoRepo: PrismaInsumoRepository;
  let familiaRepo: PrismaFamiliaInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;
  let txRunner: PrismaTenantTransactionRunner;

  const PREFIJO = `LKW_${randomBytes(2).toString('hex')}_`;
  let insumoSerieId: string;
  let equipoId: string;

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-lkw' },
      fn,
    );
  }

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 8,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    familiaRepo = new PrismaFamiliaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia testigos baja', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera testigos baja', entera: true },
    });
    insumoSerieId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}S`,
          nombre: 'Repuesto SERIE testigos baja',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'SERIE',
        },
      })
    ).id;
    equipoId = (
      await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}Equipo` } })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await limpiarPiezas();
    await tenantClient.equipoInformatico.deleteMany({ where: { id: equipoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  afterEach(limpiarPiezas);

  /** Borra componentes, eventos, movimientos y unidades del insumo, en el orden de las FK. */
  async function limpiarPiezas(): Promise<void> {
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId } });
    await tenantClient.eventoUnidadInsumo.deleteMany({
      where: { unidad: { insumoId: insumoSerieId } },
    });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId: insumoSerieId } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId: insumoSerieId } });
  }

  async function esperarBloqueadoPor(sonda: PoolClient, pidBloqueante: number): Promise<number> {
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    while (Date.now() < limite) {
      const { rows } = await sonda.query(
        'SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))',
        [pidBloqueante],
      );
      if (rows.length > 0) return rows[0].pid as number;
      await new Promise((resolve) => setTimeout(resolve, PASO_MS));
    }
    throw new Error(
      `Nadie quedo bloqueado por el backend ${pidBloqueante} en ${ESPERA_MAXIMA_MS} ms.`,
    );
  }

  /** Cantidad de locks de cada familia posterior al LE que el backend `pid` ya tiene tomados. */
  async function locksPosteriores(sonda: PoolClient, pid: number) {
    const { rows } = await sonda.query(
      `SELECT
         count(*) FILTER (WHERE locktype = 'relation' AND relation = 'insumos'::regclass)::int AS insumos,
         count(*) FILTER (WHERE locktype = 'advisory')::int AS advisory,
         count(*) FILTER (WHERE locktype = 'relation' AND relation = 'componentes_equipo'::regclass)::int AS componentes
       FROM pg_locks WHERE pid = $1`,
      [pid],
    );
    return rows[0] as { insumos: number; advisory: number; componentes: number };
  }

  /**
   * Corre `arrancar()` con el LE del equipo retenido en `FOR NO KEY UPDATE` por un externo,
   * comprueba que espera y que todavía no tiene ningún lock posterior, y devuelve su resultado
   * tras el COMMIT del externo.
   */
  async function conLeRetenido<R>(arrancar: () => Promise<R>): Promise<R> {
    const externo = await pool.connect();
    const sonda = await pool.connect();
    let operacion: Promise<R> | undefined;
    try {
      await externo.query('BEGIN');
      await externo.query('SELECT id FROM equipos_informaticos WHERE id = $1 FOR NO KEY UPDATE', [
        equipoId,
      ]);
      const { rows } = await externo.query('SELECT pg_backend_pid() AS pid');

      operacion = arrancar();
      const pidServicio = await esperarBloqueadoPor(sonda, rows[0].pid as number);

      const locks = await locksPosteriores(sonda, pidServicio);
      expect(locks).toEqual({ insumos: 0, advisory: 0, componentes: 0 });
    } finally {
      await externo.query('COMMIT').catch(() => undefined);
      externo.release();
      sonda.release();
    }
    return operacion as Promise<R>;
  }

  it('T4: con el LE retenido en FOR NO KEY UPDATE, instalar una unidad espera sin lock de insumos ni advisory', async () => {
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId: insumoSerieId,
        numeroSerie: 'S1',
        numeroSerieNormalizado: `${PREFIJO}S1`,
        condicion: 'NUEVO',
        estado: 'EN_DEPOSITO',
      },
    });
    const operaciones = construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo });
    const useCase = new InstalarComponenteDesdeDepositoUseCase(
      txRunner,
      new AgregarComponenteUseCase(equipoRepo, componenteRepo, insumoRepo, familiaRepo),
      new RegistrarSalidaInsumoUseCase(
        insumoRepo,
        movimientoRepo,
        txRunner,
        familiaRepo,
        operaciones,
      ),
      operaciones,
      componenteRepo,
    );

    const result = await conLeRetenido(() =>
      conTenant(() =>
        useCase.execute({
          equipoId,
          insumoId: insumoSerieId,
          usuarioId: USUARIO,
          unidadId: unidad.id,
        }),
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(await tenantClient.componenteEquipo.count({ where: { unidadId: unidad.id } })).toBe(1);
  }, 30_000);

  it('T4: con el LE retenido en FOR NO KEY UPDATE, reactivar un componente con unidad espera sin lock de insumos ni advisory', async () => {
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId: insumoSerieId,
        numeroSerie: 'S2',
        numeroSerieNormalizado: `${PREFIJO}S2`,
        condicion: 'NUEVO',
        estado: 'DESCARTADA',
      },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: {
        equipoId,
        insumoId: insumoSerieId,
        unidadId: unidad.id,
        deletedAt: new Date(),
        bajaDestino: 'DESCARTE',
        bajaMotivo: 'descarte previo',
        bajaUsuarioId: USUARIO,
      },
    });
    await tenantClient.eventoUnidadInsumo.create({
      data: {
        unidadId: unidad.id,
        tipo: 'DESCARTE',
        equipoId,
        componenteId: componente.id,
        usuarioId: USUARIO,
      },
    });
    const useCase = new ReactivarComponenteUseCase(
      txRunner,
      equipoRepo,
      componenteRepo,
      construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo }),
    );

    const result = await conLeRetenido(() =>
      conTenant(() =>
        useCase.execute({ equipoId, componenteId: componente.id, usuarioId: USUARIO }),
      ),
    );

    expect(result.isOk()).toBe(true);
    const c = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(c.deletedAt).toBeNull();
  }, 30_000);
});
