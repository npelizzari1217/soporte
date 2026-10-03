/**
 * [INTEGRATION] Reactivar un componente leído ANTES de que otro cambie su estado: el guardado
 * es un CAS (`updateMany ... WHERE deleted_at IS NOT NULL AND baja_destino <> STOCK_USADO`) y
 * no un upsert que pisa lo que comiteó otro entretanto.
 *
 * El caso de uso lee el componente fuera de la transacción; se simula la carrera
 * intercalando el cambio ajeno justo después de esa lectura (mismo wiring manual que
 * `retirar-reactivar-unidad.concurrencia.integration.spec.ts`).
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
import { PrismaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { construirOperacionesReal } from '../../../insumos/testing/operaciones-unidad-real';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';
import {
  ComponenteDevueltoAlStockError,
  ComponenteYaActivoError,
} from '../../domain/errors/equipos.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO_ID = '01900000-0000-7000-8000-000000000312';

describe('ReactivarComponente — lectura vieja contra un cambio ajeno (CAS)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let useCaseReal: ReactivarComponenteUseCase;
  let equipoRepo: PrismaEquipoInformaticoRepository;
  let insumoRepo: PrismaInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;

  const PREFIJO = `RSW_${randomBytes(4).toString('hex')}_`;
  let insumoId: string;
  let equipoId: string;
  let componenteId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 4,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia reactivar CAS', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera reactivar CAS', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}I`,
          nombre: 'Repuesto sin seguimiento',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'NINGUNO',
        },
      })
    ).id;
    equipoId = (
      await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}Equipo` } })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { insumoId } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.equipoInformatico.deleteMany({ where: { id: equipoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { insumoId } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    // Retiro legado: dado de baja, sin destino ni unidad.
    componenteId = (
      await tenantClient.componenteEquipo.create({
        data: { equipoId, insumoId, deletedAt: new Date('2026-09-01T10:00:00Z') },
      })
    ).id;
  });

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-rsw' },
      fn,
    );
  }

  /** Caso de uso cuyo `findById` dispara `cambioAjeno` justo después de leer el componente. */
  function makeReactivarConCambioAjeno(cambioAjeno: () => Promise<void>) {
    const repoConCarrera = Object.create(componenteRepo) as PrismaComponenteEquipoRepository;
    repoConCarrera.findById = async (id: string) => {
      const leido = await componenteRepo.findById(id);
      await cambioAjeno();
      return leido;
    };
    useCaseReal = new ReactivarComponenteUseCase(
      new PrismaTenantTransactionRunner(tenantContext, { error: () => {} }),
      equipoRepo,
      repoConCarrera,
      construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo }),
    );
    return useCaseReal;
  }

  it('si entretanto volvió al stock como USADO, no lo reactiva ni borra su destino', async () => {
    const movimiento = await tenantClient.movimientoInsumo.create({
      data: { insumoId, tipo: 'ENTRADA', condicion: 'USADO', cantidad: 1, usuarioId: USUARIO_ID },
    });
    const useCase = makeReactivarConCambioAjeno(async () => {
      await tenantClient.componenteEquipo.update({
        where: { id: componenteId },
        data: {
          deletedAt: new Date('2026-09-02T10:00:00Z'),
          bajaDestino: 'STOCK_USADO',
          bajaMovimientoId: movimiento.id,
          bajaUsuarioId: USUARIO_ID,
        },
      });
    });

    const resultado = await conTenant(() =>
      useCase.execute({ equipoId, componenteId, usuarioId: USUARIO_ID }),
    );

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(ComponenteDevueltoAlStockError);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila).toMatchObject({ bajaDestino: 'STOCK_USADO', bajaMovimientoId: movimiento.id });
    expect(fila.deletedAt).not.toBeNull();
  }, 30_000);

  it('si entretanto otro lo reactivó, devuelve ComponenteYaActivo y no vuelve a escribir la fila', async () => {
    const tocadoPorOtro = new Date('2026-09-03T10:00:00Z');
    const useCase = makeReactivarConCambioAjeno(async () => {
      await tenantClient.componenteEquipo.update({
        where: { id: componenteId },
        data: { deletedAt: null, updatedAt: tocadoPorOtro },
      });
    });

    const resultado = await conTenant(() =>
      useCase.execute({ equipoId, componenteId, usuarioId: USUARIO_ID }),
    );

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(ComponenteYaActivoError);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.updatedAt).toEqual(tocadoPorOtro);
  }, 30_000);
});
