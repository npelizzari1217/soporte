/**
 * [INTEGRATION] Sync de artículos de Ayuda contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Cubre los cuatro comportamientos por los que existe el script, y sólo esos:
 * idempotencia, identidad por `slug` (cambiar el título actualiza, no duplica),
 * tolerancia a un tipo de ticket ausente en el tenant, y respeto absoluto por
 * los artículos que cargó a mano el cliente.
 *
 * Fixtures acotados por prefijo (`zz-test-sync-`, `ZZ_TEST_SYNC`). Nunca un
 * TRUNCATE: la DB de test la comparten otras suites. La limpieza corre también
 * AL ENTRAR, no sólo al salir, para recuperarse de una corrida que muriera a
 * medias y dejara los fixtures de clave fija vivos (mismo criterio que
 * `prisma-reparaciones.integration.spec.ts`).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { Pool } from 'pg';

type ArticuloSync = {
  slug: string;
  titulo: string;
  tipoTicket: string | null;
  visibleParaSolicitante: boolean;
  contenido: string;
};

type Resumen = {
  insertados: number;
  actualizados: number;
  sinCambios: number;
  tiposNoEncontrados: string[];
};

const { sincronizarTenant } = require('./sync-ayuda.js') as {
  sincronizarTenant: (
    cliente: Pool,
    articulos: ArticuloSync[],
    avisar?: (mensaje: string) => void,
  ) => Promise<Resumen>;
};

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

const SLUG_A = 'zz-test-sync-articulo-a';
const SLUG_B = 'zz-test-sync-articulo-b';
const PREFIJO_SLUG = 'zz-test-sync-%';
const TITULO_MANUAL = 'ZZ_TEST_SYNC artículo cargado a mano';
const CODIGO_TIPO = 'ZZ_TEST_SYNC_TIPO';
const CODIGO_TIPO_INEXISTENTE = 'ZZ_TEST_SYNC_TIPO_QUE_NO_EXISTE';

function articulo(overrides: Partial<ArticuloSync> = {}): ArticuloSync {
  return {
    slug: SLUG_A,
    titulo: 'Título original',
    tipoTicket: null,
    visibleParaSolicitante: false,
    contenido: '# Cuerpo\n\nTexto.',
    ...overrides,
  };
}

describe('sincronizarTenant() — Integration', () => {
  let pool: Pool;
  let tipoTicketId: string;

  /** Idempotente a propósito: sirve para entrar limpio y para salir limpio. */
  async function limpiarFixtures(): Promise<void> {
    await pool.query('delete from kb_articulos where slug like $1 or titulo like $2', [
      PREFIJO_SLUG,
      'ZZ_TEST_SYNC%',
    ]);
    await pool.query('delete from tipos_ticket where codigo like $1', ['ZZ_TEST_SYNC%']);
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: TENANT_TEST_URL, connectionTimeoutMillis: 10000 });
    await limpiarFixtures();
    const { rows } = await pool.query(
      'insert into tipos_ticket (codigo, nombre, modulo, updated_at) ' +
        'values ($1, $2, $3, now()) returning id',
      [CODIGO_TIPO, 'ZZ_TEST_SYNC Tipo', 'TICKETS'],
    );
    tipoTicketId = rows[0].id;
  });

  afterAll(async () => {
    // Limpiar ANTES de cerrar el pool: al revés, Postgres se queda con los
    // fixtures y la próxima corrida choca contra los códigos fijos.
    await limpiarFixtures();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('delete from kb_articulos where slug like $1 or titulo like $2', [
      PREFIJO_SLUG,
      'ZZ_TEST_SYNC%',
    ]);
  });

  it('es idempotente: la segunda corrida no escribe nada y deja la base igual', async () => {
    const articulos = [articulo(), articulo({ slug: SLUG_B, titulo: 'Otro' })];

    const primera = await sincronizarTenant(pool, articulos);
    const { rows: despuesDeLaPrimera } = await pool.query(
      'select slug, titulo, contenido, updated_at from kb_articulos where slug like $1 order by slug',
      [PREFIJO_SLUG],
    );

    const segunda = await sincronizarTenant(pool, articulos);
    const { rows: despuesDeLaSegunda } = await pool.query(
      'select slug, titulo, contenido, updated_at from kb_articulos where slug like $1 order by slug',
      [PREFIJO_SLUG],
    );

    expect(primera).toMatchObject({ insertados: 2, actualizados: 0, sinCambios: 0 });
    expect(segunda).toMatchObject({ insertados: 0, actualizados: 0, sinCambios: 2 });
    // `updated_at` incluido: si la segunda corrida hiciera un UPDATE inútil,
    // cada sync parecería un cambio real en la bitácora del artículo.
    expect(despuesDeLaSegunda).toEqual(despuesDeLaPrimera);
  });

  it('cambiar el título ACTUALIZA el artículo en vez de duplicarlo', async () => {
    await sincronizarTenant(pool, [articulo({ titulo: 'Título viejo' })]);
    const { rows: antes } = await pool.query('select id from kb_articulos where slug = $1', [
      SLUG_A,
    ]);

    const resumen = await sincronizarTenant(pool, [articulo({ titulo: 'Título nuevo' })]);

    const { rows: despues } = await pool.query(
      'select id, titulo from kb_articulos where slug = $1',
      [SLUG_A],
    );
    expect(resumen).toMatchObject({ insertados: 0, actualizados: 1, sinCambios: 0 });
    expect(despues).toHaveLength(1);
    expect(despues[0].id).toBe(antes[0].id);
    expect(despues[0].titulo).toBe('Título nuevo');
  });

  it('resuelve tipoTicket por código y actualiza el vínculo', async () => {
    const resumen = await sincronizarTenant(pool, [articulo({ tipoTicket: CODIGO_TIPO })]);

    const { rows } = await pool.query('select tipo_ticket_id from kb_articulos where slug = $1', [
      SLUG_A,
    ]);
    expect(resumen.tiposNoEncontrados).toEqual([]);
    expect(rows[0].tipo_ticket_id).toBe(tipoTicketId);
  });

  it('un tipoTicket inexistente no rompe el sync: deja el tipo en NULL y avisa', async () => {
    const avisos: string[] = [];

    const resumen = await sincronizarTenant(
      pool,
      [articulo({ tipoTicket: CODIGO_TIPO_INEXISTENTE })],
      (mensaje) => avisos.push(mensaje),
    );

    const { rows } = await pool.query('select tipo_ticket_id from kb_articulos where slug = $1', [
      SLUG_A,
    ]);
    expect(resumen.insertados).toBe(1);
    expect(rows[0].tipo_ticket_id).toBeNull();
    expect(resumen.tiposNoEncontrados).toEqual([CODIGO_TIPO_INEXISTENTE]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain(CODIGO_TIPO_INEXISTENTE);
  });

  it('no toca un artículo cargado a mano (sin slug), aunque tenga el mismo título', async () => {
    await pool.query(
      'insert into kb_articulos (titulo, contenido, visible_para_solicitante, updated_at) ' +
        'values ($1, $2, true, now())',
      [TITULO_MANUAL, 'Contenido del cliente'],
    );
    const { rows: antes } = await pool.query(
      'select id, titulo, contenido, visible_para_solicitante, updated_at ' +
        'from kb_articulos where slug is null and titulo = $1',
      [TITULO_MANUAL],
    );

    const resumen = await sincronizarTenant(pool, [articulo({ titulo: TITULO_MANUAL })]);

    const { rows: despues } = await pool.query(
      'select id, titulo, contenido, visible_para_solicitante, updated_at ' +
        'from kb_articulos where slug is null and titulo = $1',
      [TITULO_MANUAL],
    );
    expect(resumen).toMatchObject({ insertados: 1, actualizados: 0, sinCambios: 0 });
    expect(despues).toEqual(antes);
    // El del repositorio se insertó al lado, con su slug: son dos filas.
    const { rows: conSlug } = await pool.query(
      'select count(*)::int as n from kb_articulos where slug = $1',
      [SLUG_A],
    );
    expect(conSlug[0].n).toBe(1);
  });

  it('no borra los artículos que dejaron de estar en los archivos', async () => {
    await sincronizarTenant(pool, [articulo(), articulo({ slug: SLUG_B, titulo: 'Otro' })]);

    // Segunda corrida con un artículo menos, como si se hubiera borrado el .md.
    await sincronizarTenant(pool, [articulo()]);

    const { rows } = await pool.query(
      'select count(*)::int as n from kb_articulos where slug like $1',
      [PREFIJO_SLUG],
    );
    expect(rows[0].n).toBe(2);
  });
});
