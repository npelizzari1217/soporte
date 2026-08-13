/**
 * PR-12 [INTEGRATION] — RED→GREEN: `PrismaOperacionCompraRepository` contra
 * Postgres REAL (`soporte_tenant_test`).
 *
 * Cubre `crear()` (INSERT puro, `id`/`createdAt` generados por la DB) y
 * `listarPorCompra()` (orden `created_at ASC` — cronológico, S35/§4.10). La
 * garantía estructural de append-only (S37) vive en su propio spec unit
 * (`prisma-operacion-compra.repository.spec.ts`), no acá.
 *
 * HIGIENE DE DB (regla dura del orquestador): la DB de test es COMPARTIDA.
 * Fixtures propios (`PR12TEST_*`), un `CicloCliente` propio con
 * `activo: false`, y `afterAll` que borra EXACTAMENTE las filas creadas por
 * esta suite (nunca `deleteMany({})` sin filtro). `try/finally` para que un
 * assertion error a mitad de un test no deje residuo.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S35, S37). Ref design:
 * ADR-C4. Tarea: PR-12.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaOperacionCompraRepository } from './prisma-operacion-compra.repository';
import { PrismaCompraRepository } from './prisma-compra.repository';
import { CompraEntity } from '../../../domain/entities/compra.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr12';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

describe('PrismaOperacionCompraRepository — Integration (PR-12)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let operacionRepo: PrismaOperacionCompraRepository;
  let compraRepo: PrismaCompraRepository;
  let cicloId: string;
  const comprasIdsCreadas: string[] = [];

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `COM-2026-${RUN_PREFIX}${String(numeroCounter).padStart(2, '0')}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  async function crearCompraFixture(): Promise<string> {
    const compra = CompraEntity.create({
      numero: nextNumero(),
      fechaSolicitud: new Date('2026-03-01'),
      motivo: 'Compra de test PR-12',
      descripcion: null,
      solicitanteId: DUMMY_USUARIO_ID,
      cicloId,
    });
    comprasIdsCreadas.push(compra.id);
    await withTenant(() => compraRepo.guardar(compra));
    return compra.id;
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    operacionRepo = new PrismaOperacionCompraRepository(tenantContext);
    compraRepo = new PrismaCompraRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: `PR12TEST_CICLO_${suffix}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        // activo: false — higiene de DB (findActive() sin orderBy es
        // vulnerable a recoger un ciclo ajeno si hay más de uno activo=true).
        activo: false,
      },
    });
    cicloId = ciclo.id;
  }, 30_000);

  afterAll(async () => {
    if (comprasIdsCreadas.length > 0) {
      await tenantClient.operacionCompra.deleteMany({
        where: { compraId: { in: comprasIdsCreadas } },
      });
      await tenantClient.compra.deleteMany({ where: { id: { in: comprasIdsCreadas } } });
    }
    await tenantClient.cicloCliente.delete({ where: { id: cicloId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('crear()', () => {
    it('inserta una operación de cabecera (itemCompraId=null) con id/createdAt generados por la DB', async () => {
      const compraId = await crearCompraFixture();

      await withTenant(async () => {
        await operacionRepo.crear({
          compraId,
          itemCompraId: null,
          tipo: 'CREACION',
          usuarioId: DUMMY_USUARIO_ID,
          detalle: 'Compra creada',
          datos: null,
        });

        const operaciones = await operacionRepo.listarPorCompra(compraId);
        expect(operaciones).toHaveLength(1);
        expect(operaciones[0].id).toBeTruthy();
        expect(operaciones[0].createdAt).toBeInstanceOf(Date);
        expect(operaciones[0].itemCompraId).toBeNull();
        expect(operaciones[0].tipo).toBe('CREACION');
        expect(operaciones[0].detalle).toBe('Compra creada');
        expect(operaciones[0].datos).toBeNull();
      });
    });

    it('persiste `datos` como JSON no nulo cuando se provee', async () => {
      const compraId = await crearCompraFixture();

      await withTenant(async () => {
        await operacionRepo.crear({
          compraId,
          itemCompraId: null,
          tipo: 'CANCELACION',
          usuarioId: DUMMY_USUARIO_ID,
          detalle: 'Compra cancelada',
          datos: { motivo: 'duplicada' },
        });

        const [operacion] = await operacionRepo.listarPorCompra(compraId);
        expect(operacion.datos).toEqual({ motivo: 'duplicada' });
      });
    });
  });

  describe('listarPorCompra()', () => {
    it('retorna la bitácora ordenada por created_at ASC (cronológico, S35)', async () => {
      const compraId = await crearCompraFixture();

      await withTenant(async () => {
        // Intercalar el await fuerza timestamps distintos (mismo criterio
        // que el spec de paginación de PR-11 — construir todo en el mismo
        // tick síncrono da el mismo milisegundo y un orden indeterminado).
        await operacionRepo.crear({
          compraId,
          itemCompraId: null,
          tipo: 'CREACION',
          usuarioId: DUMMY_USUARIO_ID,
          detalle: 'Paso 1',
          datos: null,
        });
        await operacionRepo.crear({
          compraId,
          itemCompraId: null,
          tipo: 'ITEM_AGREGADO',
          usuarioId: DUMMY_USUARIO_ID,
          detalle: 'Paso 2',
          datos: null,
        });
        await operacionRepo.crear({
          compraId,
          itemCompraId: null,
          tipo: 'CANCELACION',
          usuarioId: DUMMY_USUARIO_ID,
          detalle: 'Paso 3',
          datos: null,
        });

        const operaciones = await operacionRepo.listarPorCompra(compraId);
        expect(operaciones.map((o) => o.detalle)).toEqual(['Paso 1', 'Paso 2', 'Paso 3']);
      });
    });

    it('retorna vacío para una compra sin operaciones registradas', async () => {
      const compraId = await crearCompraFixture();

      await withTenant(async () => {
        const operaciones = await operacionRepo.listarPorCompra(compraId);
        expect(operaciones).toEqual([]);
      });
    });
  });
});
