/**
 * [INTEGRATION] Invariante del insumo `SERIE` (ADR-2 de
 * sdd/repuestos-numero-de-serie) con los repositorios Prisma reales sobre
 * `soporte_tenant_test`: para toda condicion, `conteo EN_DEPOSITO ==
 * calcularSaldos(libro)`, y el ultimo evento de cada unidad coincide con su
 * estado. Se verifica tras CADA paso de una secuencia que recorre el ciclo de
 * vida de las piezas, y se contrasta con lo que muestra la consulta de stock.
 *
 * Tambien cubre la concurrencia de la salida sobre una misma unidad y que la
 * salida rechazada conserva el lock de fila de la unidad (L3).
 *
 * La recuperacion de una pieza descartada (ADR-14) se habilita en WU-8d y se
 * agrega como ultimo paso de la secuencia ahi.
 *
 * Fixtures con prefijo por corrida. No toca `soporte_master_test`, asi que no
 * necesita `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import { PrismaFamiliaInsumoRepository } from './prisma-familia-insumo.repository';
import { PrismaMovimientoInsumoRepository } from './prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from './prisma-unidad-insumo.repository';
import { PrismaEventoUnidadInsumoRepository } from './prisma-evento-unidad-insumo.repository';
import { OperacionesUnidadInsumo } from '../../../application/services/operaciones-unidad-insumo.service';
import { ConsultarStockInsumoUseCase } from '../../../application/use-cases/consultar-stock-insumo.use-case';
import { RegistrarAjusteInsumoUseCase } from '../../../application/use-cases/registrar-ajuste-insumo.use-case';
import { RegistrarEntradaInsumoUseCase } from '../../../application/use-cases/registrar-entrada-insumo.use-case';
import { RegistrarSalidaInsumoUseCase } from '../../../application/use-cases/registrar-salida-insumo.use-case';
import { UnidadNoDisponibleError } from '../../../domain/errors/unidades-insumo.errors';
import { leerYVerificarInvarianteSerie } from '../../../testing/invariante-serie';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('Invariante del insumo SERIE — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let servicio: OperacionesUnidadInsumo;
  let entrada: RegistrarEntradaInsumoUseCase;
  let salida: RegistrarSalidaInsumoUseCase;
  let ajuste: RegistrarAjusteInsumoUseCase;
  let consultar: ConsultarStockInsumoUseCase;
  let unidadRepo: PrismaUnidadInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;
  let eventoRepo: PrismaEventoUnidadInsumoRepository;

  const PREFIJO = `INV_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();
  let insumoId: string;
  let equipoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 10,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });

    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    const insumoRepo = new PrismaInsumoRepository(tenantContext);
    const familiaRepo = new PrismaFamiliaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);
    unidadRepo = new PrismaUnidadInsumoRepository(tenantContext);
    eventoRepo = new PrismaEventoUnidadInsumoRepository(tenantContext);
    servicio = new OperacionesUnidadInsumo(insumoRepo, movimientoRepo, unidadRepo, eventoRepo);
    entrada = new RegistrarEntradaInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      familiaRepo,
      txRunner,
      servicio,
    );
    salida = new RegistrarSalidaInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      txRunner,
      familiaRepo,
      servicio,
    );
    ajuste = new RegistrarAjusteInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      txRunner,
      familiaRepo,
      servicio,
    );
    consultar = new ConsultarStockInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      familiaRepo,
      unidadRepo,
    );

    equipoId = (await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}EQ` } }))
      .id;
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}A`,
          nombre: 'Insumo SERIE',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'SERIE',
        },
      })
    ).id;
  }, 30_000);

  async function limpiar(): Promise<void> {
    await tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidad: { insumoId } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId } });
  }

  afterAll(async () => {
    await limpiar();
    await tenantClient.equipoInformatico.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(limpiar);

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-inv' },
      fn,
    );
  }

  const enTx = <T>(fn: () => Promise<T>) => conTenant(() => txRunner.run(fn));

  const violaciones = () =>
    conTenant(() =>
      leerYVerificarInvarianteSerie({ unidadRepo, movimientoRepo, eventoRepo }, insumoId),
    );

  async function idDe(numeroSerie: string): Promise<string> {
    return (await tenantClient.unidadInsumo.findFirstOrThrow({ where: { insumoId, numeroSerie } }))
      .id;
  }

  async function estadoDe(id: string): Promise<string> {
    return (await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id } })).estado;
  }

  /** Verifica el invariante y que la consulta de stock muestre el saldo esperado. */
  async function verificar(
    paso: string,
    esperado: { NUEVO: number; USADO: number; pendientes: number },
  ): Promise<void> {
    expect(await violaciones(), `invariante tras: ${paso}`).toEqual([]);
    const stock = (await conTenant(() => consultar.execute(insumoId))).getValue();
    expect(stock.saldos, `saldos tras: ${paso}`).toEqual({
      NUEVO: esperado.NUEVO,
      USADO: esperado.USADO,
    });
    expect(stock.pendientesDeSerie, `pendientes tras: ${paso}`).toBe(esperado.pendientes);
    expect(stock.seguimiento).toBe('SERIE');
  }

  it('secuencia entrada -> salida -> instalar -> retirar USADO -> descartar -> devolucion de entrega: el invariante vale tras cada paso', async () => {
    const entrada4 = await conTenant(() =>
      entrada.execute({
        insumoId,
        cantidad: 4,
        usuarioId,
        seriales: ['A1', 'A2', 'A3', 'A4'],
      }),
    );
    expect(entrada4.isOk()).toBe(true);
    await verificar('entrada de 4', { NUEVO: 4, USADO: 0, pendientes: 0 });

    const pendiente = await enTx(() =>
      servicio.ingresar(insumoId, [{ numeroSerie: null }], {
        usuarioId,
        condicion: 'NUEVO',
        tipo: 'ENTRADA',
      }),
    );
    expect(pendiente.isOk()).toBe(true);
    await verificar('alta de una pendiente', { NUEVO: 5, USADO: 0, pendientes: 1 });

    const [a1, a2, a3] = [await idDe('A1'), await idDe('A2'), await idDe('A3')];

    const sacada = await conTenant(() =>
      salida.execute({ insumoId, cantidad: 1, usuarioId, unidadId: a1, sectorId: null }),
    );
    expect(sacada.isOk()).toBe(true);
    expect(await estadoDe(a1)).toBe('ENTREGADA');
    await verificar('salida de A1', { NUEVO: 4, USADO: 0, pendientes: 1 });

    const item = (unidadId: string) => ({ unidadId, equipoId, componenteId: randomUUID() });
    const itemA2 = item(a2);
    expect((await enTx(() => servicio.instalar([itemA2], { usuarioId }))).isOk()).toBe(true);
    expect(await estadoDe(a2)).toBe('INSTALADA');
    await verificar('instalar A2', { NUEVO: 3, USADO: 0, pendientes: 1 });

    expect(
      (
        await enTx(() => servicio.devolverAlDeposito([itemA2], { usuarioId, motivo: 'baja' }))
      ).isOk(),
    ).toBe(true);
    await verificar('retirar A2 como USADO', { NUEVO: 3, USADO: 1, pendientes: 1 });

    const itemA3 = item(a3);
    expect((await enTx(() => servicio.instalar([itemA3], { usuarioId }))).isOk()).toBe(true);
    expect((await enTx(() => servicio.descartarInstaladas([itemA3], { usuarioId }))).isOk()).toBe(
      true,
    );
    expect(await estadoDe(a3)).toBe('DESCARTADA');
    await verificar('descartar A3 instalada', { NUEVO: 2, USADO: 1, pendientes: 1 });

    const idPendiente = (
      await tenantClient.unidadInsumo.findFirstOrThrow({ where: { insumoId, numeroSerie: null } })
    ).id;
    const baja = await conTenant(() =>
      ajuste.execute({
        insumoId,
        tipo: 'AJUSTE_NEGATIVO',
        cantidad: 1,
        usuarioId,
        unidadId: idPendiente,
        motivo: 'faltante en la recepcion',
      }),
    );
    expect(baja.isOk()).toBe(true);
    expect(await estadoDe(idPendiente)).toBe('DESCARTADA');
    await verificar('ajuste negativo de la pendiente', { NUEVO: 1, USADO: 1, pendientes: 0 });

    expect(
      (
        await enTx(() =>
          servicio.devolverEntregas(insumoId, [a1], { usuarioId, condicion: 'NUEVO' }),
        )
      ).isOk(),
    ).toBe(true);
    expect(await estadoDe(a1)).toBe('EN_DEPOSITO');
    await verificar('devolucion de la entrega de A1', { NUEVO: 2, USADO: 1, pendientes: 0 });
  }, 60_000);

  it('dos salidas concurrentes de la MISMA unidad: una entrega y la otra recibe UnidadNoDisponibleError', async () => {
    await conTenant(() =>
      entrada.execute({ insumoId, cantidad: 2, usuarioId, seriales: ['C1', 'C2'] }),
    );
    const c1 = await idDe('C1');

    const resultados = await Promise.all(
      [0, 1].map(() =>
        conTenant(() => salida.execute({ insumoId, cantidad: 1, usuarioId, unidadId: c1 })),
      ),
    );

    const ok = resultados.filter((r) => r.isOk());
    const fallidas = resultados.filter((r) => r.isFail());
    expect(ok).toHaveLength(1);
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0].getError()).toBeInstanceOf(UnidadNoDisponibleError);
    expect(await tenantClient.movimientoInsumo.count({ where: { insumoId, tipo: 'SALIDA' } })).toBe(
      1,
    );
    await verificar('dos salidas de la misma unidad', { NUEVO: 1, USADO: 0, pendientes: 0 });
  }, 30_000);

  it('una salida rechazada por unidad no disponible conserva el lock de fila de la unidad (L3) hasta cerrar la transaccion', async () => {
    const alta = await enTx(() =>
      servicio.ingresar(insumoId, [{ numeroSerie: 'L3-1' }], {
        usuarioId,
        condicion: 'NUEVO',
        tipo: 'ENTRADA',
      }),
    );
    const unidadId = alta.getValue()[0].unidad.id;
    await enTx(() =>
      servicio.instalar([{ unidadId, equipoId, componenteId: randomUUID() }], { usuarioId }),
    );

    const testigo: PoolClient = await pool.connect();
    let abrir!: () => void;
    const retenida = new Promise<void>((resolve) => {
      abrir = resolve;
    });
    let listaResolver!: () => void;
    const lista = new Promise<void>((resolve) => {
      listaResolver = resolve;
    });
    let operacion: Promise<{ isFail(): boolean; getError(): unknown }> | undefined;
    try {
      // Result.fail no hace rollback: la transaccion retenida solo tiene el lock de LECTURA de la unidad.
      operacion = conTenant(() =>
        txRunner.run(async () => {
          const r = await salida.execute({ insumoId, cantidad: 1, usuarioId, unidadId });
          listaResolver();
          await retenida;
          return r;
        }),
      );
      await Promise.race([lista, operacion]);

      await testigo.query('BEGIN');
      const resultado = await testigo
        .query('SELECT id FROM unidades_insumo WHERE id = $1 FOR NO KEY UPDATE NOWAIT', [unidadId])
        .then(() => 'libre')
        .catch((e: { code?: string }) => e.code ?? 'error');
      await testigo.query('ROLLBACK');
      // 55P03 = lock_not_available: la unidad sigue bloqueada por la salida rechazada.
      expect(resultado).toBe('55P03');
    } finally {
      abrir();
      testigo.release();
    }
    const r = await operacion;
    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
  }, 30_000);
});
