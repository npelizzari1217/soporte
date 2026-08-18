/**
 * PR-11 [INTEGRATION] — RED→GREEN: `PrismaCompraRepository` contra Postgres
 * REAL (`soporte_tenant_test`). Comportamiento SECUENCIAL (sin concurrencia
 * — ver spec dedicado `prisma-compra.repository.concurrencia.integration.spec.ts`
 * para S3/ADR-C5/H7).
 *
 * Cubre las 6 operaciones de `ICompraRepository` (ADR-C2): `guardar`,
 * `guardarItem`, `findByIdConItems`, `findAllConItems`, `count` (PR-20,
 * total de paginación — excepción documentada a S32), `findLastSecuencia`
 * (formato/orden, LEFT-ANCHORED — ver JSDoc del repo), y el aislamiento
 * (repo sin `TenantContext` activo lanza, mismo criterio que
 * `PrismaTicketRepository`).
 *
 * HIGIENE DE DB (regla dura del orquestador): la DB de test es COMPARTIDA.
 * Fixtures propios (`PR11TEST_*`), un `CicloCliente` propio con
 * `activo: false` (nunca `true`: evitaría que `findActive()` de otra suite
 * devuelva un ciclo ajeno — el bug de flakiness real de esta semana), y
 * `afterAll` que borra EXACTAMENTE las filas creadas por esta suite (nunca
 * `deleteMany({})` sin filtro).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.1 (S1, S32-S34). Ref
 * design: ADR-C2, ADR-C5. Tarea: PR-11.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaCompraRepository } from './prisma-compra.repository';
import { CompraEntity } from '../../../domain/entities/compra.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr11';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
// año fuera de rango real: aísla del resto de las suites/reruns (mismo
// criterio que ANIO_TEST=2099 de tickets/PR-5, pero con un valor DISTINTO
// para no colisionar con el spec de concurrencia de este mismo PR, que usa
// 2099 — este spec usa 2098).
const ANIO_TEST = 2098;

describe('PrismaCompraRepository — Integration (PR-11, secuencial)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let compraRepo: PrismaCompraRepository;
  let cicloId: string;
  const comprasIdsCreadas: string[] = [];

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(anio = 2026): string {
    numeroCounter += 1;
    return `COM-${anio}-${RUN_PREFIX}${String(numeroCounter).padStart(2, '0')}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  function makeCompra(overrides: Partial<Parameters<typeof CompraEntity.create>[0]> = {}) {
    const compra = CompraEntity.create({
      numero: nextNumero(),
      fechaSolicitud: new Date('2026-03-01'),
      motivo: 'Compra de test PR-11',
      descripcion: null,
      solicitanteId: DUMMY_USUARIO_ID,
      cicloId,
      ...overrides,
    });
    comprasIdsCreadas.push(compra.id);
    return compra;
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    compraRepo = new PrismaCompraRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: `PR11TEST_CICLO_${suffix}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        // activo: false — higiene de DB: un ciclo activo=true de test puede
        // ser recogido por error por findActive() de otra suite (flakiness
        // real ya sufrido esta semana con ciclos_cliente).
        activo: false,
      },
    });
    cicloId = ciclo.id;
  }, 30_000);

  afterAll(async () => {
    // Borrado acotado EXACTAMENTE a las compras creadas por esta suite
    // (nunca DELETE FROM compras sin filtro — la DB es compartida).
    if (comprasIdsCreadas.length > 0) {
      await tenantClient.itemCompra.deleteMany({
        where: { compraId: { in: comprasIdsCreadas } },
      });
      await tenantClient.compra.deleteMany({ where: { id: { in: comprasIdsCreadas } } });
    }
    await tenantClient.compra.deleteMany({
      where: { numero: { startsWith: `COM-${ANIO_TEST}-` } },
    });
    await tenantClient.cicloCliente.delete({ where: { id: cicloId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('guardar() + findByIdConItems()', () => {
    it('persiste una compra nueva y la recupera por id con sus items (vacío, S1)', async () => {
      const compra = makeCompra();

      await withTenant(async () => {
        await compraRepo.guardar(compra);
        const found = await compraRepo.findByIdConItems(compra.id);

        expect(found).not.toBeNull();
        expect(found!.id).toBe(compra.id);
        expect(found!.numero).toBe(compra.numero);
        expect(found!.items).toHaveLength(0);
        expect(found!.estado).toBe('PENDIENTE');
        expect(found!.deletedAt).toBeNull();
      });
    });

    it('retorna null cuando el id no existe', async () => {
      await withTenant(async () => {
        const found = await compraRepo.findByIdConItems('01900000-0000-7000-8000-000000000099');
        expect(found).toBeNull();
      });
    });

    it('guardar() upsert — actualiza motivo/descripcion sin pisar createdAt', async () => {
      const compra = makeCompra();

      await withTenant(async () => {
        await compraRepo.guardar(compra);
        const originalCreatedAt = (await compraRepo.findByIdConItems(compra.id))!.createdAt;

        const reconstituted = CompraEntity.reconstitute(
          {
            numero: compra.numero,
            fechaSolicitud: compra.fechaSolicitud,
            motivo: 'Motivo editado',
            descripcion: 'Ahora con descripción',
            solicitanteId: compra.solicitanteId,
            cicloId: compra.cicloId,
            canceladaEn: null,
            canceladoPorId: null,
            motivoCancelacion: null,
          },
          [],
          compra.id,
          compra.createdAt,
          new Date(),
          null,
        );
        await compraRepo.guardar(reconstituted);

        const found = await compraRepo.findByIdConItems(compra.id);
        expect(found!.motivo).toBe('Motivo editado');
        expect(found!.descripcion).toBe('Ahora con descripción');
        expect(found!.createdAt.getTime()).toBe(originalCreatedAt.getTime());
      });
    });
  });

  describe('guardarItem()', () => {
    it('persiste un item y aparece en findByIdConItems', async () => {
      const compra = makeCompra();

      await withTenant(async () => {
        await compraRepo.guardar(compra);
        compra
          .agregarItem({
            descripcion: 'Notebook',
            cantidad: 2,
            proveedor: 'Proveedor SA',
            monto: 1500,
            moneda: 'ARS',
            fechaCotizacion: new Date('2026-03-01'),
            observaciones: null,
          })
          .getOrThrow();
        const [item] = compra.items;
        await compraRepo.guardarItem(item);

        const found = await compraRepo.findByIdConItems(compra.id);
        expect(found!.items).toHaveLength(1);
        expect(found!.items[0].descripcion).toBe('Notebook');
        expect(found!.items[0].cantidad).toBe(2);
        expect(found!.items[0].monto).toBe(1500);
      });
    });

    it('findByIdConItems incluye items soft-deleted (la entidad los exige cargados)', async () => {
      const compra = makeCompra();

      await withTenant(async () => {
        await compraRepo.guardar(compra);
        compra
          .agregarItem({
            descripcion: 'Item a eliminar',
            cantidad: 1,
            proveedor: 'Proveedor SA',
            monto: 100,
            moneda: 'ARS',
            fechaCotizacion: new Date('2026-03-01'),
            observaciones: null,
          })
          .getOrThrow();
        const [item] = compra.items;
        await compraRepo.guardarItem(item);
        compra.eliminarItem(item.id).getOrThrow();
        await compraRepo.guardarItem(item);

        const found = await compraRepo.findByIdConItems(compra.id);
        expect(found!.items).toHaveLength(1);
        expect(found!.items[0].isDeleted()).toBe(true);
      });
    });
  });

  describe('findPaginaConItems(filtros?)', () => {
    it('excluye compras soft-deleted (deletedAt no expuesto por CompraEntity: se verifica indirectamente por ausencia)', async () => {
      const visible = makeCompra();
      await withTenant(async () => {
        await compraRepo.guardar(visible);
        const { compras } = await compraRepo.findPaginaConItems();
        const ids = compras.map((c) => c.id);
        expect(ids).toContain(visible.id);
      });
    });

    it('limit acota el tamaño de la página al mínimo entre limit y el universo (S32)', async () => {
      const compra = makeCompra();

      await withTenant(async () => {
        await compraRepo.guardar(compra);

        const total = await tenantClient.compra.count({ where: { deletedAt: null } });
        const { compras } = await compraRepo.findPaginaConItems({ limit: 1, offset: 0 });

        expect(compras.length).toBe(Math.min(1, total));
        expect(compras[0].deletedAt).toBeNull();
      });
    });

    it('offset avanza a la página siguiente sin repetir ids entre páginas (S32)', async () => {
      const suffix = randomBytes(2).toString('hex');
      const cicloPaginacion = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_USUARIO_ID,
          nombre: `PR11TEST_PAG_${suffix}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      // try/finally (más defensivo que el precedente de
      // `prisma-tickets.integration.spec.ts`, que no lo usa): si la
      // aserción de abajo falla, el ciclo/compras de este fixture NO deben
      // quedar residuales en la DB compartida — la higiene de DB no puede
      // depender de que el test pase.
      try {
        await withTenant(async () => {
          // Crea Y persiste una por una (no todas de antemano con
          // Array.from): `BaseEntity.createdAt` es `new Date()` en memoria
          // al construir la entidad, no `now()` de la DB — construir las 3
          // en el mismo tick síncrono les daría el MISMO milisegundo, y con
          // `ORDER BY createdAt DESC` sin desempate esas ties tienen orden
          // indeterminado entre llamadas (causa real de un flaky detectado
          // al escribir este test: overlap entre página 1 y 2 sin ningún
          // bug de paginación de por medio). Intercalar el `await` fuerza
          // timestamps distintos, mismo patrón que
          // `prisma-tickets.integration.spec.ts` (creación + save dentro
          // del mismo loop, nunca por adelantado).
          for (let i = 0; i < 3; i += 1) {
            await compraRepo.guardar(makeCompra({ cicloId: cicloPaginacion.id }));
          }

          const pagina1 = await compraRepo.findPaginaConItems({ limit: 2, offset: 0 });
          const pagina2 = await compraRepo.findPaginaConItems({ limit: 2, offset: 2 });

          const ids1 = pagina1.compras.map((c) => c.id);
          const ids2 = pagina2.compras.map((c) => c.id);
          expect(ids1.some((id) => ids2.includes(id))).toBe(false);
        });
      } finally {
        await tenantClient.compra.deleteMany({ where: { cicloId: cicloPaginacion.id } });
        await tenantClient.cicloCliente.delete({ where: { id: cicloPaginacion.id } });
      }
    });
  });

  describe('total de paginación — PR-20 / WU-25 (sale de la misma consulta que la página)', () => {
    it('el total es el del filtro completo, NO el tamaño de la página (más filas que el limit pedido)', async () => {
      const suffix = randomBytes(2).toString('hex');
      const cicloCount = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_USUARIO_ID,
          nombre: `PR20TEST_COUNT_${suffix}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      try {
        await withTenant(async () => {
          // 5 compras propias, pero se pide una página de 2 -> total debe
          // ser 5 (el universo filtrado), no 2 (el tamaño de la página).
          for (let i = 0; i < 5; i += 1) {
            await compraRepo.guardar(makeCompra({ cicloId: cicloCount.id }));
          }

          const { compras, total } = await compraRepo.findPaginaConItems({ limit: 2, offset: 0 });

          expect(compras.length).toBe(2);
          expect(total).toBeGreaterThanOrEqual(5);
        });
      } finally {
        await tenantClient.compra.deleteMany({ where: { cicloId: cicloCount.id } });
        await tenantClient.cicloCliente.delete({ where: { id: cicloCount.id } });
      }
    });

    it('[borde que descartó COUNT(*) OVER()] página vacía (offset más allá del total) -> total sigue siendo correcto', async () => {
      const suffix = randomBytes(2).toString('hex');
      const cicloVacio = await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_USUARIO_ID,
          nombre: `PR20TEST_EMPTY_${suffix}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });

      try {
        await withTenant(async () => {
          const compra = makeCompra({ cicloId: cicloVacio.id });
          await compraRepo.guardar(compra);

          const { total: totalReal } = await compraRepo.findPaginaConItems({
            limit: 10,
            offset: 0,
          });
          // offset muy por encima del universo total del tenant -> página vacía.
          const paginaVacia = await compraRepo.findPaginaConItems({ limit: 10, offset: 100_000 });

          expect(paginaVacia.compras).toEqual([]);
          // WU-25: el total viaja en la MISMA sentencia que los ids, pero
          // agregado con `array_agg` — la consulta devuelve siempre una fila,
          // así que el total llega incluso con la página vacía. Es
          // exactamente el borde que había descartado `COUNT(*) OVER()`
          // (ver sdd/redisenio-modulo-compras/count-en-consulta).
          expect(paginaVacia.total).toBe(totalReal);
          expect(paginaVacia.total).toBeGreaterThan(0);
        });
      } finally {
        await tenantClient.compra.deleteMany({ where: { cicloId: cicloVacio.id } });
        await tenantClient.cicloCliente.delete({ where: { id: cicloVacio.id } });
      }
    });
  });

  describe('findLastSecuencia() — comportamiento secuencial (sin concurrencia, ver spec dedicado)', () => {
    it('retorna 0 cuando no hay compras para ese año', async () => {
      await withTenant(async () => {
        const last = await compraRepo.findLastSecuencia(2070);
        expect(last).toBe(0);
      });
    });

    it('retorna el mayor número de secuencia de ese año', async () => {
      const compras = [
        makeCompra({ numero: `COM-${ANIO_TEST}-00010` }),
        makeCompra({ numero: `COM-${ANIO_TEST}-00042` }),
        makeCompra({ numero: `COM-${ANIO_TEST}-00005` }),
      ];

      await withTenant(async () => {
        for (const c of compras) {
          await compraRepo.guardar(c);
        }
        const last = await compraRepo.findLastSecuencia(ANIO_TEST);
        expect(last).toBe(42);
      });
    });

    it('LEFT-ANCHORED (mejora vs tickets): un numero de OTRO año cuya secuencia contiene los dígitos del año buscado NO lo confunde', async () => {
      // "COM-2026-02073" contiene la substring "2073" en la secuencia. Un
      // LIKE '%2073%' (no anclado) matchearía por error. El left-anchor
      // 'COM-2073-%' lo descarta correctamente.
      const trampa = makeCompra({ numero: 'COM-2026-02073' });
      const real = makeCompra({ numero: 'COM-2073-00005' });

      await withTenant(async () => {
        await compraRepo.guardar(trampa);
        await compraRepo.guardar(real);

        const last = await compraRepo.findLastSecuencia(2073);
        expect(last).toBe(5);
      });
    });
  });

  describe('Aislamiento — repo sin TenantContext activo', () => {
    it('lanza un error descriptivo si no hay TenantContext activo', async () => {
      const looseContext = new TenantContext();
      const looseRepo = new PrismaCompraRepository(looseContext);
      await expect(
        looseRepo.findByIdConItems('01900000-0000-7000-8000-000000000099'),
      ).rejects.toThrow(/No hay TenantContext activo/);
    });
  });
});
