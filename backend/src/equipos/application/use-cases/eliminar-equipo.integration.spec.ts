/**
 * [INTEGRATION] `EliminarEquipoUseCase` contra Postgres real (WU-3, baja-equipo-completo, R13).
 *
 * Corrección de defecto: el borrado dejaba el equipo con borrado lógico aunque tuviera
 * componentes activos y unidades `INSTALADA` (huérfanas). Ahora se rechaza si el equipo tiene
 * piezas activas o está dado de baja.
 *
 * Wiring manual sin Nest DI, con repos reales sobre `soporte_tenant_test` y un PREFIJO propio.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaEquipoInformaticoRepository } from '../../infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from '../../infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import { EliminarEquipoUseCase } from './eliminar-equipo.use-case';
import {
  EquipoConComponentesActivosError,
  EquipoDadoDeBajaError,
} from '../../domain/errors/equipos.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('EliminarEquipoUseCase — base real (WU-3, R13)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let useCase: EliminarEquipoUseCase;

  const PREFIJO = `ELQ_${randomBytes(2).toString('hex')}_`;
  let insumoId: string;
  const equipoIds: string[] = [];

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-elq' },
      fn,
    );
  }

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 6,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    useCase = new EliminarEquipoUseCase(
      new PrismaEquipoInformaticoRepository(tenantContext),
      new PrismaComponenteEquipoRepository(tenantContext),
      new PrismaTenantTransactionRunner(tenantContext, { error: () => {} }),
    );

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia borrado equipo', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera borrado equipo', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}I`,
          nombre: 'Repuesto borrado equipo',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'SERIE',
        },
      })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId: { in: equipoIds } } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.equipoInformatico.deleteMany({ where: { id: { in: equipoIds } } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  async function crearEquipo(extra: { activo?: boolean } = {}): Promise<string> {
    const baja = extra.activo === false;
    const equipo = await tenantClient.equipoInformatico.create({
      data: {
        nombre: `${PREFIJO}${randomBytes(2).toString('hex')}`,
        activo: !baja,
        ...(baja && {
          bajaDestino: 'DESCARTE',
          bajaCategoria: 'VEJEZ',
          bajaFecha: new Date(),
          bajaUsuarioId: '01900000-0000-7000-8000-000000000401',
        }),
      },
    });
    equipoIds.push(equipo.id);
    return equipo.id;
  }

  it('con un componente y su unidad INSTALADA: rechaza, el equipo sigue visible, el componente activo y la unidad INSTALADA', async () => {
    const equipoId = await crearEquipo();
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId,
        numeroSerie: 'S1',
        numeroSerieNormalizado: `${PREFIJO}S1`,
        condicion: 'NUEVO',
        estado: 'INSTALADA',
        equipoId,
      },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: { equipoId, insumoId, unidadId: unidad.id },
    });

    const result = await conTenant(() => useCase.execute({ equipoId }));

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(EquipoConComponentesActivosError);
    expect((error as EquipoConComponentesActivosError).cantidad).toBe(1);
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(equipo.deletedAt).toBeNull();
    const c = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(c.deletedAt).toBeNull();
    const u = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidad.id } });
    expect(u.estado).toBe('INSTALADA');
    expect(u.equipoId).toBe(equipoId);
  });

  it('un equipo dado de baja se rechaza con EquipoDadoDeBajaError y sigue visible', async () => {
    const equipoId = await crearEquipo({ activo: false });

    const result = await conTenant(() => useCase.execute({ equipoId }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(equipo.deletedAt).toBeNull();
    expect(equipo.activo).toBe(false);
  });

  it('un equipo sin piezas activas se borra (deletedAt) aunque tenga piezas ya retiradas', async () => {
    const equipoId = await crearEquipo();
    await tenantClient.componenteEquipo.create({
      data: {
        equipoId,
        insumoId,
        deletedAt: new Date(),
        bajaDestino: 'DESCARTE',
        bajaMotivo: 'retirado antes',
        bajaUsuarioId: '01900000-0000-7000-8000-000000000402',
      },
    });

    const result = await conTenant(() => useCase.execute({ equipoId }));

    expect(result.isOk()).toBe(true);
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(equipo.deletedAt).not.toBeNull();
  });
});
