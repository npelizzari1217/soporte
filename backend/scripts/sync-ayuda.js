/**
 * Sincroniza los artículos de Ayuda del repositorio (`backend/ayuda/*.md`) a la
 * tabla `kb_articulos` de la DB MASTER.
 *
 * POR QUÉ existe: la Ayuda documenta cómo se usa el sistema, así que tiene que
 * poder cambiar en el mismo commit que cambia el comportamiento. Un artículo que
 * solo vive en una tabla de producción no se puede actualizar desde el código y
 * queda obsoleto el día uno.
 *
 * UNA SOLA BASE: los artículos son únicos y globales. Antes este script hacía
 * fan-out a cada tenant y el mismo texto quedaba duplicado tantas veces como
 * clientes había; ahora escribe una vez, en master, y todos los clientes leen
 * exactamente lo mismo.
 *
 * Uso:
 *   pnpm run sync:ayuda
 *
 * Requiere `DATABASE_URL_MASTER` (de `.env` o del entorno).
 *
 * SEGURO DE CORRER VARIAS VECES: es idempotente por `slug`. Si el artículo ya
 * existe se actualizan título y contenido, y si nada cambió no se escribe nada
 * (ni siquiera `updated_at`). Dos corridas seguidas dejan la base idéntica.
 *
 * LA VISIBILIDAD NO LA GOBIERNA EL SYNC. Al INSERTAR un artículo nuevo se usa
 * el `visibleParaSolicitante` del frontmatter, que vale como valor inicial. Al
 * ACTUALIZAR uno existente la visibilidad NO se toca NUNCA. El motivo es que
 * publicar y despublicar siguen siendo un botón de la pantalla: mientras el
 * sync pisaba esa columna, cualquiera que publicara un artículo se lo veía
 * ocultar solo en la corrida siguiente, sin explicación. La regla quedó
 * repartida así: el TEXTO lo manda el repositorio, el PUBLICAR lo manda la
 * persona.
 *
 * LO QUE NUNCA HACE: borrar. Un artículo escrito desde la aplicación no tiene
 * `slug` y el sync no lo mira. Si un `.md` se elimina del repositorio, su
 * artículo queda vivo y hay que darlo de baja a mano; el script no borra nada
 * por su cuenta.
 *
 * `autor_id` queda NULL a propósito: estos artículos no los escribió una
 * persona, los mantiene el repositorio.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

/** Directorio canónico de los artículos, relativo a este script. */
const DIRECTORIO_ARTICULOS = path.join(__dirname, '..', 'ayuda');

const DELIMITADOR = '---';
const CLAVES_REQUERIDAS = ['slug', 'titulo'];
const CLAVES_CONOCIDAS = ['slug', 'titulo', 'visibleParaSolicitante'];
/** Mismo formato que exige el CHECK de la columna (kebab-case ASCII). */
const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Error de contenido de un artículo. Se distingue de un fallo de conexión o de
 * SQL para que el mensaje al operador diga QUÉ archivo está mal y por qué.
 */
class ArticuloInvalidoError extends Error {
  /**
   * @param {string} origen Nombre del archivo, para ubicar el problema.
   * @param {string} detalle Qué está mal, en una línea.
   */
  constructor(origen, detalle) {
    super(`[${origen}] ${detalle}`);
    this.name = 'ArticuloInvalidoError';
  }
}

/**
 * Convierte el valor crudo de una clave del frontmatter al tipo que corresponde.
 * Subconjunto deliberadamente mínimo de YAML — `null`, booleanos y texto — para
 * no arrastrar una dependencia de parseo por tres claves.
 *
 * @param {string} crudo Texto a la derecha de los dos puntos, ya recortado.
 * @returns {string|boolean|null}
 */
