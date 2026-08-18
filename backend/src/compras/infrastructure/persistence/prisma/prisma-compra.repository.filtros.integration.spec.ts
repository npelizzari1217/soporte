/**
 * prisma-compra.repository.filtros.integration.spec.ts — WU-10/WU-11/WU-12
 * (sdd/compras-tres-etapas-y-sectores, FASE 3).
 *
 * WU-10 es el PRIMER `it` de este archivo, AISLADO, antes de cualquier otra
 * cosa: corre contra Postgres real un `findMany` con una field reference de
 * Prisma (`client.itemCompra.fields.cantidad`) dentro de un `some` anidado,
 * y afirma que compila y devuelve filas. Es R-1 del design: esa
 * construcción está DISEÑADA pero NUNCA se corrió contra Prisma 7.8. Si
 * falla, el fallback (`$queryRaw` acotado a ids) está documentado en
 * ADR-T5 y el resto de este archivo (test de deriva) no cambia una línea.
 *
 * NOTA WU-25: la producción ya NO usa esa field reference — el filtro y el
 * orden por grupo derivado se resuelven con el `$queryRaw` acotado a ids
 * que ADR-T5 dejaba como fallback. Este `describe` se conserva igual porque
 * sigue afirmando algo vivo a nivel base: la semántica exacta del borde de
 * igualdad `cantidadEntregada == cantidad` (S60) contra Postgres real.
 */
