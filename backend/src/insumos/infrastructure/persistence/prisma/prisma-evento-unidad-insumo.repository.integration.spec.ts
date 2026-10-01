/**
 * [INTEGRATION] `PrismaEventoUnidadInsumoRepository` contra Postgres REAL
 * (`soporte_tenant_test`) (ADR-9 de sdd/repuestos-numero-de-serie).
 *
 * Fixtures con prefijo por corrida sobre la base compartida. Este spec no toca
 * `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaEventoUnidadInsumoRepository } from './prisma-evento-unidad-insumo.repository';
import { PrismaUnidadInsumoRepository } from './prisma-unidad-insumo.repository';
import { EventoUnidadInsumoEntity } from '../../../domain/entities/evento-unidad-insumo.entity';
import {
  TIPOS_EVENTO_UNIDAD,
  UnidadInsumoEntity,
} from '../../../domain/entities/unidad-insumo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaEventoUnidadInsumoRepository — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaEventoUnidadInsumoRepository;
  let unidades: PrismaUnidadInsumoRepository;

  const PREFIJO = `EVU_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();
  let insumoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl, max: 3 });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    repo = new PrismaEventoUnidadInsumoRepository(tenantContext);
    unidades = new PrismaUnidadInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}A`,
          nombre: 'Insumo A',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'SERIE',
        },
      })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await limpiar();
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(limpiar);

  /** Orden de borrado: eventos → movimientos → unidades (las FK son Restrict). */
  async function limpiar(): Promise<void> {
    await tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidad: { insumoId } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId } });
  }

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-evu' },
      fn,
    );
  }

  async function crearUnidad(serie: string): Promise<string> {
    const unidad = UnidadInsumoEntity.crearEnDeposito({
      insumoId,
      condicion: 'NUEVO',
      numeroSerie: serie,
    }).getValue();
    await conTenant(() => unidades.insertar(unidad));
    return unidad.id;
  }

  async function crearMovimiento(unidadId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, usuario_id, unidad_id)
       VALUES ($1, 'ENTRADA', 1, $2, $3) RETURNING id`,
      [insumoId, usuarioId, unidadId],
    );
    return rows[0].id;
  }

  const evento = (unidadId: string, tipo: (typeof TIPOS_EVENTO_UNIDAD)[number], extra = {}) =>
    EventoUnidadInsumoEntity.create({ unidadId, tipo, usuarioId, ...extra });

  it('una unidad sin historia devuelve la lista vacía', async () => {
    const unidadId = await crearUnidad('VACIA');
    await expect(conTenant(() => repo.listarPorUnidad(unidadId))).resolves.toEqual([]);
  });

  it('hace round-trip de un evento de cada tipo', async () => {
    const unidadId = await crearUnidad('TIPOS');
    const componenteId = randomUUID();
    const conComponente = new Set([
      'INSTALACION',
      'ALTA_INSTALADA',
      'RETIRO_A_DEPOSITO',
      'DESCARTE',
      'REACTIVACION',
    ]);
    const insertados = TIPOS_EVENTO_UNIDAD.map((tipo) =>
      evento(unidadId, tipo, {
        ...(conComponente.has(tipo) ? { componenteId } : {}),
        ...(tipo === 'CORRECCION_SERIAL'
          ? { serialAnterior: 'A1', serialNuevo: 'A2', motivo: '  error de tipeo ' }
          : {}),
      }),
    );
    await conTenant(async () => {
      for (const e of insertados) await repo.insert(e);
    });

    const leidos = await conTenant(() => repo.listarPorUnidad(unidadId));
    expect(leidos.map((e) => e.tipo)).toEqual([...TIPOS_EVENTO_UNIDAD]);
    expect(leidos.map((e) => e.id)).toEqual(insertados.map((e) => e.id));
    const correccion = leidos.find((e) => e.tipo === 'CORRECCION_SERIAL');
    expect(correccion).toMatchObject({
      serialAnterior: 'A1',
      serialNuevo: 'A2',
      motivo: 'error de tipeo',
      usuarioId,
      movimientoId: null,
    });
    expect(correccion?.createdAt).toBeInstanceOf(Date);
  });

  it('lista en orden cronológico y desempata por id si comparten created_at', async () => {
    const unidadId = await crearUnidad('ORDEN');
    const otraId = await crearUnidad('OTRA');
    const eventos = ['INGRESO', 'SERIAL_CARGADO', 'ENTREGA'].map((t) =>
      evento(unidadId, t as 'INGRESO'),
    );
    await conTenant(async () => {
      for (const e of eventos) await repo.insert(e);
      await repo.insert(evento(otraId, 'INGRESO'));
    });
    const ids = eventos.map((e) => e.id);
    await expect(
      conTenant(() => repo.listarPorUnidad(unidadId)).then((l) => l.map((e) => e.id)),
    ).resolves.toEqual(ids);

    // Mismo instante para todos: el desempate es el id (UUIDv7, monótono).
    await pool.query(
      `UPDATE eventos_unidad_insumo SET created_at = '2026-01-01T00:00:00Z' WHERE unidad_id = $1`,
      [unidadId],
    );
    await expect(
      conTenant(() => repo.listarPorUnidad(unidadId)).then((l) => l.map((e) => e.id)),
    ).resolves.toEqual([...ids].sort());
  });

  it('rechaza un segundo evento sobre el mismo movimiento (UNIQUE) sin perder el primero', async () => {
    const unidadId = await crearUnidad('MOV');
    const movimientoId = await crearMovimiento(unidadId);
    const primero = evento(unidadId, 'ENTREGA', { movimientoId });
    await conTenant(() => repo.insert(primero));

    await expect(
      conTenant(() => repo.insert(evento(unidadId, 'BAJA_DE_DEPOSITO', { movimientoId }))),
    ).rejects.toMatchObject({ code: 'P2002' });

    const leidos = await conTenant(() => repo.listarPorUnidad(unidadId));
    expect(leidos.map((e) => e.id)).toEqual([primero.id]);
    expect(leidos[0].movimientoId).toBe(movimientoId);
  });

  it('guarda componente_id sin FK: un id que no existe en componentes_equipo se asienta', async () => {
    const unidadId = await crearUnidad('COMP');
    const componenteId = randomUUID();
    await conTenant(() => repo.insert(evento(unidadId, 'INSTALACION', { componenteId })));
    const [leido] = await conTenant(() => repo.listarPorUnidad(unidadId));
    expect(leido.componenteId).toBe(componenteId);
  });
});