function interpretarValor(crudo) {
  const sinComentario = crudo.replace(/\s+#.*$/, '').trim();
  const sinComillas = sinComentario.replace(/^(['"])(.*)\1$/, '$2').trim();

  if (sinComillas === '' || sinComillas === 'null' || sinComillas === '~') return null;
  if (sinComillas === 'true') return true;
  if (sinComillas === 'false') return false;
  return sinComillas;
}

/**
 * Parsea un archivo de artículo: frontmatter delimitado por `---` y, debajo, el
 * cuerpo en markdown.
 *
 * Falla FUERTE y con mensaje explícito ante un frontmatter ausente, mal cerrado,
 * incompleto o con un slug de formato inválido. El silencio acá se traduciría en
 * un artículo que no aparece en la Ayuda sin que nadie se entere.
 *
 * @param {string} texto Contenido completo del archivo.
 * @param {string} origen Nombre del archivo, para los mensajes de error.
 * @returns {{slug: string, titulo: string, visibleParaSolicitante: boolean, contenido: string}}
 * @throws {ArticuloInvalidoError}
 */
function parsearArticulo(texto, origen) {
  const normalizado = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lineas = normalizado.split('\n');

  if (lineas[0].trim() !== DELIMITADOR) {
    throw new ArticuloInvalidoError(
      origen,
      `el archivo debe empezar con una línea "${DELIMITADOR}" que abra el frontmatter`,
    );
  }

  const cierre = lineas.findIndex((linea, i) => i > 0 && linea.trim() === DELIMITADOR);
  if (cierre === -1) {
    throw new ArticuloInvalidoError(
      origen,
      `el frontmatter quedó sin cerrar: falta la segunda línea "${DELIMITADOR}"`,
    );
  }

  /** @type {Record<string, string|boolean|null>} */
  const campos = {};
  for (let i = 1; i < cierre; i += 1) {
    const linea = lineas[i];
    if (linea.trim() === '' || linea.trim().startsWith('#')) continue;

    const separador = linea.indexOf(':');
    if (separador === -1) {
      throw new ArticuloInvalidoError(
        origen,
        `línea ${i + 1} del frontmatter sin formato "clave: valor": ${linea.trim()}`,
      );
    }

    const clave = linea.slice(0, separador).trim();
    if (!CLAVES_CONOCIDAS.includes(clave)) {
      throw new ArticuloInvalidoError(
        origen,
        `clave desconocida "${clave}" en el frontmatter (válidas: ${CLAVES_CONOCIDAS.join(', ')})`,
      );
    }
    campos[clave] = interpretarValor(linea.slice(separador + 1));
  }

  for (const requerida of CLAVES_REQUERIDAS) {
    if (typeof campos[requerida] !== 'string' || campos[requerida].trim() === '') {
      throw new ArticuloInvalidoError(
        origen,
        `falta "${requerida}" en el frontmatter, o está vacío (es obligatorio)`,
      );
    }
  }

  const slug = String(campos.slug).trim();
  if (!FORMATO_SLUG.test(slug)) {
    throw new ArticuloInvalidoError(
      origen,
      `slug "${slug}" inválido: se esperan minúsculas, dígitos y guiones simples (ej. permisos-y-roles)`,
    );
  }
  if (slug.length > 120) {
    throw new ArticuloInvalidoError(origen, `slug "${slug}" excede los 120 caracteres`);
  }

  const titulo = String(campos.titulo).trim();
  if (titulo.length > 255) {
    throw new ArticuloInvalidoError(origen, `el título excede los 255 caracteres`);
  }

  const visible = campos.visibleParaSolicitante;
  if (visible !== undefined && typeof visible !== 'boolean') {
    throw new ArticuloInvalidoError(
      origen,
      `"visibleParaSolicitante" debe ser true o false (llegó: ${String(visible)})`,
    );
  }

  const contenido = lineas
    .slice(cierre + 1)
    .join('\n')
    .trim();
  if (contenido === '') {
    throw new ArticuloInvalidoError(origen, 'el artículo no tiene cuerpo debajo del frontmatter');
  }

  return {
    slug,
    titulo,
    visibleParaSolicitante: visible === undefined ? false : visible,
    contenido,
  };
}

/**
 * Carga y valida todos los `.md` de un directorio, ordenados por nombre de
 * archivo para que la corrida sea determinista.
 *
 * @param {string} directorio Ruta absoluta al directorio de artículos.
 * @returns {Array<{slug: string, titulo: string, visibleParaSolicitante: boolean, contenido: string, origen: string}>}
 * @throws {ArticuloInvalidoError} Si un archivo es inválido o dos comparten slug.
 */
function cargarArticulos(directorio = DIRECTORIO_ARTICULOS) {
  const archivos = fs
    .readdirSync(directorio)
    .filter((nombre) => nombre.endsWith('.md'))
    .sort();

  const articulos = [];
  /** @type {Map<string, string>} */
  const vistos = new Map();

  for (const nombre of archivos) {
    const texto = fs.readFileSync(path.join(directorio, nombre), 'utf8');
    const articulo = parsearArticulo(texto, nombre);

    const previo = vistos.get(articulo.slug);
    if (previo !== undefined) {
      throw new ArticuloInvalidoError(
        nombre,
        `el slug "${articulo.slug}" ya lo usa ${previo}; el slug es la identidad y no se puede repetir`,
      );
    }
    vistos.set(articulo.slug, nombre);
    articulos.push({ ...articulo, origen: nombre });
  }

  return articulos;
}

/**
 * Sincroniza los artículos contra la DB MASTER ya conectada.
 *
 * Idempotente por `slug`: existe → actualiza sólo si el TEXTO cambió; no existe
 * → inserta. Nunca borra ni desactiva nada, y nunca toca filas sin slug (las
 * que se escribieron desde la aplicación).
 *
 * La visibilidad sólo viaja en el INSERT. En el UPDATE se deja exactamente como
 * está: publicar y despublicar es una decisión de la persona, tomada desde la
 * pantalla, y el sync no tiene por qué revertirla cada vez que corre.
 *
 * @param {import('pg').ClientBase} cliente Conexión a la DB master.
 * @param {Array<{slug: string, titulo: string, visibleParaSolicitante: boolean, contenido: string}>} articulos
 * @returns {Promise<{insertados: number, actualizados: number, sinCambios: number}>}
 */
async function sincronizarAyuda(cliente, articulos) {
  const resumen = { insertados: 0, actualizados: 0, sinCambios: 0 };

  for (const articulo of articulos) {
    const { rows } = await cliente.query(
      'select id, titulo, contenido from kb_articulos where slug = $1',
      [articulo.slug],
    );

    if (rows.length === 0) {
      // autor_id se omite: la columna es nullable y estos artículos no tienen
      // una persona detrás. `updated_at` sí va explícito: es NOT NULL y sin
      // DEFAULT en la tabla (Prisma la mantiene desde la app, no la DB).
      await cliente.query(
        'insert into kb_articulos (slug, titulo, contenido, visible_para_solicitante, updated_at) ' +
          'values ($1, $2, $3, $4, now())',
        [articulo.slug, articulo.titulo, articulo.contenido, articulo.visibleParaSolicitante],
      );
      resumen.insertados += 1;
      continue;
    }

    const actual = rows[0];
    const iguales = actual.titulo === articulo.titulo && actual.contenido === articulo.contenido;

    if (iguales) {
      // No se escribe: un UPDATE inútil movería `updated_at` y haría que cada
      // corrida pareciera un cambio real.
      resumen.sinCambios += 1;
      continue;
    }

    // `visible_para_solicitante`, `activo` y `deleted_at` quedan intactos a
    // propósito: si alguien publicó el artículo, o lo dio de baja, el sync no
    // le revierte esa decisión.
    await cliente.query(
      'update kb_articulos set titulo = $2, contenido = $3, updated_at = now() where slug = $1',
      [articulo.slug, articulo.titulo, articulo.contenido],
    );
    resumen.actualizados += 1;
  }

  return resumen;
}

module.exports = {
  ArticuloInvalidoError,
  DIRECTORIO_ARTICULOS,
  cargarArticulos,
  parsearArticulo,
  sincronizarAyuda,
};

/* c8 ignore start -- entrypoint del CLI, ejercitado a mano */
if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: se usan las variables ya presentes en el entorno.
  }

  const masterUrl = process.env.DATABASE_URL_MASTER;
  if (!masterUrl) {
    console.error('[sync-ayuda] falta DATABASE_URL_MASTER');
    process.exit(1);
  }

  (async () => {
    const articulos = cargarArticulos();
    if (articulos.length === 0) {
      console.log('[sync-ayuda] no hay artículos en ' + DIRECTORIO_ARTICULOS + ', nada que hacer');
      return;
    }
    console.log(
      '[sync-ayuda] ' +
        articulos.length +
        ' artículo(s): ' +
        articulos.map((a) => a.slug).join(', '),
    );

    const pool = new Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
    try {
      const resumen = await sincronizarAyuda(pool, articulos);
      console.log(
        '[sync-ayuda] OK: ' +
          resumen.insertados +
          ' insertado(s), ' +
          resumen.actualizados +
          ' actualizado(s), ' +
          resumen.sinCambios +
          ' sin cambios',
      );
    } finally {
      await pool.end();
    }
  })().catch((e) => {
    console.error('[sync-ayuda] ERROR:', e.message);
    process.exit(1);
  });
}
/* c8 ignore stop */