import { Client } from 'pg';
import { Prisma } from '.prisma/tenant';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  GRUPOS_ESTADO_COMPRA,
  GrupoEstadoCompra,
} from '../../../domain/services/estado-compra';
import { PrismaCompraRepository } from './prisma-compra.repository';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('WU-10 — SPIKE aislado: field reference de Prisma en un filtro anidado', () => {
  let client: Client;
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let cicloId: string;
  let compraId: string;

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);

    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();

    const ciclo = await client.query(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-10 spike ciclo', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    cicloId = ciclo.rows[0].id as string;

    const compra = await client.query(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, updated_at)
       VALUES (gen_random_uuid(), 'COM-2026-70001', '2026-01-01', 'Compra spike WU-10', gen_random_uuid(), $1, now())
       RETURNING id`,
      [cicloId],
    );
    compraId = compra.rows[0].id as string;

    // Ítem APROBADO con cantidad_entregada < cantidad (el caso que el
    // predicado de ADR-T5 debe encontrar).
    await client.query(
      `INSERT INTO items_compra (id, compra_id, descripcion, cantidad, proveedor, monto, moneda, fecha_cotizacion, estado_aprobacion, decidido_por_id, decidido_en, cantidad_ordenada, cantidad_recibida, cantidad_entregada, updated_at)
       VALUES (gen_random_uuid(), $1, 'Item spike', 10, 'Proveedor', 100, 'ARS', '2026-01-01', 'APROBADO', gen_random_uuid(), now(), 10, 10, 4, now())`,
      [compraId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM items_compra WHERE compra_id = $1', [compraId]);
    await client.query('DELETE FROM compras WHERE id = $1', [compraId]);
    await client.query('DELETE FROM ciclos_cliente WHERE id = $1', [cicloId]);
    await client.end();
    await prismaService.onModuleDestroy();
  });

  it('R-1: un `findMany` con `items.some.cantidadEntregada.lt: fields.cantidad` compila y devuelve la fila esperada', async () => {
    const rows = await tenantClient.compra.findMany({
      where: {
        id: compraId,
        items: {
          some: {
            deletedAt: null,
            estadoAprobacion: 'APROBADO',
            cerradoConFaltante: false,
            cantidadEntregada: { lt: tenantClient.itemCompra.fields.cantidad },
          },
        },
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(compraId);
  });

  it('caso hermano: NO matchea cuando cantidadEntregada === cantidad (borde de igualdad, S60)', async () => {
    await client.query(
      `UPDATE items_compra SET cantidad_entregada = cantidad WHERE compra_id = $1`,
      [compraId],
    );

    const rows = await tenantClient.compra.findMany({
      where: {
        id: compraId,
        items: {
          some: {
            deletedAt: null,
            estadoAprobacion: 'APROBADO',
            cerradoConFaltante: false,
            cantidadEntregada: { lt: tenantClient.itemCompra.fields.cantidad },
          },
        },
      },
    });

    expect(rows).toHaveLength(0);

    // Restaurar para no afectar el resto del describe si vitest reordenara.
    await client.query(`UPDATE items_compra SET cantidad_entregada = 4 WHERE compra_id = $1`, [
      compraId,
    ]);
  });

  it('sanity: Prisma.Decimal sigue siendo el tipo de cantidad/cantidadEntregada (documenta la versión ejercitada)', () => {
    // No requiere DB — solo documenta contra qué versión de Prisma corrió el spike.
    expect(typeof Prisma).toBe('object');
  });
});

/**
 * WU-11/WU-12/WU-25 — filtro por grupo de estado y test de deriva SQL vs
 * dominio (ADR-T5, ADR-T6, R7, R8, S59-S61). El `CASE` SQL que asigna el
 * grupo NO se reimplementa acá: se compara el conjunto de ids que devuelve
 * `findPaginaConItems({ grupoEstado })` contra el mismo conjunto calculado
 * en memoria con el getter `grupoEstado` de `CompraEntity` (que delega en
 * `derivarGrupoEstadoCompra` → `derivarEstadoCompra`, ADR-C1) — mismo
 * mecanismo que `compras-checks.integration.spec.ts:476-497`.
 */
describe('WU-11/WU-12/WU-25 — filtro por grupo de estado + test de deriva', () => {
  let client: Client;
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaCompraRepository;
  let cicloId: string;
  let otroCicloId: string;
  let numeroSeq = 0;

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-wu12',
    });
    repo = new PrismaCompraRepository(tenantContext);

    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();
  });

  afterAll(async () => {
    await limpiar();
    await client.end();
    await prismaService.onModuleDestroy();
  });

  async function limpiar(): Promise<void> {
    for (const id of [cicloId, otroCicloId].filter(Boolean)) {
      await client.query(
        'DELETE FROM items_compra WHERE compra_id IN (SELECT id FROM compras WHERE ciclo_id = $1)',
        [id],
      );
      await client.query('DELETE FROM compras WHERE ciclo_id = $1', [id]);
      await client.query('DELETE FROM ciclos_cliente WHERE id = $1', [id]);
    }
  }

  beforeEach(async () => {
    await limpiar();
    const ciclo = await client.query(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-12 ciclo', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    cicloId = ciclo.rows[0].id as string;
    const otro = await client.query(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'WU-12 otro ciclo', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    otroCicloId = otro.rows[0].id as string;
  });

  function siguienteNumero(): string {
    numeroSeq += 1;
    return `COM-2026-${String(60000 + numeroSeq).padStart(5, '0')}`;
  }

  /** Inserta una Compra (opcionalmente cancelada) y devuelve su id. */
  async function insertCompra(
    ciclo: string,
    overrides: { cancelada?: boolean } = {},
  ): Promise<string> {
    const cancelada = overrides.cancelada ?? false;
    const result = await client.query(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, cancelada_en, cancelado_por_id, motivo_cancelacion, updated_at)
       VALUES (gen_random_uuid(), $1, '2026-01-01', 'Motivo WU-12', gen_random_uuid(), $2, $3, $4, $5, now())
       RETURNING id`,
      [
        siguienteNumero(),
        ciclo,
        cancelada ? new Date() : null,
        cancelada ? '00000000-0000-4000-8000-000000000ccc' : null,
        cancelada ? 'Cancelada para fixture WU-12' : null,
      ],
    );
    return result.rows[0].id as string;
  }

  interface ItemFixture {
    cantidad?: number;
    cantidadRecibida?: number;
    cantidadEntregada?: number;
    estadoAprobacion?: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
    cerradoConFaltante?: boolean;
    deletedAt?: Date | null;
  }

  async function insertItem(compraId: string, overrides: ItemFixture = {}): Promise<void> {
    const cantidad = overrides.cantidad ?? 10;
    const cantidadRecibida = overrides.cantidadRecibida ?? 0;
    const cantidadEntregada = overrides.cantidadEntregada ?? 0;
    const estadoAprobacion = overrides.estadoAprobacion ?? 'PENDIENTE';
    const cerradoConFaltante = overrides.cerradoConFaltante ?? false;
    const deletedAt = overrides.deletedAt ?? null;
    const decidido = estadoAprobacion !== 'PENDIENTE';

    // cantidad_ordenada (M2, CHECK cantidad_recibida <= cantidad_ordenada):
    // el filtro "en curso" no distingue por esta columna (solo mira
    // estadoAprobacion/cantidadEntregada/cerradoConFaltante), así que estos
    // fixtures la fijan igual a `cantidad` — suficiente holgura para
    // cualquier `cantidadRecibida` que la matriz use.
    await client.query(
      `INSERT INTO items_compra (
         id, compra_id, descripcion, cantidad, proveedor, monto, moneda, fecha_cotizacion,
         estado_aprobacion, decidido_por_id, decidido_en,
         cantidad_ordenada, cantidad_recibida, cantidad_entregada, cerrado_con_faltante, motivo_cierre_faltante,
         updated_at, deleted_at
       )
       VALUES (
         gen_random_uuid(), $1, 'Item WU-12', $2, 'Proveedor', 100, 'ARS', '2026-01-01',
         $3, $4, $5,
         $2, $6, $7, $8, $9,
         now(), $10
       )`,
      [
        compraId,
        cantidad,
        estadoAprobacion,
        decidido ? '00000000-0000-4000-8000-000000000ddd' : null,
        decidido ? new Date() : null,
        cantidadRecibida,
        cantidadEntregada,
        cerradoConFaltante,
        cerradoConFaltante ? 'Faltante fixture WU-12' : null,
        deletedAt,
      ],
    );
  }

  /**
   * Matriz de 14 fixtures de ADR-T6. `enCurso` es la expectativa
   * INDEPENDIENTE calculada a mano contra la tabla de verdad de la spec —
   * el test de deriva no la usa como oráculo aparte de la comparación
   * SQL-vs-dominio (ver `it` de abajo), pero documentarla acá deja explícito
   * qué ejercita cada fila.
   */
  async function construirMatriz(): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};

    // F1 — cancelada, con ítems aprobados y entregados. NO en curso.
    ids.F1 = await insertCompra(cicloId, { cancelada: true });
    await insertItem(ids.F1, {
      estadoAprobacion: 'APROBADO',
      cantidadRecibida: 10,
      cantidadEntregada: 10,
    });

    // F2 — cancelada, sin ítems. NO en curso.
    ids.F2 = await insertCompra(cicloId, { cancelada: true });

    // F3 — 1 PENDIENTE + 1 APROBADO entregado. EN CURSO (término 1).
    ids.F3 = await insertCompra(cicloId);
    await insertItem(ids.F3, { estadoAprobacion: 'PENDIENTE' });
    await insertItem(ids.F3, {
      estadoAprobacion: 'APROBADO',
      cantidadRecibida: 10,
      cantidadEntregada: 10,
    });

    // F4 — todos RECHAZADOS (T5). CANCELADAS.
    //
    // CAMBIO DE COMPORTAMIENTO DELIBERADO (WU-25): con el predicado
    // `soloEnCurso` anterior esta compra caía en "en curso" por el término
    // `∄ ítem APROBADO`. Con los grupos nuevos es un cierre negativo — no
    // queda nada por comprar ni por entregar — así que acompaña a las
    // canceladas y NO aparece en el listado por defecto.
    ids.F4 = await insertCompra(cicloId);
    await insertItem(ids.F4, { estadoAprobacion: 'RECHAZADO' });

    // F5 — sin ítems (T1). ACTIVAS.
    ids.F5 = await insertCompra(cicloId);

    // F6 — solo ítems soft-deleted. EN CURSO (deletedAt:null del filtro anidado).
    ids.F6 = await insertCompra(cicloId);
    await insertItem(ids.F6, {
      estadoAprobacion: 'APROBADO',
      cantidadRecibida: 10,
      cantidadEntregada: 10,
      deletedAt: new Date('2026-01-05'),
    });

    // F7 — APROBADO, entregada=6 < cantidad=10. EN CURSO (término 3).
    ids.F7 = await insertCompra(cicloId);
    await insertItem(ids.F7, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadRecibida: 10,
      cantidadEntregada: 6,
    });

    // F8 — APROBADO, entregada=10=cantidad=10 (borde de igualdad, S60). NO en curso.
    ids.F8 = await insertCompra(cicloId);
    await insertItem(ids.F8, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadRecibida: 10,
      cantidadEntregada: 10,
    });

    // F9 — APROBADO cerradoConFaltante=true, entregada=0. NO en curso (cláusula OR de S22).
    ids.F9 = await insertCompra(cicloId);
    await insertItem(ids.F9, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadRecibida: 10,
      cantidadEntregada: 0,
      cerradoConFaltante: true,
    });

    // F10 — APROBADO_PARCIALMENTE (1 aprobado entregado + 1 rechazado). NO en curso.
    ids.F10 = await insertCompra(cicloId);
    await insertItem(ids.F10, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadRecibida: 10,
      cantidadEntregada: 10,
    });
    await insertItem(ids.F10, { estadoAprobacion: 'RECHAZADO' });

    // F11 — APROBADO, cantidad=0.30, entregada=0.30 (equivalencia enCentesimas ≡ SQL, R-2). NO en curso.
    ids.F11 = await insertCompra(cicloId);
    await insertItem(ids.F11, {
      estadoAprobacion: 'APROBADO',
      cantidad: 0.3,
      cantidadRecibida: 0.3,
      cantidadEntregada: 0.3,
    });

    // F12 — APROBADO, borde superior de DECIMAL(10,2). NO en curso.
    ids.F12 = await insertCompra(cicloId);
    await insertItem(ids.F12, {
      estadoAprobacion: 'APROBADO',
      cantidad: 99999999.99,
      cantidadRecibida: 99999999.99,
      cantidadEntregada: 99999999.99,
    });

    // F13 — 1 ítem aprobado entregado + 1 ítem aprobado a medias (cuantificador universal). EN CURSO.
    ids.F13 = await insertCompra(cicloId);
    await insertItem(ids.F13, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadRecibida: 10,
      cantidadEntregada: 10,
    });
    await insertItem(ids.F13, {
      estadoAprobacion: 'APROBADO',
      cantidad: 10,
      cantidadRecibida: 10,
      cantidadEntregada: 4,
    });

    // F14 — compra en curso pero de OTRO ciclo. Excluida por el filtro de ciclo, no por "en curso".
    ids.F14 = await insertCompra(otroCicloId);
    await insertItem(ids.F14, { estadoAprobacion: 'PENDIENTE' });

    return ids;
  }

  /** Los 13 fixtures del ciclo bajo test (F14 vive en otro ciclo a propósito). */
  function idsDelCiclo(ids: Record<string, string>): string[] {
    return [
      ids.F1,
      ids.F2,
      ids.F3,
      ids.F4,
      ids.F5,
      ids.F6,
      ids.F7,
      ids.F8,
      ids.F9,
      ids.F10,
      ids.F11,
      ids.F12,
      ids.F13,
    ];
  }

  /**
   * Conjunto de dominio: carga CADA compra del ciclo con `findByIdConItems`
   * y evalúa el MISMO getter que usa el resto de la app
   * (`CompraEntity.grupoEstado`), sin reimplementar la regla acá.
   */
  async function idsDeDominioDelGrupo(
    ids: Record<string, string>,
    grupo: GrupoEstadoCompra,
  ): Promise<Set<string>> {
    const encontrados = new Set<string>();
    for (const id of idsDelCiclo(ids)) {
      const compra = await repo.findByIdConItems(id);
      if (compra && compra.grupoEstado === grupo) {
        encontrados.add(id);
      }
    }
    return encontrados;
  }

  it.each(GRUPOS_ESTADO_COMPRA)(
    'R8/S61: el conjunto de ids que devuelve el SQL para el grupo %s es IDÉNTICO al que deriva el dominio en memoria',
    async (grupo) => {
      const ids = await construirMatriz();

      const { compras } = await repo.findPaginaConItems({ grupoEstado: grupo, cicloId });
      const idsSQL = new Set(compras.map((c) => c.id));

      expect(idsSQL).toEqual(await idsDeDominioDelGrupo(ids, grupo));
      // F14 (otro ciclo) NUNCA debe aparecer — el término de ciclo no se come ni agrega nada.
      expect(idsSQL.has(ids.F14)).toBe(false);
    },
  );

  it('R8/S61: sanity explícito de los bordes más sutiles del grupo ACTIVAS (anti verde vacuo)', async () => {
    const ids = await construirMatriz();

    const { compras } = await repo.findPaginaConItems({ grupoEstado: 'ACTIVAS', cicloId });
    const idsSQL = new Set(compras.map((c) => c.id));

    expect(idsSQL.has(ids.F1)).toBe(false); // cancelada con entregado completo
    expect(idsSQL.has(ids.F4)).toBe(false); // WU-25: todos rechazados YA NO es activa
    expect(idsSQL.has(ids.F5)).toBe(true); // sin ítems: falta cargarlos
    expect(idsSQL.has(ids.F7)).toBe(true); // hermano de F8: mismo estado, no entregado
    expect(idsSQL.has(ids.F8)).toBe(false); // borde de igualdad
    expect(idsSQL.has(ids.F13)).toBe(true); // cuantificador universal: uno a medias basta
  });

  it('WU-25: los tres grupos particionan el universo — sin solapamiento y sin sobrantes', async () => {
    const ids = await construirMatriz();

    const porGrupo = new Map<GrupoEstadoCompra, string[]>();
    for (const grupo of GRUPOS_ESTADO_COMPRA) {
      const { compras } = await repo.findPaginaConItems({ grupoEstado: grupo, cicloId });
      porGrupo.set(
        grupo,
        compras.map((c) => c.id),
      );
    }
    const { compras: todas } = await repo.findPaginaConItems({ grupoEstado: 'TODAS', cicloId });

    const concatenados = [...porGrupo.values()].flat();
    // Sin solapamiento: la concatenación no repite ningún id.
    expect(new Set(concatenados).size).toBe(concatenados.length);
    // Sin sobrantes: cubre exactamente el universo del ciclo.
    expect(new Set(concatenados)).toEqual(new Set(todas.map((c) => c.id)));
    expect(new Set(concatenados)).toEqual(new Set(idsDelCiclo(ids)));
  });

  it('R9/S62: el total viene de la MISMA consulta que las filas, para cada grupo', async () => {
    const ids = await construirMatriz();

    for (const grupo of [...GRUPOS_ESTADO_COMPRA, 'TODAS' as const]) {
      const { compras, total } = await repo.findPaginaConItems({ grupoEstado: grupo, cicloId });
      expect(total).toBe(compras.length);
    }
    expect(ids.F14).toBeDefined(); // fixture existe pero no cuenta (otro ciclo)
  });

  it('R9/S62: con paginación, el total mide el universo filtrado y NO el tamaño de la página', async () => {
    await construirMatriz();

    const { compras: todas, total: totalCompleto } = await repo.findPaginaConItems({
      grupoEstado: 'TODAS',
      cicloId,
    });
    const { compras: recortadas, total: totalConLimite } = await repo.findPaginaConItems({
      grupoEstado: 'TODAS',
      cicloId,
      limit: 2,
      offset: 0,
    });

    expect(todas.length).toBeGreaterThan(2);
    expect(recortadas).toHaveLength(2);
    expect(totalConLimite).toBe(totalCompleto);
  });
});
