/**
 * [INTEGRATION] `PrismaModeloEquipoRepository` contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Fixtures prefijados `MOD_<hex>_` sobre la MARCA (mismo patrón que
 * `prisma-familia-insumo.repository.integration.spec.ts`): la DB de test es
 * COMPARTIDA, así que la limpieza va acotada por ese prefijo — nunca un
 * TRUNCATE global.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaModeloEquipoRepository } from './prisma-modelo-equipo.repository';
import { ModeloEquipoEntity } from '../../../domain/entities/modelo-equipo.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaModeloEquipoRepository — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaModeloEquipoRepository;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `MOD_${randomBytes(2).toString('hex')}_`;

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-modelos-equipo',
    });
    repo = new PrismaModeloEquipoRepository(tenantContext);
  });

  afterAll(async () => {
    await tenantClient.modeloEquipo.deleteMany({ where: { marca: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await tenantClient.modeloEquipo.deleteMany({ where: { marca: { startsWith: PREFIJO } } });
  });

  it('save() + findById() hacen round-trip completo', async () => {
    const modelo = ModeloEquipoEntity.create({
      marca: `${PREFIJO}HP`,
      modelo: 'LaserJet Pro M404',
      activo: true,
    });

    await repo.save(modelo);
    const found = await repo.findById(modelo.id);

    expect(found).not.toBeNull();
    expect(found!.marca).toBe(`${PREFIJO}HP`);
    expect(found!.modelo).toBe('LaserJet Pro M404');
    expect(found!.activo).toBe(true);
  });

  it('findById() retorna null para un id inexistente', async () => {
    const found = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(found).toBeNull();
  });

  it('findByMarcaModelo() encuentra por el par completo', async () => {
    const modelo = ModeloEquipoEntity.create({
      marca: `${PREFIJO}HP`,
      modelo: 'M404',
      activo: true,
    });
    await repo.save(modelo);

    const found = await repo.findByMarcaModelo(`${PREFIJO}HP`, 'M404');

    expect(found).not.toBeNull();
    expect(found!.id).toBe(modelo.id);
  });

  /**
   * La identidad es el PAR, no la marca sola: la misma marca con otro modelo
   * es otra fila. Si la búsqueda se hiciera solo por `marca`, el chequeo de
   * duplicado bloquearía la segunda impresora de la misma marca.
   */
  it('findByMarcaModelo() NO confunde dos modelos de la misma marca', async () => {
    const a = ModeloEquipoEntity.create({ marca: `${PREFIJO}HP`, modelo: 'M404', activo: true });
    const b = ModeloEquipoEntity.create({ marca: `${PREFIJO}HP`, modelo: 'M428', activo: true });
    await repo.save(a);
    await repo.save(b);

    const found = await repo.findByMarcaModelo(`${PREFIJO}HP`, 'M428');

    expect(found!.id).toBe(b.id);
  });

  // Un par dado de baja NO se reutiliza: `modelos_equipo` tiene UNIQUE
  // (marca, modelo) sin índice parcial por `deleted_at`, así que la búsqueda de
  // duplicado tiene que ver también las filas soft-deleted.
  it('findByMarcaModelo() también encuentra un modelo con baja lógica', async () => {
    const modelo = ModeloEquipoEntity.create({
      marca: `${PREFIJO}BAJA`,
      modelo: 'Con baja lógica',
      activo: true,
    });
    modelo.softDelete();
    await repo.save(modelo);

    const found = await repo.findByMarcaModelo(`${PREFIJO}BAJA`, 'Con baja lógica');

    expect(found).not.toBeNull();
    expect(found!.isDeleted()).toBe(true);
  });

  it('findAllActive() excluye soft-deleted', async () => {
    const activo = ModeloEquipoEntity.create({
      marca: `${PREFIJO}ACT`,
      modelo: 'Activo',
      activo: true,
    });
    const borrado = ModeloEquipoEntity.create({
      marca: `${PREFIJO}DEL`,
      modelo: 'Con baja lógica',
      activo: true,
    });
    borrado.softDelete();
    await repo.save(activo);
    await repo.save(borrado);

    const activos = await repo.findAllActive();

    expect(activos.some((m) => m.id === activo.id)).toBe(true);
    expect(activos.some((m) => m.id === borrado.id)).toBe(false);
  });

  /**
   * Deshabilitar NO es eliminar: el modelo con `activo=false` tiene que seguir
   * llegando al listado, que es la única pantalla desde la que el
   * administrador puede conseguir su id para reactivarlo. Si desapareciera, la
   * reactivación quedaría inalcanzable.
   */
  it('findAllActive() SÍ incluye un modelo deshabilitado', async () => {
    const deshabilitado = ModeloEquipoEntity.create({
      marca: `${PREFIJO}INA`,
      modelo: 'Deshabilitado',
      activo: true,
    });
    deshabilitado.desactivar();
    await repo.save(deshabilitado);

    const activos = await repo.findAllActive();

    const fila = activos.find((m) => m.id === deshabilitado.id);
    expect(fila).toBeDefined();
    expect(fila!.activo).toBe(false);
  });

  it('save() en un modelo existente actualiza sin pisar createdAt', async () => {
    const modelo = ModeloEquipoEntity.create({
      marca: `${PREFIJO}UPD`,
      modelo: 'Original',
      activo: true,
    });
    await repo.save(modelo);

    modelo.actualizar({ modelo: 'Editado' });
    await repo.save(modelo);

    const found = await repo.findById(modelo.id);
    expect(found!.modelo).toBe('Editado');
    expect(found!.createdAt).toEqual(modelo.createdAt);
  });
});
