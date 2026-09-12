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

  /**
   * El createdAt REAL lo pone la base (issue #172), no `familia.createdAt` en
   * memoria: ese valor es el reloj del PROCESO al construir la entidad, y ya
   * no es el que queda en la fila desde que `FamiliaInsumoMapper.toPersistence()`
   * lo omite del CREATE. Por eso el baseline se relee con `findById()` recién
   * después del primer `save()`, en vez de compararse contra la entidad.
   */
  it('save() en una familia existente actualiza sin pisar createdAt', async () => {
    const familia = FamiliaInsumoEntity.create({
      codigo: `${PREFIJO}UPD`,
      nombre: 'Original',
      activo: true,
    });
    await repo.save(familia);
    const creada = await repo.findById(familia.id);

    familia.actualizar({ nombre: 'Editada' });
    await repo.save(familia);

    const found = await repo.findById(familia.id);
    expect(found!.nombre).toBe('Editada');
    expect(found!.createdAt).toEqual(creada!.createdAt);
  });

  /**
   * Issue #172 — gemelo del que ya existe para `insumos`
   * (`prisma-insumo.repository.integration.spec.ts`, describe "save() —
   * issue #172..."), aplicado a `familias_insumo`. Mismo mecanismo: reloj del
   * PROCESO desviado con `vi.useFakeTimers` ANTES de construir la entidad, y
   * lectura de la fila CRUDA con el reloj real restaurado.
   */
  describe('save() — issue #172: la fecha de alta la pone la base, no el proceso', () => {
    /** Mismo desvío EXACTO reportado en el issue: +3 horas. */
    const DESVIO_MS = 3 * 60 * 60 * 1000;

    it('crea una familia con el reloj del proceso desviado 3 horas: created_at en la base NO hereda el desvío', async () => {
      const antesDeLaEscritura = new Date();
      let familia: FamiliaInsumoEntity;

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date(antesDeLaEscritura.getTime() + DESVIO_MS));
        familia = FamiliaInsumoEntity.create({
          codigo: `${PREFIJO}DESVIO`,
          nombre: 'Desviada',
          activo: true,
        });
        expect(familia.createdAt.getTime()).toBe(antesDeLaEscritura.getTime() + DESVIO_MS);

        await repo.save(familia);
      } finally {
        vi.useRealTimers();
      }

      const fila = await tenantClient.familiaInsumo.findUniqueOrThrow({
        where: { id: familia.id },
      });

      expect(fila.createdAt.getTime()).toBeLessThan(
        antesDeLaEscritura.getTime() + DESVIO_MS - 60_000,
      );
    });

    it('created_at cae en la ventana del reloj real, entre el antes y el después de la escritura', async () => {
      const antesDeLaEscritura = new Date();
      let familia: FamiliaInsumoEntity;

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date(antesDeLaEscritura.getTime() + DESVIO_MS));
        familia = FamiliaInsumoEntity.create({
          codigo: `${PREFIJO}VENT`,
          nombre: 'Ventana',
          activo: true,
        });
        await repo.save(familia);
      } finally {
        vi.useRealTimers();
      }
      const despuesDeLaEscritura = new Date();

      const fila = await tenantClient.familiaInsumo.findUniqueOrThrow({
        where: { id: familia.id },
      });

      const MARGEN_RED_MS = 5000;
      expect(fila.createdAt.getTime()).toBeGreaterThanOrEqual(
        antesDeLaEscritura.getTime() - MARGEN_RED_MS,
      );
      expect(fila.createdAt.getTime()).toBeLessThanOrEqual(
        despuesDeLaEscritura.getTime() + MARGEN_RED_MS,
      );
    });

    it('created_at tiene resolución sub-milisegundo: la puso la base, no un Date de JS', async (ctx) => {
      const muestras: bigint[] = [];
      for (let i = 0; i < 10; i += 1) {
        const [{ resto }] = await tenantClient.$queryRaw<{ resto: bigint }[]>`
          SELECT (EXTRACT(MICROSECONDS FROM clock_timestamp())::bigint % 1000) AS resto
        `;
        muestras.push(resto);
      }
      const resolucionSubMilisegundoLocal = muestras.some((resto) => resto !== 0n);

      ctx.skip(
        !resolucionSubMilisegundoLocal,
        'clock_timestamp() de esta instancia local de Postgres resuelve solo en ' +
          'milisegundos (10/10 muestras con resto 0): el criterio de microsegundos ' +
          'no aplica en este entorno, así que no se puede afirmar nada con él acá.',
      );

      // La afirmación NO se hace sobre una sola fila: un `clock_timestamp()`
      // sano cae en resto 0 una vez cada mil, y eso sería un rojo espurio en
      // CI indistinguible de una regresión real. Si la fecha la pusiera el
      // proceso, los CANTIDAD_MUESTRAS restos darían 0.
      const CANTIDAD_MUESTRAS = 5;
      const restos: bigint[] = [];
      for (let i = 0; i < CANTIDAD_MUESTRAS; i += 1) {
        const familia = FamiliaInsumoEntity.create({
          codigo: `${PREFIJO}MICR${i}`,
          nombre: `Microsegundos ${i}`,
          activo: true,
        });
        await repo.save(familia);

        const [{ resto }] = await tenantClient.$queryRaw<{ resto: bigint }[]>`
          SELECT (EXTRACT(MICROSECONDS FROM created_at)::bigint % 1000) AS resto
          FROM familias_insumo WHERE id = ${familia.id}::uuid
        `;
        restos.push(resto);
      }

      expect(restos).toHaveLength(CANTIDAD_MUESTRAS);
      expect(restos.some((resto) => resto !== 0n)).toBe(true);
    });
  });
});
