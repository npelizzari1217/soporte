/**
 * [INTEGRATION] Retiro y reactivar de un componente CON UNIDAD bajo el orden de locks
 * global (WU-11, sdd/repuestos-numero-de-serie, ADR-12, invariante L).
 *
 * Dos tipos de prueba, con garantías distintas:
 *
 * - TESTIGOS DETERMINISTAS del orden. Un cliente externo retiene un lock bajo (L1, L2 o
 *   L3) y el caso de uso queda esperándolo; con `pg_blocking_pids` (espera acotada) se
 *   comprueba, sobre el backend bloqueado, que TODAVÍA no tomó ningún lock de relación
 *   sobre `componentes_equipo` (el componente es L4: un UPDATE toma `RowExclusiveLock`
 *   ahí). Si alguien marca el componente antes de los locks de insumos, el lock ya
 *   estaría tomado y el test falla. No se mira `transactionid`: los locks de fila de L1
 *   ya le asignan un xid al servicio. No es una carrera de dos clientes (que puede no
 *   detectar una inversión): es una sonda sobre qué tiene el servicio mientras espera.
 * - CARRERAS que afirman RESULTADOS (uno gana, el resto es rechazado, ningún `40P01`),
 *   nunca el orden de los locks.
 *
 * Wiring manual con repositorios reales y un pool propio (mismo patrón que
 * `instalar-componente-desde-deposito.concurrencia.integration.spec.ts`).
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
import { construirEntradaReal } from '../../../insumos/testing/entrada-insumo-real';
import { construirOperacionesReal } from '../../../insumos/testing/operaciones-unidad-real';
import { RetirarComponenteUseCase } from './retirar-componente.use-case';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';
import {
  ComponenteDadoDeBajaError,
  ComponenteYaActivoError,
  UnidadDelComponenteNoDisponibleError,
} from '../../domain/errors/equipos.errors';
import { SeguimientoNoModificableError } from '../../../insumos/domain/errors/unidades-insumo.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

const CONCURRENCIA = 8;
const POOL_MAX = CONCURRENCIA + 6;
const ESPERA_MAXIMA_MS = 5_000;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000311';

describe('Retiro y reactivar con unidad — orden de locks y carreras (WU-11, ADR-12)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let insumoRepo: PrismaInsumoRepository;
  let familiaInsumoRepo: PrismaFamiliaInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;

  const PREFIJO = `RRU_${randomBytes(2).toString('hex')}_`;

  let insumoId: string;
  let equipoId: string;
  /** Datos del componente sembrado en cada test. */
  let unidadId: string;
  let componenteId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: POOL_MAX,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });

    tenantContext = new TenantContext();
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    familiaInsumoRepo = new PrismaFamiliaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: {
        codigo: `${PREFIJO}F`,
        nombre: 'Familia repuesto retiro/reactivar',
        esRepuesto: true,
      },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera retiro/reactivar', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}I`,
          nombre: 'Repuesto SERIE retiro/reactivar',
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
    // Orden por FK (todas Restrict): filas hijas -> unidades -> equipo -> catalogo.
    await limpiar();
    await tenantClient.equipoInformatico.deleteMany({ where: { id: equipoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  async function limpiar(): Promise<void> {
    await tenantClient.componenteEquipo.deleteMany({ where: { insumoId } });
    await tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidad: { insumoId } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId } });
  }

  beforeEach(async () => {
    await limpiar();
    unidadId = (
      await tenantClient.unidadInsumo.create({
        data: {
          insumoId,
          numeroSerie: 'SN-RRU',
          numeroSerieNormalizado: `${PREFIJO}SN-RRU`,
          condicion: 'NUEVO',
          estado: 'INSTALADA',
          equipoId,
        },
      })
    ).id;
    componenteId = (
      await tenantClient.componenteEquipo.create({ data: { equipoId, insumoId, unidadId } })
    ).id;
  });

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-rru' },
      fn,
    );
  }

  function makeTxRunner() {
    return new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
  }

  function makeRetirar(): RetirarComponenteUseCase {
    return new RetirarComponenteUseCase(
      makeTxRunner(),
      equipoRepo,
      componenteRepo,
      construirEntradaReal({
        tenantContext,
        txRunner: makeTxRunner(),
        insumoRepo,
        movimientoRepo,
        familiaRepo: familiaInsumoRepo,
      }),
      construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo }),
    );
  }

  function makeReactivar(): ReactivarComponenteUseCase {
    return new ReactivarComponenteUseCase(
      makeTxRunner(),
      equipoRepo,
      componenteRepo,
      construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo }),
    );
  }

  /** Deja el componente descartado por el camino real (la unidad queda DESCARTADA, con su evento). */
  async function descartarComponente(): Promise<void> {
    const retirado = await conTenant(() =>
      makeRetirar().execute({
        equipoId,
        componenteId,
        destino: 'DESCARTE',
        motivo: 'preparacion',
        usuarioId: DUMMY_USUARIO_ID,
      }),
    );
    expect(retirado.isOk()).toBe(true);
  }

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

  /** Los tres locks que el servicio toma antes del componente, del más bajo al más alto. */
  const LOCKS_BAJOS: Array<[string, string, () => unknown[]]> = [
    [
      'L1 (fila del insumo)',
      'SELECT id FROM insumos WHERE id = $1 FOR NO KEY UPDATE',
      () => [insumoId],
    ],
    [
      'L2 (advisory del insumo)',
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      () => [`insumo-stock:${insumoId}`],
    ],
    [
      'L3 (fila de la unidad)',
      'SELECT id FROM unidades_insumo WHERE id = $1 FOR NO KEY UPDATE',
      () => [unidadId],
    ],
  ];

  /**
   * Retiene `consulta` desde un cliente externo, lanza `operacion` y comprueba que,
   * bloqueada, todavía no tocó `componentes_equipo`. Devuelve el resultado de la
   * operación ya liberada, para que cada test afirme su desenlace.
   */
  async function conLockRetenidoSinComponente<T>(
    consulta: string,
    parametros: unknown[],
    operacion: () => Promise<T>,
  ): Promise<T> {
    const bloqueador = await pool.connect();
    const testigo = await pool.connect();
    let enCurso: Promise<T> | undefined;
    try {
      await bloqueador.query('BEGIN');
      await bloqueador.query(consulta, parametros);
      const { rows: pidRows } = await bloqueador.query('SELECT pg_backend_pid() AS pid');

      enCurso = conTenant(operacion);
      const pidServicio = await esperarBloqueadoPor(testigo, pidRows[0].pid);

      const { rows } = await testigo.query(
        `SELECT count(*) AS en_componentes FROM pg_locks
         WHERE pid = $1 AND locktype = 'relation' AND relation = 'componentes_equipo'::regclass`,
        [pidServicio],
      );
      expect(Number(rows[0].en_componentes)).toBe(0);
    } finally {
      await bloqueador.query('COMMIT').catch(() => undefined);
      bloqueador.release();
      testigo.release();
      // Que la operación termine siempre: si una aserción falló, no debe escribir tras la limpieza.
      await enCurso?.catch(() => undefined);
    }
    return enCurso as Promise<T>;
  }

  describe('retiro (L1 a L3 antes de L4)', () => {
    const DESTINOS = ['STOCK_USADO', 'DESCARTE'] as const;
    const CASOS = DESTINOS.flatMap((destino) =>
      LOCKS_BAJOS.map(
        ([nombre, consulta, parametros]) => [destino, nombre, consulta, parametros] as const,
      ),
    );

    it.each(CASOS)(
      '%s esperando %s: el servicio todavia no marco el componente (sin lock de relacion sobre componentes_equipo)',
      async (destino, _nombre, consulta, parametros) => {
        const resultado = await conLockRetenidoSinComponente(consulta, parametros(), () =>
          makeRetirar().execute({
            equipoId,
            componenteId,
            destino,
            motivo: 'testigo del orden',
            usuarioId: DUMMY_USUARIO_ID,
          }),
        );

        expect(resultado.isOk()).toBe(true);
        const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
          where: { id: componenteId },
        });
        expect(fila.bajaDestino).toBe(destino);
      },
      30_000,
    );

    it.each(DESTINOS)(
      `${CONCURRENCIA} retiros simultaneos (%s) del MISMO componente: UNO gana y el resto es ComponenteDadoDeBaja, sin 40P01`,
      async (destino) => {
        const resultados = await conTenant(() =>
          Promise.all(
            Array.from({ length: CONCURRENCIA }, () =>
              makeRetirar().execute({
                equipoId,
                componenteId,
                destino,
                motivo: 'carrera',
                usuarioId: DUMMY_USUARIO_ID,
              }),
            ),
          ),
        );

        expect(resultados.filter((r) => r.isOk())).toHaveLength(1);
        for (const perdedor of resultados.filter((r) => r.isFail())) {
          expect(perdedor.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
        }
        // Un solo evento de la unidad: la pieza se movio una vez.
        expect(await tenantClient.eventoUnidadInsumo.count({ where: { unidadId } })).toBe(1);
        const entradas = await tenantClient.movimientoInsumo.count({
          where: { insumoId, tipo: 'ENTRADA' },
        });
        expect(entradas).toBe(destino === 'STOCK_USADO' ? 1 : 0);
      },
      60_000,
    );
  });

  describe('reactivar (L1 a L3 antes de L4)', () => {
    beforeEach(descartarComponente);

    it.each(LOCKS_BAJOS)(
      'esperando %s: el servicio todavia no guardo el componente (sin lock de relacion sobre componentes_equipo)',
      async (_nombre, consulta, parametros) => {
        const resultado = await conLockRetenidoSinComponente(consulta, parametros(), () =>
          makeReactivar().execute({ equipoId, componenteId, usuarioId: DUMMY_USUARIO_ID }),
        );

        expect(resultado.isOk()).toBe(true);
        const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
          where: { id: componenteId },
        });
        expect(fila.deletedAt).toBeNull();
        const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({
          where: { id: unidadId },
        });
        expect(unidad).toMatchObject({ estado: 'INSTALADA', equipoId });
      },
      30_000,
    );

    it(`${CONCURRENCIA} reactivaciones simultaneas del MISMO componente: UNA gana y el resto es rechazado, sin 40P01`, async () => {
      const resultados = await conTenant(() =>
        Promise.all(
          Array.from({ length: CONCURRENCIA }, () =>
            makeReactivar().execute({ equipoId, componenteId, usuarioId: DUMMY_USUARIO_ID }),
          ),
        ),
      );

      expect(resultados.filter((r) => r.isOk())).toHaveLength(1);
      for (const perdedor of resultados.filter((r) => r.isFail())) {
        const error = perdedor.getError();
        expect(
          error instanceof UnidadDelComponenteNoDisponibleError ||
            error instanceof ComponenteYaActivoError,
        ).toBe(true);
      }
      // Un DESCARTE (de la preparacion) y una sola REACTIVACION.
      const eventos = await tenantClient.eventoUnidadInsumo.findMany({
        where: { unidadId },
        orderBy: { createdAt: 'asc' },
      });
      expect(eventos.map((e) => e.tipo)).toEqual(['DESCARTE', 'REACTIVACION']);
    }, 60_000);

    it('reactivar y retirar a la vez: ningun 40P01 y el componente queda coherente con su unidad', async () => {
      // Las rondas alternan los ganadores posibles: retiro sobre un componente que otro
      // reactivo antes, o reactivacion que llega tras un retiro. Se afirma el RESULTADO
      // (consistencia de las dos filas), no el orden de los locks.
      for (let ronda = 0; ronda < 5; ronda += 1) {
        const resultados = await conTenant(() =>
          Promise.all(
            Array.from({ length: 4 }, (_, i) =>
              i % 2 === 0
                ? makeReactivar().execute({ equipoId, componenteId, usuarioId: DUMMY_USUARIO_ID })
                : makeRetirar().execute({
                    equipoId,
                    componenteId,
                    destino: 'DESCARTE',
                    motivo: 'carrera',
                    usuarioId: DUMMY_USUARIO_ID,
                  }),
            ),
          ),
        );
        // Si algun caso de uso hubiera lanzado (40P01 u otro), `Promise.all` habria rechazado.
        expect(resultados.length).toBe(4);

        const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
          where: { id: componenteId },
        });
        const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({
          where: { id: unidadId },
        });
        if (fila.deletedAt === null) {
          expect(unidad).toMatchObject({ estado: 'INSTALADA', equipoId });
        } else {
          expect(unidad).toMatchObject({ estado: 'DESCARTADA', equipoId: null });
        }
        // Dejar el componente descartado para la ronda siguiente.
        if (fila.deletedAt === null) await descartarComponente();
      }
    }, 120_000);

    it('tras recuperar la pieza (ADR-14) reactivar se rechaza y no cambia nada', async () => {
      const operaciones = construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo });
      const recuperada = await conTenant(() =>
        makeTxRunner().run(() =>
          operaciones.recuperarDescartadas(insumoId, [unidadId], {
            usuarioId: DUMMY_USUARIO_ID,
            motivo: 'se recupero',
            condicion: 'USADO',
          }),
        ),
      );
      expect(recuperada.isOk()).toBe(true);

      const resultado = await conTenant(() =>
        makeReactivar().execute({ equipoId, componenteId, usuarioId: DUMMY_USUARIO_ID }),
      );

      expect(resultado.getError()).toBeInstanceOf(UnidadDelComponenteNoDisponibleError);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).not.toBeNull();
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad).toMatchObject({ estado: 'EN_DEPOSITO', equipoId: null });
      const eventos = await tenantClient.eventoUnidadInsumo.findMany({
        where: { unidadId },
        orderBy: { createdAt: 'asc' },
      });
      expect(eventos.map((e) => e.tipo)).toEqual(['DESCARTE', 'RECUPERACION']);
    }, 30_000);

    it('con el insumo vuelto a NINGUNO reactivar se rechaza (SeguimientoNoModificable) y no cambia nada', async () => {
      await tenantClient.insumo.update({
        where: { id: insumoId },
        data: { seguimiento: 'NINGUNO' },
      });
      try {
        const resultado = await conTenant(() =>
          makeReactivar().execute({ equipoId, componenteId, usuarioId: DUMMY_USUARIO_ID }),
        );

        expect(resultado.getError()).toBeInstanceOf(SeguimientoNoModificableError);
      } finally {
        await tenantClient.insumo.update({
          where: { id: insumoId },
          data: { seguimiento: 'SERIE' },
        });
      }
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad.estado).toBe('DESCARTADA');
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).not.toBeNull();
    }, 30_000);
  });
});
