/**
 * WU-25 [INTEGRATION] — RED→GREEN: el ORDEN del listado de compras
 * (sdd/compras-orden-filtro-estado), contra Postgres real.
 *
 * `ORDER BY grupo ASC, fecha_solicitud DESC, created_at DESC`, donde `grupo`
 * es el ordinal derivado de `derivarGrupoEstadoCompra` (`ACTIVAS`=0,
 * `COMPLETADAS`=1, `CANCELADAS`=2). Antes de WU-25 el repositorio ordenaba
 * por `created_at DESC` y NINGÚN test cubría el orden — este spec cierra ese
 * hueco.
 *
 * Los dos riesgos que ejercita:
 *
 * 1. **Orden por grupo con fechas CRUZADAS**: los fixtures están sembrados a
 *    propósito de forma que ordenar sólo por fecha daría una secuencia
 *    DISTINTA a la esperada — si el `grupo` no fuera la primera clave, el
 *    test fallaría en vez de pasar por casualidad.
 * 2. **Orden A TRAVÉS DE LAS PÁGINAS**: la paginación es server-side, así
 *    que un `ORDER BY` aplicado después de traer la página daría un orden
 *    correcto dentro de la página y roto entre páginas. Se pide página por
 *    página con `porPagina` chico y se compara la concatenación contra el
 *    orden global.
 *
 * HIGIENE DE DB: ciclo propio por corrida, `afterAll` que limpia filas ANTES
 * de cerrar el cliente (con el pool vivo Postgres rechaza los DELETE en
 * cascada de forma silenciosa). No se crea ni se borra ninguna base.
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaCompraRepository } from './prisma-compra.repository';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('WU-25 — orden del listado: grupo ASC, fechaSolicitud DESC, createdAt DESC', () => {
  let client: Client;
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaCompraRepository;
  let cicloId: string;

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroSeq = 0;

  /** Etiqueta -> id, para poder afirmar el orden por NOMBRE y no por uuid. */
  const idPorEtiqueta = new Map<string, string>();
  const etiquetaPorId = new Map<string, string>();

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-wu25-orden',
    });
    repo = new PrismaCompraRepository(tenantContext);

    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();

    const ciclo = await client.query(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-25 ciclo orden', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    cicloId = ciclo.rows[0].id as string;

    await sembrarFixtures();
  }, 30_000);

  afterAll(async () => {
    // Orden OBLIGATORIO: borrar filas -> cerrar clientes. Al revés el pool
    // sigue vivo y Postgres rechaza el borrado en silencio.
    await client.query(
      'DELETE FROM items_compra WHERE compra_id IN (SELECT id FROM compras WHERE ciclo_id = $1)',
      [cicloId],
    );
    await client.query('DELETE FROM compras WHERE ciclo_id = $1', [cicloId]);
    await client.query('DELETE FROM ciclos_cliente WHERE id = $1', [cicloId]);
    await client.end();
    await prismaService.onModuleDestroy();
  }, 30_000);

  function siguienteNumero(): string {
    numeroSeq += 1;
    return `COM-2026-${RUN_PREFIX}${String(numeroSeq).padStart(3, '0')}`;
  }

  /**
   * Inserta una compra con `fecha_solicitud` y `created_at` EXPLÍCITOS — el
   * orden se decide con esos dos valores, así que dejarlos al `now()` de la
   * DB haría el test dependiente del reloj.
   */
  async function insertCompra(opciones: {
    etiqueta: string;
    fechaSolicitud: string;
    createdAt: string;
    cancelada?: boolean;
  }): Promise<string> {
    const cancelada = opciones.cancelada ?? false;
    const resultado = await client.query(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, cancelada_en, cancelado_por_id, motivo_cancelacion, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Motivo WU-25', gen_random_uuid(), $3, $4, $5, $6, $7, now())
       RETURNING id`,
      [
        siguienteNumero(),
        opciones.fechaSolicitud,
        cicloId,
        cancelada ? new Date() : null,
        cancelada ? '00000000-0000-4000-8000-000000000ccc' : null,
        cancelada ? 'Cancelada para fixture WU-25' : null,
        opciones.createdAt,
      ],
    );
    const id = resultado.rows[0].id as string;
    idPorEtiqueta.set(opciones.etiqueta, id);
    etiquetaPorId.set(id, opciones.etiqueta);
    return id;
  }

  async function insertItem(
    compraId: string,
    opciones: {
      estadoAprobacion: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
      cantidad?: number;
      cantidadEntregada?: number;
    },
  ): Promise<void> {
    const cantidad = opciones.cantidad ?? 10;
    const cantidadEntregada = opciones.cantidadEntregada ?? 0;
    const decidido = opciones.estadoAprobacion !== 'PENDIENTE';

    await client.query(
      `INSERT INTO items_compra (
         id, compra_id, descripcion, cantidad, proveedor, monto, moneda, fecha_cotizacion,
         estado_aprobacion, decidido_por_id, decidido_en,
         cantidad_ordenada, cantidad_recibida, cantidad_entregada, updated_at
       )
       VALUES (
         gen_random_uuid(), $1, 'Item WU-25', $2, 'Proveedor', 100, 'ARS', '2026-01-01',
         $3, $4, $5,
         $2, $2, $6, now()
       )`,
      [
        compraId,
        cantidad,
        opciones.estadoAprobacion,
        decidido ? '00000000-0000-4000-8000-000000000ddd' : null,
        decidido ? new Date() : null,
        cantidadEntregada,
      ],
    );
  }

  /**
   * Seis compras con las fechas DELIBERADAMENTE cruzadas entre grupos: la
   * más nueva del universo (`2026-06-01`) es una CANCELADA y la más vieja
   * (`2026-01-01`) es una ACTIVA. Si el `grupo` no fuera la primera clave
   * del `ORDER BY`, ese par sería suficiente para invertir la secuencia
   * esperada — el test no puede pasar por casualidad.
   */
  async function sembrarFixtures(): Promise<void> {
    // ── ACTIVAS (grupo 0) ──
    const activaNueva = await insertCompra({
      etiqueta: 'activa-05-01',
      fechaSolicitud: '2026-05-01',
      createdAt: '2026-05-01T10:00:00Z',
    });
    await insertItem(activaNueva, { estadoAprobacion: 'PENDIENTE' });

    // Mismo `fecha_solicitud` que la de abajo -> desempata `created_at DESC`.
    const activaEmpateNueva = await insertCompra({
      etiqueta: 'activa-03-01-creada-tarde',
      fechaSolicitud: '2026-03-01',
      createdAt: '2026-03-01T18:00:00Z',
    });
    await insertItem(activaEmpateNueva, { estadoAprobacion: 'PENDIENTE' });

    const activaEmpateVieja = await insertCompra({
      etiqueta: 'activa-03-01-creada-temprano',
      fechaSolicitud: '2026-03-01',
      createdAt: '2026-03-01T08:00:00Z',
    });
    // APROBADO sin entregar: activa por el 3er término, no por tener pendientes.
    await insertItem(activaEmpateVieja, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadEntregada: 4,
    });

    // Sin ítems: activa por `n = 0`.
    await insertCompra({
      etiqueta: 'activa-01-01',
      fechaSolicitud: '2026-01-01',
      createdAt: '2026-01-01T10:00:00Z',
    });

    // ── COMPLETADAS (grupo 1) ──
    const completadaNueva = await insertCompra({
      etiqueta: 'completada-04-01',
      fechaSolicitud: '2026-04-01',
      createdAt: '2026-04-01T10:00:00Z',
    });
    await insertItem(completadaNueva, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadEntregada: 10,
    });

    const completadaVieja = await insertCompra({
      etiqueta: 'completada-02-01',
      fechaSolicitud: '2026-02-01',
      createdAt: '2026-02-01T10:00:00Z',
    });
    await insertItem(completadaVieja, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadEntregada: 10,
    });

    // ── CANCELADAS (grupo 2) ──
    // La MÁS NUEVA de todo el universo, a propósito: va última igual.
    const canceladaNueva = await insertCompra({
      etiqueta: 'cancelada-06-01',
      fechaSolicitud: '2026-06-01',
      createdAt: '2026-06-01T10:00:00Z',
      cancelada: true,
    });
    await insertItem(canceladaNueva, { estadoAprobacion: 'PENDIENTE' });

    // Todos los ítems RECHAZADOS (T5): cae en CANCELADAS sin estar cancelada.
    const rechazada = await insertCompra({
      etiqueta: 'rechazada-05-15',
      fechaSolicitud: '2026-05-15',
      createdAt: '2026-05-15T10:00:00Z',
    });
    await insertItem(rechazada, { estadoAprobacion: 'RECHAZADO' });
  }

  /**
   * Secuencia global esperada. Nótese el cruce: `cancelada-06-01` es la
   * fecha más ALTA del universo y va última; `activa-01-01` es la más BAJA y
   * va cuarta.
   */
  const ORDEN_ESPERADO: readonly string[] = [
    // grupo 0 — ACTIVAS, por fechaSolicitud DESC y createdAt DESC de desempate
    'activa-05-01',
    'activa-03-01-creada-tarde',
    'activa-03-01-creada-temprano',
    'activa-01-01',
    // grupo 1 — COMPLETADAS
    'completada-04-01',
    'completada-02-01',
    // grupo 2 — CANCELADAS
    'cancelada-06-01',
    'rechazada-05-15',
  ];

  function aEtiquetas(ids: readonly string[]): string[] {
    return ids.map((id) => etiquetaPorId.get(id) ?? `desconocido:${id}`);
  }

  it('[CRITICAL] devuelve el universo completo en el orden exacto: grupo ASC, fechaSolicitud DESC, createdAt DESC', async () => {
    const { compras, total } = await repo.findPaginaConItems({ grupoEstado: 'TODAS', cicloId });

    expect(aEtiquetas(compras.map((c) => c.id))).toEqual(ORDEN_ESPERADO);
    expect(total).toBe(ORDEN_ESPERADO.length);
  });

  it('[CRITICAL] el orden es correcto A TRAVÉS de las páginas, no sólo dentro de cada una', async () => {
    const POR_PAGINA = 3;
    const concatenado: string[] = [];
    const totales: number[] = [];

    for (let pagina = 0; pagina * POR_PAGINA < ORDEN_ESPERADO.length; pagina += 1) {
      const { compras, total } = await repo.findPaginaConItems({
        grupoEstado: 'TODAS',
        cicloId,
        limit: POR_PAGINA,
        offset: pagina * POR_PAGINA,
      });
      concatenado.push(...compras.map((c) => c.id));
      totales.push(total);
    }

    expect(aEtiquetas(concatenado)).toEqual(ORDEN_ESPERADO);
    // Sanity de que realmente hubo más de una página y que el corte cayó
    // DENTRO del grupo ACTIVAS (con 3 por página, la página 1 termina en
    // 'activa-03-01-creada-temprano') — si el orden se resolviera en memoria
    // por página, ese corte sería justo donde se rompería.
    expect(totales.length).toBeGreaterThan(2);
    // El total no cambia página a página: mide el universo, no la página.
    expect(new Set(totales)).toEqual(new Set([ORDEN_ESPERADO.length]));
  });

  it('el filtro por grupo respeta el mismo orden interno (fechaSolicitud DESC, createdAt DESC)', async () => {
    const { compras } = await repo.findPaginaConItems({ grupoEstado: 'ACTIVAS', cicloId });

    expect(aEtiquetas(compras.map((c) => c.id))).toEqual([
      'activa-05-01',
      'activa-03-01-creada-tarde',
      'activa-03-01-creada-temprano',
      'activa-01-01',
    ]);
  });

  it('CANCELADAS incluye tanto la cancelada explícita como la de ítems todos rechazados (WU-25)', async () => {
    const { compras, total } = await repo.findPaginaConItems({
      grupoEstado: 'CANCELADAS',
      cicloId,
    });

    expect(aEtiquetas(compras.map((c) => c.id))).toEqual(['cancelada-06-01', 'rechazada-05-15']);
    expect(total).toBe(2);
  });

  it('los filtros de cabecera se combinan con el orden sin romperlo (rango de fechaSolicitud)', async () => {
    const { compras, total } = await repo.findPaginaConItems({
      grupoEstado: 'TODAS',
      cicloId,
      fechaDesde: new Date('2026-03-01'),
      fechaHasta: new Date('2026-05-14'),
    });

    // Quedan fuera: activa-01-01, completada-02-01 (antes), cancelada-06-01 y
    // rechazada-05-15 (después). El orden de las que quedan no cambia.
    expect(aEtiquetas(compras.map((c) => c.id))).toEqual([
      'activa-05-01',
      'activa-03-01-creada-tarde',
      'activa-03-01-creada-temprano',
      'completada-04-01',
    ]);
    expect(total).toBe(4);
    expect(idPorEtiqueta.size).toBe(ORDEN_ESPERADO.length);
  });
});
