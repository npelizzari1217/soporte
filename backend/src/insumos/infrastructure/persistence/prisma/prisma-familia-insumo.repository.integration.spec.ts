/**
 * [INTEGRATION] `PrismaFamiliaInsumoRepository` contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Fixtures prefijados `FAM_<hex>_` (mismo patrón que
 * `catalogo-insumos-constraints.integration.spec.ts`): la DB de test es
 * COMPARTIDA, así que la limpieza va acotada por ese prefijo — nunca un
 * TRUNCATE global.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaFamiliaInsumoRepository } from './prisma-familia-insumo.repository';
import { FamiliaInsumoEntity } from '../../../domain/entities/familia-insumo.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaFamiliaInsumoRepository — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaFamiliaInsumoRepository;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `FAM_${randomBytes(2).toString('hex')}_`;

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-familias-insumo',
    });
    repo = new PrismaFamiliaInsumoRepository(tenantContext);
  });

  afterAll(async () => {
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
  });

  it('save() + findById() hacen round-trip completo', async () => {
    const familia = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}A`,
      nombre: 'Familia A',
      activo: true,
    });

    await repo.save(familia);
    const found = await repo.findById(familia.id);

    expect(found).not.toBeNull();
    expect(found!.codigo).toBe(`${PREFIJO}A`);
    expect(found!.activo).toBe(true);
  });

  it('findById() retorna null para un id inexistente', async () => {
    const found = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(found).toBeNull();
  });

  it('findByCodigo() encuentra por codigo semántico', async () => {
    const familia = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}B`,
      nombre: 'Familia B',
      activo: true,
    });
    await repo.save(familia);

    const found = await repo.findByCodigo(`${PREFIJO}B`);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(familia.id);
  });

  // Un código dado de baja NO se reutiliza: `familias_insumo.codigo` es UNIQUE
  // sin índice parcial por `deleted_at`, así que la búsqueda de duplicado tiene
  // que ver también las filas soft-deleted.
  it('findByCodigo() también encuentra una familia con baja lógica', async () => {
    const familia = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}BAJA`,
      nombre: 'Con baja lógica',
      activo: true,
    });
    familia.softDelete();
    await repo.save(familia);

    const found = await repo.findByCodigo(`${PREFIJO}BAJA`);

    expect(found).not.toBeNull();
    expect(found!.isDeleted()).toBe(true);
  });

  it('findAllActive() excluye soft-deleted', async () => {
    const activa = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}ACT`,
      nombre: 'Activa',
      activo: true,
    });
    const borrada = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}DEL`,
      nombre: 'Con baja lógica',
      activo: true,
    });
    borrada.softDelete();
    await repo.save(activa);
    await repo.save(borrada);

    const activas = await repo.findAllActive();

    expect(activas.some((f) => f.id === activa.id)).toBe(true);
    expect(activas.some((f) => f.id === borrada.id)).toBe(false);
  });

  /**
   * Deshabilitar NO es eliminar: la familia con `activo=false` tiene que seguir
   * llegando al listado, que es la única pantalla desde la que el
   * administrador puede conseguir su id para reactivarla. Si desapareciera, la
   * reactivación quedaría inalcanzable.
   */
  it('findAllActive() SÍ incluye una familia deshabilitada', async () => {
    const deshabilitada = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}INA`,
      nombre: 'Deshabilitada',
      activo: true,
    });
    deshabilitada.desactivar();
    await repo.save(deshabilitada);

    const activas = await repo.findAllActive();

    const fila = activas.find((f) => f.id === deshabilitada.id);
    expect(fila).toBeDefined();
    expect(fila!.activo).toBe(false);
  });

  it('save() en una familia existente actualiza sin pisar createdAt', async () => {
    const familia = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}UPD`,
      nombre: 'Original',
      activo: true,
    });
    await repo.save(familia);

    familia.actualizar({ nombre: 'Editada' });
    await repo.save(familia);

    const found = await repo.findById(familia.id);
    expect(found!.nombre).toBe('Editada');
    expect(found!.createdAt).toEqual(familia.createdAt);
  });
});
