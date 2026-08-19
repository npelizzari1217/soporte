/**
 * [INTEGRATION] Sync de artículos de Ayuda contra Postgres REAL
 * (`soporte_master_test`).
 *
 * MIGRADO DE TENANT A MASTER junto con la tabla: los artículos son únicos y
 * globales, así que el sync escribe UNA sola vez, en master, y ya no hace
 * fan-out por cliente.
 *
 * Cubre los comportamientos por los que existe el script, y sólo esos:
 * idempotencia, identidad por `slug` (cambiar el título actualiza, no duplica),
 * respeto absoluto por los artículos escritos desde la aplicación, y —el
 * cambio de comportamiento de esta tanda— que la visibilidad la manda la
 * persona, no el repositorio.
 *
 * Se cayó el caso de `tipoTicket`: la columna desapareció con la mudanza (era
 * una FK a `tipos_ticket`, tabla del TENANT).
 *
 * Fixtures acotados por prefijo (`zz-test-sync-`, `ZZ_TEST_SYNC`). Nunca un
 * TRUNCATE: la DB de test la comparten otras suites. La limpieza corre también
 * AL ENTRAR, no sólo al salir, para recuperarse de una corrida que muriera a
 * medias y dejara los fixtures de clave fija vivos.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { Pool } from 'pg';

type ArticuloSync = {
  slug: string;
  titulo: string;
  visibleParaSolicitante: boolean;
  contenido: string;
};

type Resumen = {
  insertados: number;
  actualizados: number;
  sinCambios: number;
};

const { sincronizarAyuda } = require('./sync-ayuda.js') as {
  sincronizarAyuda: (cliente: Pool, articulos: ArticuloSync[]) => Promise<Resumen>;
};

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SLUG_A = 'zz-test-sync-articulo-a';
const SLUG_B = 'zz-test-sync-articulo-b';
const PREFIJO_SLUG = 'zz-test-sync-%';
const TITULO_MANUAL = 'ZZ_TEST_SYNC artículo escrito desde la aplicación';

function articulo(overrides: Partial<ArticuloSync> = {}): ArticuloSync {
  return {
    slug: SLUG_A,
    titulo: 'Título original',
    visibleParaSolicitante: false,
    contenido: '# Cuerpo\n\nTexto.',
    ...overrides,
  };
}

describe('sincronizarAyuda() — Integration (master)', () => {
  let pool: Pool;

  /** Idempotente a propósito: sirve para entrar limpio y para salir limpio. */
  async function limpiarFixtures(): Promise<void> {
    await pool.query('delete from kb_articulos where slug like $1 or titulo like $2', [
      PREFIJO_SLUG,
      'ZZ_TEST_SYNC%',
    ]);
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: MASTER_TEST_URL, connectionTimeoutMillis: 10000 });
    await limpiarFixtures();
  });

  afterAll(async () => {
    // Limpiar ANTES de cerrar el pool: al revés, Postgres se queda con los
    // fixtures y la próxima corrida choca contra las claves fijas.
    await limpiarFixtures();
    await pool.end();
  });

  beforeEach(async () => {
    await limpiarFixtures();
  });

  it('es idempotente: la segunda corrida no escribe nada y deja la base igual', async () => {
    const articulos = [articulo(), articulo({ slug: SLUG_B, titulo: 'Otro' })];

    const primera = await sincronizarAyuda(pool, articulos);
    const { rows: despuesDeLaPrimera } = await pool.query(
      'select slug, titulo, contenido, updated_at from kb_articulos where slug like $1 order by slug',
      [PREFIJO_SLUG],
    );

    const segunda = await sincronizarAyuda(pool, articulos);
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
    await sincronizarAyuda(pool, [articulo({ titulo: 'Título viejo' })]);
    const { rows: antes } = await pool.query('select id from kb_articulos where slug = $1', [
      SLUG_A,
    ]);

    const resumen = await sincronizarAyuda(pool, [articulo({ titulo: 'Título nuevo' })]);

    const { rows: despues } = await pool.query(
      'select id, titulo from kb_articulos where slug = $1',
      [SLUG_A],
    );
    expect(resumen).toMatchObject({ insertados: 0, actualizados: 1, sinCambios: 0 });
    expect(despues).toHaveLength(1);
    expect(despues[0].id).toBe(antes[0].id);
    expect(despues[0].titulo).toBe('Título nuevo');
  });

  // EL cambio de comportamiento de esta tanda. Antes el sync escribía la
  // visibilidad desde el frontmatter en cada corrida, así que publicar un
  // artículo desde la pantalla duraba hasta el sync siguiente, que lo volvía a
  // ocultar sin que nadie entendiera por qué.
  it('[CRITICAL] publicar desde la aplicación y re-sincronizar deja el artículo PUBLICADO', async () => {
    await sincronizarAyuda(pool, [articulo({ visibleParaSolicitante: false })]);
    await pool.query('update kb_articulos set visible_para_solicitante = true where slug = $1', [
      SLUG_A,
    ]);

    // El repositorio sigue diciendo "interno" Y el texto cambió, para que la
    // corrida entre por la rama del UPDATE y no por la de "sin cambios".
    const resumen = await sincronizarAyuda(pool, [
      articulo({ visibleParaSolicitante: false, contenido: '# Cuerpo\n\nTexto corregido.' }),
    ]);

    const { rows } = await pool.query(
      'select titulo, contenido, visible_para_solicitante from kb_articulos where slug = $1',
      [SLUG_A],
    );
    expect(resumen).toMatchObject({ insertados: 0, actualizados: 1, sinCambios: 0 });
    expect(rows[0].contenido).toBe('# Cuerpo\n\nTexto corregido.');
    expect(rows[0].visible_para_solicitante).toBe(true);
  });

  it('al INSERTAR sí usa la visibilidad del frontmatter (valor inicial)', async () => {
    await sincronizarAyuda(pool, [articulo({ visibleParaSolicitante: true })]);

    const { rows } = await pool.query(
      'select visible_para_solicitante from kb_articulos where slug = $1',
      [SLUG_A],
    );
    expect(rows[0].visible_para_solicitante).toBe(true);
  });

  it('no toca un artículo escrito desde la aplicación (sin slug), aunque tenga el mismo título', async () => {
    await pool.query(
      'insert into kb_articulos (titulo, contenido, visible_para_solicitante, updated_at) ' +
        'values ($1, $2, true, now())',
      [TITULO_MANUAL, 'Contenido escrito a mano'],
    );
    const { rows: antes } = await pool.query(
      'select id, titulo, contenido, visible_para_solicitante, updated_at ' +
        'from kb_articulos where slug is null and titulo = $1',
      [TITULO_MANUAL],
    );

    const resumen = await sincronizarAyuda(pool, [articulo({ titulo: TITULO_MANUAL })]);

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
    await sincronizarAyuda(pool, [articulo(), articulo({ slug: SLUG_B, titulo: 'Otro' })]);

    // Segunda corrida con un artículo menos, como si se hubiera borrado el .md.
    await sincronizarAyuda(pool, [articulo()]);

    const { rows } = await pool.query(
      'select count(*)::int as n from kb_articulos where slug like $1',
      [PREFIJO_SLUG],
    );
    expect(rows[0].n).toBe(2);
  });
});
