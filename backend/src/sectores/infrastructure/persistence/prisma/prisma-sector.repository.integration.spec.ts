import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaSectorRepository } from './prisma-sector.repository';
import { SectorEntity } from '../../../domain/entities/sector.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaSectorRepository — Integration (WU-05)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaSectorRepository;

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-wu05',
    });
    repo = new PrismaSectorRepository(tenantContext);
  });

  afterAll(async () => {
    await tenantClient.sector.deleteMany({ where: { codigo: { startsWith: 'WU05_' } } });
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await tenantClient.sector.deleteMany({ where: { codigo: { startsWith: 'WU05_' } } });
  });

  it('save() + findById() hacen round-trip completo', async () => {
    const sector = SectorEntity.create({ codigo: 'WU05_A', nombre: 'Sector A', activo: true });

    await repo.save(sector);
    const found = await repo.findById(sector.id);

    expect(found).not.toBeNull();
    expect(found!.codigo).toBe('WU05_A');
    expect(found!.activo).toBe(true);
  });

  it('findById() retorna null para un id inexistente', async () => {
    const found = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(found).toBeNull();
  });

  it('findByCodigo() encuentra por codigo semántico', async () => {
    const sector = SectorEntity.create({ codigo: 'WU05_B', nombre: 'Sector B', activo: true });
    await repo.save(sector);

    const found = await repo.findByCodigo('WU05_B');

    expect(found).not.toBeNull();
    expect(found!.id).toBe(sector.id);
  });

  it('findAllActive() excluye soft-deleted', async () => {
    const activo = SectorEntity.create({ codigo: 'WU05_ACT', nombre: 'Activo', activo: true });
    const inactivo = SectorEntity.create({ codigo: 'WU05_INA', nombre: 'Inactivo', activo: true });
    inactivo.desactivar();
    await repo.save(activo);
    await repo.save(inactivo);

    const activos = await repo.findAllActive();

    expect(activos.some((s) => s.id === activo.id)).toBe(true);
    expect(activos.some((s) => s.id === inactivo.id)).toBe(false);
  });

  it('save() en un sector existente actualiza sin pisar createdAt', async () => {
    const sector = SectorEntity.create({ codigo: 'WU05_UPD', nombre: 'Original', activo: true });
    await repo.save(sector);

    sector.actualizar({ nombre: 'Editado' });
    await repo.save(sector);

    const found = await repo.findById(sector.id);
    expect(found!.nombre).toBe('Editado');
    expect(found!.createdAt).toEqual(sector.createdAt);
  });
});
