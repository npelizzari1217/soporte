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
 * T7 (WU-5): idem con `RetirarComponente` (DESCARTE de una pieza con unidad).
 * T8 (WU-5): idem con `CrearTicketSoporte`: espera sin advisory de numeración ni lock en `tickets`.
 * T1, T2, T3, T6 (WU-10): la propia baja (`DarDeBajaEquipoUseCase` real, `BajaEquipoFixtures`): ver
 * el segundo `describe`.
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
import { construirEntradaReal } from '../../../insumos/testing/entrada-insumo-real';
import { PrismaTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { Result } from '../../../shared/domain/result';
import { RetirarComponenteUseCase } from './retirar-componente.use-case';
import { CrearTicketSoporteUseCase } from './crear-ticket-soporte.use-case';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { InstalarComponenteDesdeDepositoUseCase } from './instalar-componente-desde-deposito.use-case';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO = '01900000-0000-7000-8000-000000000461';
const ESPERA_MAXIMA_MS = 5_000;
const PASO_MS = 25;

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
       count(*) FILTER (WHERE locktype = 'relation' AND relation = 'componentes_equipo'::regclass)::int AS componentes,
       count(*) FILTER (WHERE locktype = 'relation' AND relation = 'tickets'::regclass)::int AS tickets
     FROM pg_locks WHERE pid = $1`,
    [pid],
  );
  return rows[0] as { insumos: number; advisory: number; componentes: number; tickets: number };
}

/**
 * Un cliente externo toma `consulta` dentro de una transacción y la retiene; se lanza `arrancar()`,
 * se espera (acotado) a que quede bloqueado por el externo, se corre `alEsperar` con el pid de
 * quien espera y recién después se hace COMMIT del externo. Devuelve el resultado ya liberado.
 */
async function conLockExterno<R>(
  pool: Pool,
  consulta: string,
  parametros: unknown[],
  arrancar: () => Promise<R>,
  alEsperar: (sonda: PoolClient, pidServicio: number) => Promise<void>,
): Promise<R> {
  const externo = await pool.connect();
  const sonda = await pool.connect();
  let operacion: Promise<R> | undefined;
  try {
    await externo.query('BEGIN');
    await externo.query(consulta, parametros);
    const { rows } = await externo.query('SELECT pg_backend_pid() AS pid');

    operacion = arrancar();
    const pidServicio = await esperarBloqueadoPor(sonda, rows[0].pid as number);
    await alEsperar(sonda, pidServicio);
  } finally {
    await externo.query('COMMIT').catch(() => undefined);
    externo.release();
    sonda.release();
    // Que la operación termine siempre: si una aserción falló, no debe escribir tras la limpieza.
    await operacion?.catch(() => undefined);
  }
  return operacion as Promise<R>;
}

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

  /**
   * Corre `arrancar()` con el LE del equipo retenido en `FOR NO KEY UPDATE` por un externo,
   * comprueba que espera y que todavía no tiene ningún lock posterior, y devuelve su resultado
   * tras el COMMIT del externo.
   */
  function conLeRetenido<R>(arrancar: () => Promise<R>): Promise<R> {
    return conLockExterno(
      pool,
      'SELECT id FROM equipos_informaticos WHERE id = $1 FOR NO KEY UPDATE',
      [equipoId],
      arrancar,
      async (sonda, pidServicio) => {
        const locks = await locksPosteriores(sonda, pidServicio);
        expect(locks).toEqual({ insumos: 0, advisory: 0, componentes: 0, tickets: 0 });
      },
    );
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
  it('T7: con el LE retenido en FOR NO KEY UPDATE, retirar (DESCARTE de una pieza con unidad) espera sin lock de insumos ni advisory', async () => {
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId: insumoSerieId,
        numeroSerie: 'S7',
        numeroSerieNormalizado: `${PREFIJO}S7`,
        condicion: 'NUEVO',
        estado: 'INSTALADA',
        equipoId,
      },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: { equipoId, insumoId: insumoSerieId, unidadId: unidad.id },
    });
    const useCase = new RetirarComponenteUseCase(
      txRunner,
      equipoRepo,
      componenteRepo,
      construirEntradaReal({ tenantContext, txRunner, insumoRepo, movimientoRepo, familiaRepo }),
      construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo }),
    );

    const result = await conLeRetenido(() =>
      conTenant(() =>
        useCase.execute({
          equipoId,
          componenteId: componente.id,
          destino: 'DESCARTE',
          motivo: 'testigo T7',
          usuarioId: USUARIO,
        }),
      ),
    );

    expect(result.isOk()).toBe(true);
    const c = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(c.deletedAt).not.toBeNull();
    const u = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidad.id } });
    expect(u.estado).toBe('DESCARTADA');
  }, 30_000);

  it('T8: con el LE retenido en FOR NO KEY UPDATE, crear un ticket de soporte espera sin advisory de numeracion ni lock en tickets', async () => {
    // Solo el numerador y el repo de tickets son reales: el advisory de numeración
    // (`pg_advisory_xact_lock` en `findLastSecuencia`) es lo que el testigo vigila. El resto de las
    // dependencias son fakes tipados: el use case recién las toca después de tomar el LE.
    const tipoId = '01900000-0000-7000-8000-000000000571';
    const ticketsGuardados: string[] = [];
    const useCase = new CrearTicketSoporteUseCase(
      {
        save: async (t) => {
          ticketsGuardados.push(t.numero);
        },
      },
      { save: async () => {} },
      { save: async () => {} },
      { findIdByCodigo: async () => '01900000-0000-7000-8000-000000000572' },
      {
        findByCodigo: async () =>
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'EQUIPOS', activo: true },
            tipoId,
          ),
      },
      { findIdByCodigo: async () => '01900000-0000-7000-8000-000000000573' },
      { existeEnTenant: async () => true },
      new NumeradorTicket(new PrismaTicketRepository(tenantContext)),
      {
        resolver: async () =>
          Result.ok(
            CicloClienteEntity.create(
              {
                cicloVigenteId: 'ciclo-vigente-1',
                nombre: 'Ciclo testigos',
                fechaInicio: new Date('2026-01-01'),
                fechaFin: new Date('2026-12-31'),
                activo: true,
              },
              '01900000-0000-7000-8000-000000000574',
            ),
          ),
      },
      equipoRepo,
      { publish: () => {} },
      txRunner,
    );

    const result = await conLeRetenido(() =>
      conTenant(() =>
        useCase.execute({
          titulo: 'Testigo T8',
          prioridadId: '01900000-0000-7000-8000-000000000575',
          equipoId,
          solicitanteId: USUARIO,
          clienteId: 'test-cliente-lkw',
          autorId: USUARIO,
          anio: 2026,
        }),
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(ticketsGuardados).toEqual(['SOP-2026-00001']);
  }, 30_000);
});

describe('Baja de equipo — testigos de la propia baja (ADR-2: T1, T2, T3, T6)', () => {
  let fx: BajaEquipoFixtures;

  beforeAll(async () => {
    fx = await BajaEquipoFixtures.crear();
  }, 30_000);

  afterAll(async () => {
    await fx.cerrar();
  }, 30_000);

  beforeEach(() => fx.limpiar());

  afterEach(async () => {
    expect(await fx.exigirInvarianteSerie()).toEqual([]);
  });

  /** Equipo con una pieza `NINGUNO` y una unidad "S1" `INSTALADA`: toca LE, L1, L2, L3 y L4. */
  async function equipoConPiezas(nombre: string) {
    const equipo = await fx.crearEquipo(nombre);
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    const { unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');
    return { equipoId: equipo.id, unidadId };
  }

  const bajaDe = (equipoId: string) => () =>
    fx.conTenant(() =>
      fx.useCase.execute({
        equipoId,
        destino: 'STOCK_USADO',
        categoria: 'VEJEZ',
        usuarioId: fx.usuarioId,
      }),
    );

  /** Modos de lock de relación que el backend `pid` tiene sobre `relacion`. */
  async function modos(sonda: PoolClient, pid: number, relacion: string): Promise<string[]> {
    const { rows } = await sonda.query(
      `SELECT mode FROM pg_locks
       WHERE pid = $1 AND locktype = 'relation' AND relation = $2::regclass`,
      [pid, relacion],
    );
    return rows.map((r: { mode: string }) => r.mode).sort();
  }

  async function advisories(sonda: PoolClient, pid: number) {
    const { rows } = await sonda.query(
      `SELECT count(*) FILTER (WHERE granted)::int AS tomados,
              count(*) FILTER (WHERE NOT granted)::int AS esperando
       FROM pg_locks WHERE pid = $1 AND locktype = 'advisory'`,
      [pid],
    );
    return rows[0] as { tomados: number; esperando: number };
  }

  const advisoryDelInsumo = (insumoId: string) =>
    ['SELECT pg_advisory_xact_lock(hashtext($1))', [`insumo-stock:${insumoId}`]] as const;

  it('T1: con el LE retenido en FOR SHARE (alta en vuelo), la baja espera sin lock de insumos ni advisory', async () => {
    const { equipoId } = await equipoConPiezas('T1');

    const result = await conLockExterno(
      fx.pool,
      'SELECT id FROM equipos_informaticos WHERE id = $1 FOR SHARE',
      [equipoId],
      bajaDe(equipoId),
      async (sonda, pidServicio) => {
        expect(await locksPosteriores(sonda, pidServicio)).toEqual({
          insumos: 0,
          advisory: 0,
          componentes: 0,
          tickets: 0,
        });
      },
    );

    expect(result.isOk()).toBe(true);
  }, 30_000);

  it('T2: con el advisory del insumo retenido, la baja ya tiene LE y L1, y todavía no escribió ni bloqueó filas de piezas', async () => {
    const { equipoId } = await equipoConPiezas('T2');
    const [consulta, parametros] = advisoryDelInsumo(fx.serieId);

    const result = await conLockExterno(
      fx.pool,
      consulta,
      [...parametros],
      bajaDe(equipoId),
      async (sonda, pidServicio) => {
        expect(await advisories(sonda, pidServicio)).toEqual({ tomados: 0, esperando: 1 });
        expect(await modos(sonda, pidServicio, 'equipos_informaticos')).toContain('RowShareLock');
        expect(await modos(sonda, pidServicio, 'insumos')).toContain('RowShareLock');
        for (const tabla of ['componentes_equipo', 'movimientos_insumo', 'unidades_insumo']) {
          expect(await modos(sonda, pidServicio, tabla)).not.toContain('RowExclusiveLock');
        }
        // Ninguna fila de componente está bloqueada: un FOR UPDATE NOWAIT externo tiene éxito.
        await sonda.query('BEGIN');
        try {
          await sonda.query("SET LOCAL lock_timeout = '1s'");
          const { rowCount } = await sonda.query(
            'SELECT id FROM componentes_equipo WHERE equipo_id = $1 AND deleted_at IS NULL FOR UPDATE NOWAIT',
            [equipoId],
          );
          expect(rowCount).toBe(2);
        } finally {
          await sonda.query('ROLLBACK');
        }
      },
    );

    expect(result.isOk()).toBe(true);
  }, 30_000);

  it('T3: con la unidad retenida en FOR NO KEY UPDATE, la baja ya tiene el advisory de sus insumos y ninguna ENTRADA NINGUNO escrita', async () => {
    const { equipoId, unidadId } = await equipoConPiezas('T3');

    const result = await conLockExterno(
      fx.pool,
      'SELECT id FROM unidades_insumo WHERE id = $1 FOR NO KEY UPDATE',
      [unidadId],
      bajaDe(equipoId),
      async (sonda, pidServicio) => {
        expect(await advisories(sonda, pidServicio)).toEqual({ tomados: 1, esperando: 0 });
        expect(await modos(sonda, pidServicio, 'insumos')).toContain('RowShareLock');
        for (const tabla of ['movimientos_insumo', 'componentes_equipo']) {
          expect(await modos(sonda, pidServicio, tabla)).not.toContain('RowExclusiveLock');
        }
      },
    );

    expect(result.isOk()).toBe(true);
  }, 30_000);

  it('T6: con la baja retenida en L2 y el LE tomado, un INSERT en movimientos_insumo con equipo_id no se bloquea (FOR NO KEY UPDATE, no FOR UPDATE)', async () => {
    const { equipoId } = await equipoConPiezas('T6');
    const [consulta, parametros] = advisoryDelInsumo(fx.serieId);

    const result = await conLockExterno(
      fx.pool,
      consulta,
      [...parametros],
      bajaDe(equipoId),
      async (sonda, pidServicio) => {
        // La baja ya tiene el LE: el INSERT de abajo es la prueba de qué modo tomó.
        expect(await modos(sonda, pidServicio, 'equipos_informaticos')).toContain('RowShareLock');
        const insertor = await fx.pool.connect();
        try {
          await insertor.query('BEGIN');
          await insertor.query("SET LOCAL lock_timeout = '500ms'");
          // La FK `equipo_id` toma FOR KEY SHARE sobre la fila del equipo: no choca con
          // FOR NO KEY UPDATE, sí con FOR UPDATE (55P03 por lock_timeout).
          await expect(
            insertor.query(
              `INSERT INTO movimientos_insumo (insumo_id, tipo, condicion, cantidad, usuario_id, equipo_id)
               VALUES ($1, 'ENTRADA', 'USADO', 1, $2, $3)`,
              [fx.ningunoId, fx.usuarioId, equipoId],
            ),
          ).resolves.toBeDefined();
        } finally {
          await insertor.query('ROLLBACK').catch(() => undefined);
          insertor.release();
        }
      },
    );

    expect(result.isOk()).toBe(true);
  }, 30_000);
});
