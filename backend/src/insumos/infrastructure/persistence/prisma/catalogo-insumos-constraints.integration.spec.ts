/**
 * [INTEGRATION] Constraints del catálogo de insumos contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * La migración `20260904140000_catalogo_insumos` toma cuatro decisiones que
 * NINGÚN test de unidad puede sostener, porque viven en la base y no en el
 * código: `NULLS NOT DISTINCT`, el `CHECK` de stock mínimo, el `UNIQUE`
 * compuesto de modelo y el `ON DELETE RESTRICT` de los catálogos. Este spec
 * existe para que revertirlas ponga algo en rojo.
 *
 * Fixtures propios prefijados `INS_TEST_*` (mismo patrón que
 * `prisma-equipos.integration.spec.ts`): la DB de test es COMPARTIDA, así que
 * el cleanup del `afterAll` va acotado por prefijo — nunca un TRUNCATE global.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('Catálogo de insumos — constraints de la migración', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `INS_TEST_${randomBytes(2).toString('hex')}`;

  let familiaId: string;
  let unidadId: string;
  let insumoId: string;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}_TONER`, nombre: 'Tóner de test' },
    });
    familiaId = familia.id;

    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}_UN`, nombre: 'Unidad de test' },
    });
    unidadId = unidad.id;

    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}_INS`,
        nombre: 'Insumo de test',
        familiaId,
        unidadMedidaId: unidadId,
      },
    });
    insumoId = insumo.id;
  });

  afterAll(async () => {
    await tenantClient.insumoModeloEquipo.deleteMany({ where: { insumoId } });
    await tenantClient.insumoCodigoAlternativo.deleteMany({ where: { insumoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.modeloEquipo.deleteMany({ where: { marca: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  describe('códigos alternativos — NULLS NOT DISTINCT', () => {
    // Protege la cláusula que evita el duplicado del genérico sin marca. Sin
    // ella Postgres considera cada NULL distinto de cualquier otro y las dos
    // filas entran.
    it('rechaza el mismo código repetido con fabricante NULL', async () => {
      await tenantClient.insumoCodigoAlternativo.create({
        data: { insumoId, codigo: `${PREFIJO}_CF226X`, fabricante: null },
      });

      await expect(
        tenantClient.insumoCodigoAlternativo.create({
          data: { insumoId, codigo: `${PREFIJO}_CF226X`, fabricante: null },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    // Hermano invertido: sin este caso, un UNIQUE sobre `codigo` solo pasaría
    // igual y el test de arriba no probaría nada sobre la columna `fabricante`.
    it('acepta el mismo código con fabricantes distintos', async () => {
      await tenantClient.insumoCodigoAlternativo.create({
        data: { insumoId, codigo: `${PREFIJO}_26X`, fabricante: 'HP' },
      });

      const generico = await tenantClient.insumoCodigoAlternativo.create({
        data: { insumoId, codigo: `${PREFIJO}_26X`, fabricante: 'Genérico' },
      });

      expect(generico.fabricante).toBe('Genérico');
    });
  });

  describe('stock mínimo — CHECK >= 0', () => {
    // Se asserta el NOMBRE del constraint, no un `toThrow()` pelado: con
    // `toThrow()` un fixture roto —una familia inexistente, por ejemplo— haría
    // pasar el test por el motivo equivocado.
    it('rechaza un stock mínimo negativo', async () => {
      await expect(
        tenantClient.insumo.create({
          data: {
            codigo: `${PREFIJO}_NEG`,
            nombre: 'Insumo con stock negativo',
            familiaId,
            unidadMedidaId: unidadId,
            stockMinimo: -1,
          },
        }),
      ).rejects.toThrow(/insumos_stock_minimo_check/);
    });

    it('acepta cero — el borde permitido, no un valor cualquiera', async () => {
      const creado = await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}_CERO`,
          nombre: 'Insumo con stock mínimo cero',
          familiaId,
          unidadMedidaId: unidadId,
          stockMinimo: 0,
        },
      });

      expect(Number(creado.stockMinimo)).toBe(0);
    });
  });

  describe('modelo de equipo — UNIQUE (marca, modelo)', () => {
    it('rechaza el mismo par marca+modelo dos veces', async () => {
      await tenantClient.modeloEquipo.create({
        data: { marca: `${PREFIJO}_HP`, modelo: 'LaserJet Pro M404' },
      });

      await expect(
        tenantClient.modeloEquipo.create({
          data: { marca: `${PREFIJO}_HP`, modelo: 'LaserJet Pro M404' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('acepta el mismo modelo bajo otra marca', async () => {
      const otro = await tenantClient.modeloEquipo.create({
        data: { marca: `${PREFIJO}_BROTHER`, modelo: 'LaserJet Pro M404' },
      });

      expect(otro.marca).toBe(`${PREFIJO}_BROTHER`);
    });
  });

  describe('catálogos — ON DELETE RESTRICT', () => {
    // Borrar una familia en uso no debe vaciar en silencio la clasificación de
    // los insumos que la referencian. El camino correcto es desactivarla.
    it('no deja borrar una familia que tiene insumos', async () => {
      await expect(
        tenantClient.familiaInsumo.delete({ where: { id: familiaId } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('sí deja desactivarla', async () => {
      const desactivada = await tenantClient.familiaInsumo.update({
        where: { id: familiaId },
        data: { activo: false },
      });

      expect(desactivada.activo).toBe(false);

      await tenantClient.familiaInsumo.update({ where: { id: familiaId }, data: { activo: true } });
    });
  });
});
