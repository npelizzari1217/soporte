/**
 * [INTEGRATION] `PrismaUnidadInsumoRepository` contra Postgres REAL
 * (`soporte_tenant_test`), incluida la concurrencia (ADR-1, ADR-4 y ADR-12 de
 * sdd/repuestos-numero-de-serie).
 *
 * ── LA CONCURRENCIA TIENE QUE SER GENUINA ────────────────────────────────
 * Como en `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`
 * (de donde sale el molde), el pool es PROPIO e instrumentado: si encolara en
 * vez de dar N conexiones simultáneas, el encolamiento serializaría las
 * transacciones por su cuenta y el resultado de negocio daría verde con o sin el
 * mecanismo. Cada caso concurrente (a) reinicia el máximo observado justo antes
 * del bloque concurrente —el pool se comparte con los tests anteriores— y (b)
 * afirma que fue mayor que 1 ANTES que cualquier assert de negocio.
 *
 * Fixtures con prefijo por corrida sobre la base compartida. Este spec no toca
 * `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaUnidadInsumoRepository } from './prisma-unidad-insumo.repository';
import { UnidadInsumoEntity } from '../../../domain/entities/unidad-insumo.entity';
import { FalloOperacionDeUnidad } from '../../../domain/errors/fallo-operacion-de-unidad';
import { SerialDuplicadoError } from '../../../domain/errors/unidades-insumo.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

const CONCURRENCIA = 6;
const POOL_MAX = CONCURRENCIA + 5;
/** Cuánto se sostiene abierta la transacción entre la lectura y la escritura. */
const RETENCION_S = 0.25;

/**
 * Instrumenta `pool.connect()` para medir conexiones CHECKED-OUT a la vez. Deja
 * pasar sin tocar la variante con callback (la usa `pool.query()` por dentro:
 * devolverle una promesa la cuelga). Devuelve el getter y el reinicio del máximo.
 */
function instrumentarConcurrenciaDelPool(pool: Pool): {
  max: () => number;
  reiniciar: () => void;
} {
  let activas = 0;
  let maxObservado = 0;
  const connectOriginal = pool.connect.bind(pool);
  type Cb = (err: Error | undefined, client: PoolClient, release: (r?: unknown) => void) => void;

  const connectInstrumentado = (callback?: Cb): Promise<PoolClient> | void => {
    if (callback) return (connectOriginal as unknown as (cb: Cb) => void)(callback);
    return (connectOriginal as () => Promise<PoolClient>)().then((client) => {
      activas += 1;
      maxObservado = Math.max(maxObservado, activas);
      const releaseOriginal = client.release.bind(client);
      client.release = ((err?: Error | boolean) => {
        activas -= 1;
        return releaseOriginal(err);
      }) as typeof client.release;
      return client;
    });
  };
  pool.connect = connectInstrumentado as unknown as typeof pool.connect;
  return {
    max: () => maxObservado,
    // Reinicia al nivel actual (las conexiones ya en vuelo siguen contando).
    reiniciar: () => {
      maxObservado = activas;
    },
  };
}

