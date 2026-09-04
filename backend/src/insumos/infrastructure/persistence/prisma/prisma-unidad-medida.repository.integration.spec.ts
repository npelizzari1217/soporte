/**
 * [INTEGRATION] `PrismaUnidadMedidaRepository` contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Fixtures prefijados `UM_<hex>_` (mismo patrón que
 * `catalogo-insumos-constraints.integration.spec.ts`): la DB de test es
 * COMPARTIDA, así que la limpieza va acotada por ese prefijo — nunca un
 * TRUNCATE global. El prefijo es corto a propósito: `unidades_medida.codigo`
 * es `VarChar(20)` y el sufijo del fixture tiene que entrar.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaUnidadMedidaRepository } from './prisma-unidad-medida.repository';
import { UnidadMedidaEntity } from '../../../domain/entities/unidad-medida.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaUnidadMedidaRepository — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaUnidadMedidaRepository;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `UM_${randomBytes(2).toString('hex')}_`;

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-unidades-medida',
    });
    repo = new PrismaUnidadMedidaRepository(tenantContext);
  });

  afterAll(async () => {
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
  });

  it('save() + findById() hacen round-trip completo', async () => {
    const unidad = UnidadMedidaEntity.create({
      codigo: `${PREFIJO}A`,
      nombre: 'Unidad A',
      activo: true,
    });

    await repo.save(unidad);
    const found = await repo.findById(unidad.id);

    expect(found).not.toBeNull();
    expect(found!.codigo).toBe(`${PREFIJO}A`);
    expect(found!.activo).toBe(true);
  });

  it('findById() retorna null para un id inexistente', async () => {
    const found = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(found).toBeNull();
  });

  it('findByCodigo() encuentra por codigo semántico', async () => {
    const unidad = UnidadMedidaEntity.create({
      codigo: `${PREFIJO}B`,
      nombre: 'Unidad B',
      activo: true,
    });
    await repo.save(unidad);

    const found = await repo.findByCodigo(`${PREFIJO}B`);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(unidad.id);
  });

  // Un código dado de baja NO se reutiliza: `unidades_medida.codigo` es UNIQUE
  // sin índice parcial por `deleted_at`, así que la búsqueda de duplicado tiene
  // que ver también las filas soft-deleted.
  it('findByCodigo() también encuentra una unidad con baja lógica', async () => {
    const unidad = UnidadMedidaEntity.create({
      codigo: `${PREFIJO}BAJA`,
      nombre: 'Con baja lógica',
      activo: true,
    });
    unidad.softDelete();
    await repo.save(unidad);

    const found = await repo.findByCodigo(`${PREFIJO}BAJA`);

    expect(found).not.toBeNull();
    expect(found!.isDeleted()).toBe(true);
  });

  it('findAllActive() excluye soft-deleted', async () => {
    const activa = UnidadMedidaEntity.create({
      codigo: `${PREFIJO}ACT`,
      nombre: 'Activa',
      activo: true,
    });
    const borrada = UnidadMedidaEntity.create({
      codigo: `${PREFIJO}DEL`,
      nombre: 'Con baja lógica',
      activo: true,
    });
    borrada.softDelete();
    await repo.save(activa);
    await repo.save(borrada);

    const activas = await repo.findAllActive();

    expect(activas.some((u) => u.id === activa.id)).toBe(true);
    expect(activas.some((u) => u.id === borrada.id)).toBe(false);
  });

  /**
   * Deshabilitar NO es eliminar: la unidad con `activo=false` tiene que seguir
   * llegando al listado, que es la única pantalla desde la que el
   * administrador puede conseguir su id para reactivarla. Si desapareciera, la
   * reactivación quedaría inalcanzable.
   */
  it('findAllActive() SÍ incluye una unidad deshabilitada', async () => {
    const deshabilitada = UnidadMedidaEntity.create({
      codigo: `${PREFIJO}INA`,
      nombre: 'Deshabilitada',
      activo: true,
    });
    deshabilitada.desactivar();
    await repo.save(deshabilitada);

    const activas = await repo.findAllActive();

    const fila = activas.find((u) => u.id === deshabilitada.id);
    expect(fila).toBeDefined();
    expect(fila!.activo).toBe(false);
  });

  it('save() en una unidad existente actualiza sin pisar createdAt', async () => {
    const unidad = UnidadMedidaEntity.create({
      codigo: `${PREFIJO}UPD`,
      nombre: 'Original',
      activo: true,
    });
    await repo.save(unidad);

    unidad.actualizar({ nombre: 'Editada' });
    await repo.save(unidad);

    const found = await repo.findById(unidad.id);
    expect(found!.nombre).toBe('Editada');
    expect(found!.createdAt).toEqual(unidad.createdAt);
  });
});
