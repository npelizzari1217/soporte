/**
 * [INTEGRATION] Orden global de locks (ADR-12, invariante L) de
 * sdd/repuestos-numero-de-serie, casos 1 a 5: el cambio de seguimiento contra
 * `EditarInsumo`, contra otro cambio de seguimiento y contra la entrada (en los
 * dos ordenes), con los repositorios Prisma reales sobre `soporte_tenant_test`.
 *
 * Dos tipos de prueba, a proposito:
 *
 * - Los casos 1 y 2 usan dos transacciones reales que se esperan entre si, con
 *   una compuerta que retiene a la primera con sus locks tomados. Prueban el
 *   resultado (sin `40P01`, serializacion, `UnidadMedidaCambiadaError`).
 * - Los TESTIGOS prueban el ORDEN. Un cliente externo tiene un lock bajo, el
 *   servicio queda esperando y, con `pg_blocking_pids` (espera acotada), otro
 *   cliente comprueba que lock tiene YA el servicio. Se necesitan porque un
 *   spec de dos clientes en orden opuesto puede no detectar una inversion si
 *   el orden de los pedidos elimina el ciclo (aprendido en WU-5).
 *
 * Fixtures con prefijo por corrida. No toca `soporte_master_test`, asi que no
 * necesita `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import { PrismaFamiliaInsumoRepository } from './prisma-familia-insumo.repository';
import { PrismaModeloEquipoRepository } from './prisma-modelo-equipo.repository';
import { PrismaMovimientoInsumoRepository } from './prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from './prisma-unidad-insumo.repository';
import { PrismaUnidadMedidaRepository } from './prisma-unidad-medida.repository';
import { CambiarSeguimientoInsumoUseCase } from '../../../application/use-cases/cambiar-seguimiento-insumo.use-case';
import { EditarInsumoUseCase } from '../../../application/use-cases/editar-insumo.use-case';
import { RegistrarEntradaInsumoUseCase } from '../../../application/use-cases/registrar-entrada-insumo.use-case';
import { UnidadMedidaCambiadaError } from '../../../domain/errors/unidades-medida.errors';
import {
  SeguimientoNoModificableError,
  SerialesNoCoincidenError,
  UnidadNoAdmitidaError,
} from '../../../domain/errors/unidades-insumo.errors';
import { construirEntradaReal } from '../../../testing/entrada-insumo-real';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const PREFIJO_LOCK_STOCK = 'insumo-stock:';
const ESPERA_MAXIMA_MS = 5_000;

describe('Orden de locks (ADR-12), casos 1 a 5 — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let cambiar: CambiarSeguimientoInsumoUseCase;
  let editar: EditarInsumoUseCase;
  let entrada: RegistrarEntradaInsumoUseCase;

  const PREFIJO = `ODL_${randomBytes(2).toString('hex')}_`;
  let insumoId: string;
  let unidadEntera: string;
  let unidadNoEntera: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl, max: 10 });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });

    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    const insumoRepo = new PrismaInsumoRepository(tenantContext);
    const unidadMedidaRepo = new PrismaUnidadMedidaRepository(tenantContext);
    cambiar = new CambiarSeguimientoInsumoUseCase(
      insumoRepo,
      unidadMedidaRepo,
      new PrismaMovimientoInsumoRepository(tenantContext),
      new PrismaUnidadInsumoRepository(tenantContext),
      txRunner,
    );
    editar = new EditarInsumoUseCase(
      insumoRepo,
      new PrismaFamiliaInsumoRepository(tenantContext),
      unidadMedidaRepo,
      new PrismaModeloEquipoRepository(tenantContext),
      txRunner,
    );

    entrada = construirEntradaReal({
      tenantContext,
      txRunner,
      insumoRepo,
      movimientoRepo: new PrismaMovimientoInsumoRepository(tenantContext),
      familiaRepo: new PrismaFamiliaInsumoRepository(tenantContext),
    });

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    unidadEntera = (
      await tenantClient.unidadMedida.create({
        data: { codigo: `${PREFIJO}E`, nombre: 'Entera', entera: true },
      })
    ).id;
    unidadNoEntera = (
      await tenantClient.unidadMedida.create({
        data: { codigo: `${PREFIJO}N`, nombre: 'No entera', entera: false },
      })
    ).id;
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}A`,
          nombre: 'Insumo de prueba',
          familiaId: familia.id,
          unidadMedidaId: unidadEntera,
        },
      })
    ).id;
  }, 30_000);

  /** Borra lo que dejaron las entradas, en el orden de las FK (todas `Restrict`). */
  async function limpiarMovimientosYUnidades(): Promise<void> {
    await tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidad: { insumoId } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId } });
  }

  afterAll(async () => {
    await limpiarMovimientosYUnidades();
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await limpiarMovimientosYUnidades();
    await tenantClient.insumo.update({
      where: { id: insumoId },
      data: { seguimiento: 'NINGUNO', unidadMedidaId: unidadEntera },
    });
  });

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-odl' },
      fn,
    );
  }

  /** Una compuerta que retiene una transaccion con sus locks hasta que se abre. */
  function compuerta(): { esperar: Promise<void>; abrir: () => void } {
    let abrir!: () => void;
    const esperar = new Promise<void>((resolve) => {
      abrir = resolve;
    });
    return { esperar, abrir };
  }

  /**
   * Espera, acotada, a que alguna transaccion este bloqueada por `pidBloqueante`.
   * Devuelve el pid del bloqueado. NO deja ningun bucle corriendo: termina al
   * encontrarlo o al vencer `ESPERA_MAXIMA_MS`.
   */
  async function esperarBloqueadoPor(testigo: PoolClient, pidBloqueante: number): Promise<number> {
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    while (Date.now() < limite) {
      const { rows } = await testigo.query(
        'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
        [pidBloqueante],
      );
      if (rows.length > 0) return rows[0].pid as number;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `Nadie quedo bloqueado por el backend ${pidBloqueante} en ${ESPERA_MAXIMA_MS} ms.`,
    );
  }

  async function pidDeLaTransaccionActual(): Promise<number> {
    const cliente = tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
    const filas = await cliente.$queryRaw<
      Array<{ pid: number }>
    >`SELECT pg_backend_pid()::int AS pid`;
    return filas[0].pid;
  }

  async function seguimientoActual(): Promise<string> {
    return (await tenantClient.insumo.findUniqueOrThrow({ where: { id: insumoId } })).seguimiento;
  }

  it('caso 1: activacion contra EditarInsumo que cambia la unidad en vuelo: sin 40P01, la activacion aborta con UnidadMedidaCambiadaError', async () => {
    const testigo = await pool.connect();
    const retenida = compuerta();
    const editorListo = compuerta();
    let pidEditor = 0;
    let activacion: Promise<unknown> | undefined;
    let edicion: Promise<unknown> | undefined;
    try {
      // La edicion toma L0 (unidad destino) y L1 (fila del insumo) y queda retenida sin comitear.
      edicion = conTenant(() =>
        txRunner.run(async () => {
          const r = await editar.execute({ id: insumoId, unidadMedidaId: unidadNoEntera });
          pidEditor = await pidDeLaTransaccionActual();
          editorListo.abrir();
          await retenida.esperar;
          return r;
        }),
      );
      await Promise.race([editorListo.esperar, edicion]);

      // La activacion lee la unidad vieja (la edicion no comiteo), toma L0 sobre ella y espera L1.
      activacion = conTenant(() => cambiar.execute({ insumoId, seguimiento: 'SERIE' }));
      await esperarBloqueadoPor(testigo, pidEditor);
    } finally {
      retenida.abrir();
      testigo.release();
    }

    const rEdicion = (await edicion) as { isOk(): boolean };
    const rActivacion = (await activacion) as { isFail(): boolean; getError(): unknown };
    expect(rEdicion.isOk()).toBe(true);
    expect(rActivacion.isFail()).toBe(true);
    expect(rActivacion.getError()).toBeInstanceOf(UnidadMedidaCambiadaError);
    const insumo = await tenantClient.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(insumo.seguimiento).toBe('NINGUNO');
    expect(insumo.unidadMedidaId).toBe(unidadNoEntera);
  }, 30_000);

  it('caso 2: dos cambios de seguimiento concurrentes se serializan en L1, sin 40P01', async () => {
    const testigo = await pool.connect();
    const retenida = compuerta();
    const primeroListo = compuerta();
    let pidPrimero = 0;
    let segundo: Promise<unknown> | undefined;
    let primero: Promise<unknown> | undefined;
    try {
      // El primero activa y queda retenido con L1 y L2 tomados, sin comitear.
      primero = conTenant(() =>
        txRunner.run(async () => {
          const r = await cambiar.execute({ insumoId, seguimiento: 'SERIE' });
          pidPrimero = await pidDeLaTransaccionActual();
          primeroListo.abrir();
          await retenida.esperar;
          return r;
        }),
      );
      await Promise.race([primeroListo.esperar, primero]);

      // El segundo pide volver a NINGUNO: espera en L1 y recien despues decide.
      segundo = conTenant(() => cambiar.execute({ insumoId, seguimiento: 'NINGUNO' }));
      await esperarBloqueadoPor(testigo, pidPrimero);
    } finally {
      retenida.abrir();
      testigo.release();
    }

    const r1 = (await primero) as { isOk(): boolean };
    const r2 = (await segundo) as { isOk(): boolean };
    expect(r1.isOk()).toBe(true);
    expect(r2.isOk()).toBe(true);
    // Serializados: el segundo corrio DESPUES del primero (si no, quedaria SERIE).
    expect(await seguimientoActual()).toBe('NINGUNO');
  }, 30_000);

  describe('testigos del orden L0 -> L1 -> L2 en el cambio de seguimiento', () => {
    it('mientras espera L1 (la fila del insumo) todavia NO tiene L2 (el advisory del insumo)', async () => {
      const bloqueador = await pool.connect();
      const testigo = await pool.connect();
      let operacion: Promise<unknown> | undefined;
      try {
        // Un cliente externo tiene L1 (como una entrada en vuelo con la fila FOR SHARE o un editor).
        await bloqueador.query('BEGIN');
        await bloqueador.query('SELECT id FROM insumos WHERE id = $1 FOR NO KEY UPDATE', [
          insumoId,
        ]);
        const { rows: pidRows } = await bloqueador.query('SELECT pg_backend_pid() AS pid');

        operacion = conTenant(() => cambiar.execute({ insumoId, seguimiento: 'SERIE' }));
        await esperarBloqueadoPor(testigo, pidRows[0].pid);

        // Sin L2 en manos del servicio, el testigo lo obtiene. Con L1 y L2 invertidos, el servicio
        // ya tendria L2 y esto devolveria `false`: el spec se pone rojo.
        await testigo.query('BEGIN');
        const { rows } = await testigo.query(
          'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS obtenido',
          [PREFIJO_LOCK_STOCK + insumoId],
        );
        await testigo.query('ROLLBACK');
        expect(rows[0].obtenido).toBe(true);
      } finally {
        await bloqueador.query('COMMIT').catch(() => undefined);
        bloqueador.release();
        testigo.release();
      }
      const r = (await operacion) as { isOk(): boolean };
      expect(r.isOk()).toBe(true);
      expect(await seguimientoActual()).toBe('SERIE');
    }, 30_000);

    it('mientras espera L0 (la fila de la unidad de medida) todavia NO tiene L1', async () => {
      const bloqueador = await pool.connect();
      const testigo = await pool.connect();
      let operacion: Promise<unknown> | undefined;
      try {
        // Un cliente externo edita la unidad: L0 exclusivo.
        await bloqueador.query('BEGIN');
        await bloqueador.query('SELECT id FROM unidades_medida WHERE id = $1 FOR UPDATE', [
          unidadEntera,
        ]);
        const { rows: pidRows } = await bloqueador.query('SELECT pg_backend_pid() AS pid');

        operacion = conTenant(() => cambiar.execute({ insumoId, seguimiento: 'SERIE' }));
        await esperarBloqueadoPor(testigo, pidRows[0].pid);

        // L1 libre: el testigo la toma sin esperar (NOWAIT falla con 55P03 si el servicio la tuviera).
        await testigo.query('BEGIN');
        const resultado = await testigo
          .query('SELECT id FROM insumos WHERE id = $1 FOR NO KEY UPDATE NOWAIT', [insumoId])
          .then(() => 'libre')
          .catch((e: { code?: string }) => e.code ?? 'error');
        await testigo.query('ROLLBACK');
        expect(resultado).toBe('libre');
      } finally {
        await bloqueador.query('COMMIT').catch(() => undefined);
        bloqueador.release();
        testigo.release();
      }
      const r = (await operacion) as { isOk(): boolean };
      expect(r.isOk()).toBe(true);
    }, 30_000);
  });

  const USUARIO_ID = '00000000-0000-4000-8000-0000000000a1';

  async function fijarSeguimiento(seguimiento: 'NINGUNO' | 'SERIE'): Promise<void> {
    await tenantClient.insumo.update({ where: { id: insumoId }, data: { seguimiento } });
  }

  type Resultado = { isOk(): boolean; isFail(): boolean; getError(): unknown };

  /**
   * Retiene una operacion con sus locks tomados (transaccion externa + compuerta) y
   * lanza la otra, que debe quedar esperando a la primera. Devuelve los dos resultados
   * cuando la primera comitea. `retenida` se abre SIEMPRE, aunque algo falle antes.
   */
  async function retenerYEsperar(
    primera: () => Promise<unknown>,
    segunda: () => Promise<unknown>,
  ): Promise<{ primera: Resultado; segunda: Resultado }> {
    const testigo = await pool.connect();
    const retenida = compuerta();
    const primeraLista = compuerta();
    let pidPrimera = 0;
    let rPrimera: Promise<unknown> | undefined;
    let rSegunda: Promise<unknown> | undefined;
    try {
      rPrimera = conTenant(() =>
        txRunner.run(async () => {
          const r = await primera();
          pidPrimera = await pidDeLaTransaccionActual();
          primeraLista.abrir();
          await retenida.esperar;
          return r;
        }),
      );
      await Promise.race([primeraLista.esperar, rPrimera]);
      rSegunda = conTenant(segunda);
      await esperarBloqueadoPor(testigo, pidPrimera);
    } finally {
      retenida.abrir();
      testigo.release();
    }
    return {
      primera: (await rPrimera) as Resultado,
      segunda: (await rSegunda) as Resultado,
    };
  }

  async function unidadesDelInsumo(): Promise<number> {
    return tenantClient.unidadInsumo.count({ where: { insumoId } });
  }

  it('caso 3: SERIE -> NINGUNO contra una entrada SERIE en vuelo: sin 40P01, la entrada comitea y el cambio se rechaza porque ve las unidades nuevas', async () => {
    await fijarSeguimiento('SERIE');
    const { primera, segunda } = await retenerYEsperar(
      // La entrada toma L1 (FOR SHARE), L2 y L3, y queda retenida sin comitear.
      () =>
        entrada.execute({
          insumoId,
          cantidad: 1,
          usuarioId: USUARIO_ID,
          seriales: [`${PREFIJO}S3`],
        }),
      // El cambio pide L1 (FOR NO KEY UPDATE) y espera a la entrada.
      () => cambiar.execute({ insumoId, seguimiento: 'NINGUNO' }),
    );
    expect(primera.isOk()).toBe(true);
    expect(segunda.isFail()).toBe(true);
    expect(segunda.getError()).toBeInstanceOf(SeguimientoNoModificableError);
    expect(await seguimientoActual()).toBe('SERIE');
    expect(await unidadesDelInsumo()).toBe(1);
  }, 30_000);

  it('caso 4: NINGUNO -> SERIE contra una entrada NINGUNO en vuelo: sin 40P01, el cambio ve saldo distinto de cero y se rechaza', async () => {
    const { primera, segunda } = await retenerYEsperar(
      () => entrada.execute({ insumoId, cantidad: 2, usuarioId: USUARIO_ID }),
      () => cambiar.execute({ insumoId, seguimiento: 'SERIE' }),
    );
    expect(primera.isOk()).toBe(true);
    expect(segunda.isFail()).toBe(true);
    expect(segunda.getError()).toBeInstanceOf(SeguimientoNoModificableError);
    expect(await seguimientoActual()).toBe('NINGUNO');
  }, 30_000);

  it('caso 5a: orden inverso de 4 (el cambio comitea primero): la entrada, al obtener L1, sigue la rama SERIE y da SerialesNoCoincidenError', async () => {
    const { primera, segunda } = await retenerYEsperar(
      // Saldo cero: el cambio NINGUNO -> SERIE es valido y queda retenido con L1 y L2.
      () => cambiar.execute({ insumoId, seguimiento: 'SERIE' }),
      // La entrada se escribio para NINGUNO (sin seriales): al obtener L1 ya es SERIE.
      () => entrada.execute({ insumoId, cantidad: 1, usuarioId: USUARIO_ID }),
    );
    expect(primera.isOk()).toBe(true);
    expect(segunda.isFail()).toBe(true);
    expect(segunda.getError()).toBeInstanceOf(SerialesNoCoincidenError);
    expect(await seguimientoActual()).toBe('SERIE');
    expect(await unidadesDelInsumo()).toBe(0);
  }, 30_000);

  it('caso 5b: orden inverso de 3 (el cambio comitea primero): la entrada con seriales, al obtener L1, sigue la rama NINGUNO y da UnidadNoAdmitidaError', async () => {
    await fijarSeguimiento('SERIE');
    const { primera, segunda } = await retenerYEsperar(
      // Sin unidades ni saldo: el cambio SERIE -> NINGUNO es valido y queda retenido.
      () => cambiar.execute({ insumoId, seguimiento: 'NINGUNO' }),
      () =>
        entrada.execute({
          insumoId,
          cantidad: 1,
          usuarioId: USUARIO_ID,
          seriales: [`${PREFIJO}S5`],
        }),
    );
    expect(primera.isOk()).toBe(true);
    expect(segunda.isFail()).toBe(true);
    expect(segunda.getError()).toBeInstanceOf(UnidadNoAdmitidaError);
    expect(await seguimientoActual()).toBe('NINGUNO');
    expect(await unidadesDelInsumo()).toBe(0);
  }, 30_000);

  describe('testigo del orden en la entrada: L1 primero, L2 despues', () => {
    async function verificarSinL2MientrasEsperaL1(
      lanzar: () => Promise<unknown>,
    ): Promise<Resultado> {
      const bloqueador = await pool.connect();
      const testigo = await pool.connect();
      let operacion: Promise<unknown> | undefined;
      try {
        // Un cliente externo tiene L1 exclusivo (como un cambio de seguimiento en vuelo).
        await bloqueador.query('BEGIN');
        await bloqueador.query('SELECT id FROM insumos WHERE id = $1 FOR NO KEY UPDATE', [
          insumoId,
        ]);
        const { rows: pidRows } = await bloqueador.query('SELECT pg_backend_pid() AS pid');

        operacion = conTenant(lanzar);
        await esperarBloqueadoPor(testigo, pidRows[0].pid);

        // La entrada espera L1: si ya tuviera L2 (orden invertido) el try-lock daria `false`.
        await testigo.query('BEGIN');
        const { rows } = await testigo.query(
          'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS obtenido',
          [PREFIJO_LOCK_STOCK + insumoId],
        );
        await testigo.query('ROLLBACK');
        expect(rows[0].obtenido).toBe(true);
      } finally {
        await bloqueador.query('COMMIT').catch(() => undefined);
        bloqueador.release();
        testigo.release();
      }
      return (await operacion) as Resultado;
    }

    it('entrada SERIE: mientras espera L1 todavia NO tiene L2', async () => {
      await fijarSeguimiento('SERIE');
      const r = await verificarSinL2MientrasEsperaL1(() =>
        entrada.execute({
          insumoId,
          cantidad: 1,
          usuarioId: USUARIO_ID,
          seriales: [`${PREFIJO}W1`],
        }),
      );
      expect(r.isOk()).toBe(true);
      expect(await unidadesDelInsumo()).toBe(1);
    }, 30_000);

    it('entrada NINGUNO: mientras espera L1 no tiene L2', async () => {
      const r = await verificarSinL2MientrasEsperaL1(() =>
        entrada.execute({ insumoId, cantidad: 1, usuarioId: USUARIO_ID }),
      );
      expect(r.isOk()).toBe(true);
    }, 30_000);
  });
});