describe('PrismaUnidadInsumoRepository — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let poolTestigo: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let repo: PrismaUnidadInsumoRepository;
  let medidorDelPool: ReturnType<typeof instrumentarConcurrenciaDelPool>;

  const PREFIJO = `UNI_${randomBytes(2).toString('hex')}_`;
  let insumoId: string;
  let otroInsumoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl, max: POOL_MAX });
    medidorDelPool = instrumentarConcurrenciaDelPool(pool);
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    poolTestigo = new Pool({ connectionString: tenantUrl, max: 3 });

    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    repo = new PrismaUnidadInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
    });
    const crearInsumo = (sufijo: string) =>
      tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}${sufijo}`,
          nombre: `Insumo ${sufijo}`,
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'SERIE',
        },
      });
    insumoId = (await crearInsumo('A')).id;
    otroInsumoId = (await crearInsumo('B')).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.unidadInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, otroInsumoId] } },
    });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await poolTestigo.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.unidadInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, otroInsumoId] } },
    });
  });

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-uni' },
      fn,
    );
  }

  function nueva(
    numeroSerie: string | null,
    over: { insumo?: string; condicion?: 'NUEVO' | 'USADO' } = {},
  ): UnidadInsumoEntity {
    return UnidadInsumoEntity.crearEnDeposito({
      insumoId: over.insumo ?? insumoId,
      condicion: over.condicion ?? 'NUEVO',
      numeroSerie,
    }).getValue();
  }

  async function esperarEnLaTransaccion(segundos: number): Promise<void> {
    await tenantClient.$executeRaw`SELECT pg_sleep(${segundos})`;
  }

  async function datoDeFila(id: string): Promise<{ estado: string; numero_serie: string | null }> {
    const r = await poolTestigo.query<{ estado: string; numero_serie: string | null }>(
      'SELECT estado, numero_serie FROM unidades_insumo WHERE id = $1',
      [id],
    );
    return r.rows[0];
  }

  describe('insertar() y lecturas', () => {
    it('hace round-trip de una unidad con serial y de una pendiente', async () => {
      const conSerial = nueva('  ab 12 ');
      const pendiente = nueva(null);
      await conTenant(async () => {
        await repo.insertar(conSerial);
        await repo.insertar(pendiente);
      });

      const leida = await conTenant(() => repo.findById(conSerial.id));
      expect(leida?.numeroSerie).toBe('ab 12');
      expect(leida?.numeroSerieNormalizado).toBe('AB12');
      expect(leida?.estado).toBe('EN_DEPOSITO');
      const leidaPendiente = await conTenant(() => repo.findById(pendiente.id));
      expect(leidaPendiente?.esPendiente).toBe(true);
      await expect(
        conTenant(() => repo.findById('00000000-0000-4000-8000-000000000000')),
      ).resolves.toBeNull();
    });

    it('cuenta por condición y por estado, con todas las claves presentes', async () => {
      const enDeposito = nueva('S1');
      const usada = nueva('S2', { condicion: 'USADO' });
      const entregada = nueva('S3');
      await conTenant(async () => {
        await repo.insertar(enDeposito);
        await repo.insertar(usada);
        await repo.insertar(entregada);
        entregada.entregar();
        await repo.guardarConEstadoEsperado(entregada, 'EN_DEPOSITO');
      });

      await expect(conTenant(() => repo.contarEnDepositoPorCondicion(insumoId))).resolves.toEqual({
        NUEVO: 1,
        USADO: 1,
      });
      await expect(conTenant(() => repo.contarPorEstado(insumoId))).resolves.toEqual({
        EN_DEPOSITO: 2,
        INSTALADA: 0,
        ENTREGADA: 1,
        DESCARTADA: 0,
      });
      await expect(
        conTenant(() => repo.contarEnDepositoPorCondicion(otroInsumoId)),
      ).resolves.toEqual({
        NUEVO: 0,
        USADO: 0,
      });
    });

    it('lista por insumo ordenada por id, con filtro opcional de estado', async () => {
      const a = nueva('L1');
      const b = nueva('L2');
      await conTenant(async () => {
        await repo.insertar(a);
        await repo.insertar(b);
        b.entregar();
        await repo.guardarConEstadoEsperado(b, 'EN_DEPOSITO');
      });

      const todas = await conTenant(() => repo.listarPorInsumo(insumoId));
      expect(todas.map((u) => u.id)).toEqual([a.id, b.id].sort());
      const entregadas = await conTenant(() => repo.listarPorInsumo(insumoId, ['ENTREGADA']));
      expect(entregadas.map((u) => u.id)).toEqual([b.id]);
      await expect(conTenant(() => repo.listarPorInsumo(otroInsumoId))).resolves.toEqual([]);
    });
  });

  describe('serial duplicado (P2002 -> SerialDuplicadoError)', () => {
    async function capturar(fn: () => Promise<unknown>): Promise<unknown> {
      try {
        await fn();
      } catch (err) {
        return err;
      }
      return undefined;
    }

    it('el índice compara la forma NORMALIZADA, por insumo', async () => {
      await conTenant(() => repo.insertar(nueva('ab 12')));

      const err = await capturar(() => conTenant(() => repo.insertar(nueva(' AB1 2 '))));
      expect(err).toBeInstanceOf(FalloOperacionDeUnidad);
      expect((err as FalloOperacionDeUnidad).errorDeDominio).toBeInstanceOf(SerialDuplicadoError);
      expect((err as FalloOperacionDeUnidad).errorDeDominio.code).toBe('SERIAL_DUPLICADO');

      // Otro insumo puede repetir el serial; una pendiente puede repetirse siempre.
      await expect(
        conTenant(() => repo.insertar(nueva('ab 12', { insumo: otroInsumoId }))),
      ).resolves.toBeUndefined();
      await conTenant(async () => {
        await repo.insertar(nueva(null));
        await repo.insertar(nueva(null));
      });
    });

    it('un serial ocupado sigue ocupado aunque la unidad esté DESCARTADA', async () => {
      const original = nueva('ZZ9');
      await conTenant(async () => {
        await repo.insertar(original);
        original.descartarDeDeposito();
        await repo.guardarConEstadoEsperado(original, 'EN_DEPOSITO');
      });
      expect((await datoDeFila(original.id)).estado).toBe('DESCARTADA');

      const err = await capturar(() => conTenant(() => repo.insertar(nueva('zz9'))));
      expect((err as FalloOperacionDeUnidad).errorDeDominio).toBeInstanceOf(SerialDuplicadoError);
    });

    it('corregir un serial a uno ya tomado también se traduce', async () => {
      const a = nueva('C1');
      const b = nueva('C2');
      await conTenant(async () => {
        await repo.insertar(a);
        await repo.insertar(b);
      });

      const err = await capturar(() =>
        conTenant(async () => {
          b.corregirSerial('c1');
          await repo.guardarConEstadoEsperado(b, 'EN_DEPOSITO');
        }),
      );
      expect((err as FalloOperacionDeUnidad).errorDeDominio).toBeInstanceOf(SerialDuplicadoError);
      expect((await datoDeFila(b.id)).numero_serie).toBe('C2');
    });
  });

  describe('bloquearPorIds() y CAS de estado', () => {
    it('falla fuera de una transacción nombrando la transacción faltante', async () => {
      await expect(conTenant(() => repo.bloquearPorIds([insumoId]))).rejects.toThrow(
        /requiere una transacción activa/,
      );
    });

    it('devuelve las unidades en orden de id, omite las inexistentes y acepta la lista vacía', async () => {
      const unidades = [nueva('O1'), nueva('O2'), nueva('O3')];
      await conTenant(async () => {
        for (const u of unidades) await repo.insertar(u);
      });
      const idsAlReves = unidades
        .map((u) => u.id)
        .sort()
        .reverse();

      const leidas = await conTenant(() =>
        txRunner.run(() =>
          repo.bloquearPorIds([...idsAlReves, '00000000-0000-4000-8000-000000000000']),
        ),
      );
      expect(leidas.map((u) => u.id)).toEqual([...idsAlReves].sort());
      await expect(conTenant(() => txRunner.run(() => repo.bloquearPorIds([])))).resolves.toEqual(
        [],
      );
    });

    it('toma FOR NO KEY UPDATE: otro FOR NO KEY UPDATE espera y un FOR KEY SHARE (FK) pasa', async () => {
      const u = nueva('K1');
      await conTenant(() => repo.insertar(u));

      const intentar = async (modo: string): Promise<boolean> => {
        const c = await poolTestigo.connect();
        try {
          await c.query('BEGIN');
          try {
            await c.query(`SELECT 1 FROM unidades_insumo WHERE id = $1 ${modo} NOWAIT`, [u.id]);
            return true;
          } catch (err) {
            if ((err as { code?: string }).code === '55P03') return false;
            throw err;
          } finally {
            await c.query('ROLLBACK');
          }
        } finally {
          c.release();
        }
      };
      const visto = await conTenant(() =>
        txRunner.run(async () => {
          await repo.bloquearPorIds([u.id]);
          return {
            exclusivo: await intentar('FOR NO KEY UPDATE'),
            keyShare: await intentar('FOR KEY SHARE'),
          };
        }),
      );
      expect(visto).toEqual({ exclusivo: false, keyShare: true });
    });

    it('el CAS persiste la transición y lanza si el estado esperado ya no es el real', async () => {
      const u = nueva('T1');
      await conTenant(() => repo.insertar(u));

      await conTenant(() =>
        txRunner.run(async () => {
          const [leida] = await repo.bloquearPorIds([u.id]);
          leida.entregar();
          await repo.guardarConEstadoEsperado(leida, 'EN_DEPOSITO');
        }),
      );
      expect((await datoDeFila(u.id)).estado).toBe('ENTREGADA');

      const obsoleta = (await conTenant(() => repo.findById(u.id)))!;
      await expect(
        conTenant(() => repo.guardarConEstadoEsperado(obsoleta, 'EN_DEPOSITO')),
      ).rejects.toThrow(/no estaba EN_DEPOSITO/);
    });
  });

  describe('concurrencia real', () => {
    it(
      `${CONCURRENCIA} inserciones simultáneas del MISMO serial (en mayúsculas y minúsculas): ` +
        'una sola entra y el resto recibe SerialDuplicadoError',
      async () => {
        medidorDelPool.reiniciar();
        const resultados = await conTenant(() =>
          Promise.allSettled(
            Array.from({ length: CONCURRENCIA }, (_, i) =>
              txRunner.run(async () => {
                await repo.insertar(nueva(i % 2 === 0 ? 'race-1' : ' RACE-1 '));
                // Retiene la transacción: las demás esperan en el índice único.
                await esperarEnLaTransaccion(RETENCION_S);
              }),
            ),
          ),
        );

        expect(medidorDelPool.max()).toBeGreaterThan(1);

        const ok = resultados.filter((r) => r.status === 'fulfilled');
        const rechazadas = resultados.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        expect(ok).toHaveLength(1);
        expect(rechazadas).toHaveLength(CONCURRENCIA - 1);
        for (const r of rechazadas) {
          expect(r.reason).toBeInstanceOf(FalloOperacionDeUnidad);
          expect((r.reason as FalloOperacionDeUnidad).errorDeDominio).toBeInstanceOf(
            SerialDuplicadoError,
          );
        }
        expect(await tenantClient.unidadInsumo.count({ where: { insumoId } })).toBe(1);
      },
      60_000,
    );

    it(
      `${CONCURRENCIA} salidas simultáneas de la MISMA unidad: una entrega y el resto la ve ` +
        'ya entregada, sin que ninguna llegue a un CAS de 0 filas',
      async () => {
        const u = nueva('RACE-UNIT');
        await conTenant(() => repo.insertar(u));

        medidorDelPool.reiniciar();
        const resultados = await conTenant(() =>
          Promise.allSettled(
            Array.from({ length: CONCURRENCIA }, () =>
              txRunner.run(async () => {
                const [leida] = await repo.bloquearPorIds([u.id]);
                if (leida.estado !== 'EN_DEPOSITO') return 'rechazada';
                // Entre leer y escribir: sin el lock de fila todas leen EN_DEPOSITO.
                await esperarEnLaTransaccion(RETENCION_S);
                leida.entregar();
                await repo.guardarConEstadoEsperado(leida, 'EN_DEPOSITO');
                return 'entregada';
              }),
            ),
          ),
        );

        expect(medidorDelPool.max()).toBeGreaterThan(1);

        // Un CAS de 0 filas lanza: que alguien lo alcance significa que el lock
        // de fila no serializó la lectura.
        expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(0);
        const valores = resultados.map((r) => (r as PromiseFulfilledResult<string>).value);
        expect(valores.filter((v) => v === 'entregada')).toHaveLength(1);
        expect(valores.filter((v) => v === 'rechazada')).toHaveLength(CONCURRENCIA - 1);
        expect((await datoDeFila(u.id)).estado).toBe('ENTREGADA');
      },
      60_000,
    );
  });
});
