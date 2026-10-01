/**
 * [INTEGRATION] `registrarDevolucionesDeEquipo` y `diagnosticarDevolucionesDeEquipo`
 * con los repositorios Prisma reales sobre `soporte_tenant_test` (fixtures con
 * prefijo por corrida, como `invariante-serie.integration.spec.ts`): el lote
 * vuelve entero al depósito o no cambia nada, y el invariante del insumo
 * `SERIE` vale tras cada caso.
 *
 * No toca `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { DevolucionConPiezasProblematicasError } from '../../domain/errors/unidades-insumo.errors';
import { PrismaEventoUnidadInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-evento-unidad-insumo.repository';
import { PrismaFamiliaInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-unidad-insumo.repository';
import { leerYVerificarInvarianteSerie } from '../../testing/invariante-serie';
import { OperacionesUnidadInsumo } from '../services/operaciones-unidad-insumo.service';
import {
  PiezaDeEquipoADevolver,
  RegistrarEntradaInsumoUseCase,
} from './registrar-entrada-insumo.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const LEYENDA = 'Baja del equipo «PC-Int» — Vejez';

describe('registrarDevolucionesDeEquipo — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let servicio: OperacionesUnidadInsumo;
  let useCase: RegistrarEntradaInsumoUseCase;
  let unidadRepo: PrismaUnidadInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;
  let eventoRepo: PrismaEventoUnidadInsumoRepository;

  const PREFIJO = `DEV_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();
  let equipoId: string;
  let serieId: string;
  let ningunoId: string;
  let deshabilitadoId: string;
  let borradoId: string;
  let todosLosInsumos: string[];

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 5,
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
    useCase = new RegistrarEntradaInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      familiaRepo,
      txRunner,
      servicio,
    );

    equipoId = (await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}EQ` } }))
      .id;
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
    });
    const crearInsumo = async (
      sufijo: string,
      extra: { seguimiento?: string; activo?: boolean; deletedAt?: Date },
    ) =>
      (
        await tenantClient.insumo.create({
          data: {
            codigo: `${PREFIJO}${sufijo}`,
            nombre: `Insumo ${sufijo}`,
            familiaId: familia.id,
            unidadMedidaId: unidadMedida.id,
            ...extra,
          },
        })
      ).id;
    serieId = await crearInsumo('S', { seguimiento: 'SERIE' });
    ningunoId = await crearInsumo('N', {});
    deshabilitadoId = await crearInsumo('D', { activo: false });
    borradoId = await crearInsumo('B', { deletedAt: new Date('2026-01-01T00:00:00Z') });
    todosLosInsumos = [serieId, ningunoId, deshabilitadoId, borradoId];
  }, 30_000);

  async function limpiar(): Promise<void> {
    const enInsumos = { insumoId: { in: todosLosInsumos } };
    await tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidad: enInsumos } });
    await tenantClient.movimientoInsumo.deleteMany({ where: enInsumos });
    await tenantClient.unidadInsumo.deleteMany({ where: enInsumos });
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
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-dev' },
      fn,
    );
  }

  const enTx = <T>(fn: () => Promise<T>) => conTenant(() => txRunner.run(fn));

  /** Invariante del insumo SERIE: se llama tras CADA caso. */
  async function exigirInvariante(): Promise<void> {
    const violaciones = await conTenant(() =>
      leerYVerificarInvarianteSerie({ unidadRepo, movimientoRepo, eventoRepo }, serieId),
    );
    expect(violaciones).toEqual([]);
  }

  /** Alta de unidades `SERIE` en el depósito y su instalación en el equipo. */
  async function instalarUnidades(seriales: string[]) {
    const alta = await conTenant(() =>
      useCase.execute({ insumoId: serieId, cantidad: seriales.length, usuarioId, seriales }),
    );
    expect(alta.isOk()).toBe(true);
    const unidades = await tenantClient.unidadInsumo.findMany({
      where: { insumoId: serieId, numeroSerie: { in: seriales } },
      orderBy: { numeroSerie: 'asc' },
    });
    const items = unidades.map((u) => ({
      unidadId: u.id,
      equipoId,
      componenteId: randomUUID(),
    }));
    expect((await enTx(() => servicio.instalar(items, { usuarioId }))).isOk()).toBe(true);
    return items;
  }

  function piezaUnidad(item: { unidadId: string; componenteId: string }): PiezaDeEquipoADevolver {
    return {
      componenteId: item.componenteId,
      insumoId: serieId,
      unidadId: item.unidadId,
      numeroSerie: null,
    };
  }

  const piezaSinUnidad = (
    insumoId: string,
    numeroSerie: string | null = null,
  ): PiezaDeEquipoADevolver => ({
    componenteId: randomUUID(),
    insumoId,
    unidadId: null,
    numeroSerie,
  });

  /** Foto de lo que la baja podría escribir: movimientos, eventos y estado de las unidades. */
  async function foto() {
    const enInsumos = { insumoId: { in: todosLosInsumos } };
    return {
      movimientos: await tenantClient.movimientoInsumo.count({ where: enInsumos }),
      eventos: await tenantClient.eventoUnidadInsumo.count({ where: { unidad: enInsumos } }),
      unidades: (
        await tenantClient.unidadInsumo.findMany({
          where: enInsumos,
          orderBy: { numeroSerie: 'asc' },
        })
      ).map((u) => `${u.numeroSerie}:${u.estado}`),
    };
  }

  const devolver = (piezas: PiezaDeEquipoADevolver[]) =>
    conTenant(async () => {
      const resultado = await txRunner.run(() =>
        useCase.registrarDevolucionesDeEquipo({ equipoId, usuarioId, motivo: LEYENDA, piezas }),
      );
      return resultado;
    });

  it('dos unidades INSTALADA, un NINGUNO y un insumo deshabilitado vuelven al deposito como USADO con evento y ENTRADA', async () => {
    const [a, b] = await instalarUnidades(['A1', 'A2']);
    const nin = piezaSinUnidad(ningunoId);
    const des = piezaSinUnidad(deshabilitadoId);

    const result = await devolver([piezaUnidad(a), piezaUnidad(b), nin, des]);

    expect(result.isOk()).toBe(true);
    const movimientos = result.getValue();
    expect([...movimientos.keys()].sort()).toEqual(
      [a.componenteId, b.componenteId, nin.componenteId, des.componenteId].sort(),
    );

    for (const item of [a, b]) {
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({
        where: { id: item.unidadId },
      });
      expect(unidad.estado).toBe('EN_DEPOSITO');
      expect(unidad.condicion).toBe('USADO');
      expect(unidad.equipoId).toBeNull();
      const evento = await tenantClient.eventoUnidadInsumo.findFirstOrThrow({
        where: { unidadId: item.unidadId, tipo: 'RETIRO_A_DEPOSITO' },
      });
      expect(evento.equipoId).toBe(equipoId);
      expect(evento.motivo).toBe(LEYENDA);
      const entrada = await tenantClient.movimientoInsumo.findUniqueOrThrow({
        where: { id: movimientos.get(item.componenteId) },
      });
      expect(entrada).toMatchObject({ tipo: 'ENTRADA', condicion: 'USADO', equipoId });
    }

    for (const [pieza, insumoId] of [
      [nin, ningunoId],
      [des, deshabilitadoId],
    ] as const) {
      const entrada = await tenantClient.movimientoInsumo.findUniqueOrThrow({
        where: { id: movimientos.get(pieza.componenteId) },
      });
      expect(entrada).toMatchObject({
        insumoId,
        tipo: 'ENTRADA',
        condicion: 'USADO',
        equipoId,
        motivo: LEYENDA,
      });
      expect(Number(entrada.cantidad)).toBe(1);
    }
    await exigirInvariante();
  }, 30_000);

  it('un legado SERIE con serial valido crea su unidad USADO con evento INGRESO y el equipo', async () => {
    const legado = piezaSinUnidad(serieId, 'LEG-1');

    const result = await devolver([legado]);

    expect(result.isOk()).toBe(true);
    const unidad = await tenantClient.unidadInsumo.findFirstOrThrow({
      where: { insumoId: serieId, numeroSerie: 'LEG-1' },
    });
    expect(unidad).toMatchObject({ estado: 'EN_DEPOSITO', condicion: 'USADO' });
    const evento = await tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId: unidad.id, tipo: 'INGRESO' },
    });
    expect(evento.equipoId).toBe(equipoId);
    await exigirInvariante();
  }, 30_000);

  it('una pieza con insumo borrado rechaza el lote y NO cambia nada', async () => {
    const [a, b] = await instalarUnidades(['B1', 'B2']);
    const antes = await foto();

    const result = await devolver([
      piezaUnidad(a),
      piezaUnidad(b),
      piezaSinUnidad(ningunoId),
      piezaSinUnidad(borradoId),
    ]);

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(DevolucionConPiezasProblematicasError);
    expect((error as DevolucionConPiezasProblematicasError).piezas).toMatchObject([
      { insumoId: borradoId, causa: 'INSUMO_BORRADO' },
    ]);
    expect(await foto()).toEqual(antes);
    expect(antes.unidades).toEqual(['B1:INSTALADA', 'B2:INSTALADA']);
    await exigirInvariante();
  }, 30_000);

  it('INSUMO_BORRADO y SERIAL_DUPLICADO se listan juntos y nada cambia', async () => {
    const [a] = await instalarUnidades(['C1']);
    // Serial ya existente (en deposito) del mismo insumo SERIE: el legado choca.
    const alta = await conTenant(() =>
      useCase.execute({ insumoId: serieId, cantidad: 1, usuarioId, seriales: ['DUP-1'] }),
    );
    expect(alta.isOk()).toBe(true);
    const antes = await foto();
    const duplicado = piezaSinUnidad(serieId, ' dup-1 ');
    const borrada = piezaSinUnidad(borradoId);

    const result = await devolver([piezaUnidad(a), duplicado, borrada]);

    const error = result.getError() as DevolucionConPiezasProblematicasError;
    expect(error).toBeInstanceOf(DevolucionConPiezasProblematicasError);
    expect(error.piezas.map((p) => `${p.componenteId}:${p.causa}`).sort()).toEqual(
      [
        `${borrada.componenteId}:INSUMO_BORRADO`,
        `${duplicado.componenteId}:SERIAL_DUPLICADO`,
      ].sort(),
    );
    expect(await foto()).toEqual(antes);
    await exigirInvariante();
  }, 30_000);

  it('diagnosticarDevolucionesDeEquipo lista las mismas causas sin transaccion y sin escribir', async () => {
    await conTenant(() =>
      useCase.execute({ insumoId: serieId, cantidad: 1, usuarioId, seriales: ['DUP-2'] }),
    );
    const antes = await foto();
    const duplicado = piezaSinUnidad(serieId, 'DUP-2');
    const borrada = piezaSinUnidad(borradoId);
    const sinSerial = piezaSinUnidad(serieId, null);

    const causas = await conTenant(() =>
      useCase.diagnosticarDevolucionesDeEquipo([
        duplicado,
        borrada,
        sinSerial,
        piezaSinUnidad(ningunoId),
      ]),
    );

    expect(causas.map((c) => `${c.componenteId}:${c.causa}`).sort()).toEqual(
      [
        `${borrada.componenteId}:INSUMO_BORRADO`,
        `${sinSerial.componenteId}:SERIAL_REQUERIDO`,
        `${duplicado.componenteId}:SERIAL_DUPLICADO`,
      ].sort(),
    );
    expect(await foto()).toEqual(antes);
  }, 30_000);
});
