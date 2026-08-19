/**
 * Sincroniza los artículos de Ayuda del repositorio (`backend/ayuda/*.md`) a la
 * tabla `kb_articulos` de TODAS las DBs tenant activas.
 *
 * POR QUÉ existe: la Ayuda documenta cómo se usa el sistema, así que tiene que
 * poder cambiar en el mismo commit que cambia el comportamiento. Un artículo que
 * solo vive en una tabla de producción no se puede actualizar desde el código y
 * queda obsoleto el día uno.
 *
 * Uso:
 *   pnpm run sync:ayuda
 *
 * Requiere `DATABASE_URL_MASTER` (de `.env` o del entorno). Lee `master.clientes`
 * (activos, no borrados) y deriva la URL de cada tenant reemplazando el pathname,
 * igual que `scripts/migrate-tenants.js` y `PrismaService.buildTenantUrl`.
 *
 * SEGURO DE CORRER VARIAS VECES: es idempotente por `slug`. Si el artículo ya
 * existe se actualizan título, contenido, visibilidad y tipo de ticket, y si nada
 * cambió no se escribe nada (ni siquiera `updated_at`). Dos corridas seguidas
 * dejan la base idéntica.
 *
 * LO QUE NUNCA HACE: borrar. Un tenant puede tener artículos cargados a mano por
 * el cliente — esos no tienen `slug` y el sync no los mira. Si un `.md` se elimina
 * del repositorio, su artículo queda vivo en cada tenant y hay que darlo de baja a
 * mano; el script no borra nada por su cuenta.
 *
 * `autor_id` queda NULL a propósito: estos artículos no los escribió una persona
 * del tenant.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

/** Directorio canónico de los artículos, relativo a este script. */
const DIRECTORIO_ARTICULOS = path.join(__dirname, '..', 'ayuda');

const DELIMITADOR = '---';
const CLAVES_REQUERIDAS = ['slug', 'titulo'];
const CLAVES_CONOCIDAS = ['slug', 'titulo', 'tipoTicket', 'visibleParaSolicitante'];
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
 * no arrastrar una dependencia de parseo por cuatro claves.
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
 * un artículo que no aparece en ningún tenant sin que nadie se entere.
 *
 * @param {string} texto Contenido completo del archivo.
 * @param {string} origen Nombre del archivo, para los mensajes de error.
 * @returns {{slug: string, titulo: string, tipoTicket: string|null, visibleParaSolicitante: boolean, contenido: string}}
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

  if (campos.tipoTicket !== undefined && campos.tipoTicket !== null) {
    if (typeof campos.tipoTicket !== 'string') {
      throw new ArticuloInvalidoError(
        origen,
        `"tipoTicket" debe ser un código de tipo de ticket o null`,
      );
    }
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
    tipoTicket: campos.tipoTicket === undefined ? null : campos.tipoTicket,
    visibleParaSolicitante: visible === undefined ? false : visible,
    contenido,
  };
}

/**
 * Carga y valida todos los `.md` de un directorio, ordenados por nombre de
 * archivo para que la corrida sea determinista.
 *
 * @param {string} directorio Ruta absoluta al directorio de artículos.
 * @returns {Array<{slug: string, titulo: string, tipoTicket: string|null, visibleParaSolicitante: boolean, contenido: string, origen: string}>}
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
 * Resuelve el id del tipo de ticket a partir de su código.
 *
 * Devuelve `null` si el código no existe en ESTE tenant, sin reventar: los
 * tenants tienen catálogos distintos y un artículo sin tipo sigue siendo útil.
 *
 * @param {import('pg').ClientBase} cliente Conexión a la DB del tenant.
 * @param {string} codigo Código del tipo de ticket.
 * @returns {Promise<string|null>}
 */
async function resolverTipoTicketId(cliente, codigo) {
  const { rows } = await cliente.query('select id from tipos_ticket where codigo = $1', [codigo]);
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Sincroniza los artículos contra UNA DB tenant ya conectada.
 *
 * Idempotente por `slug`: existe → actualiza sólo si algo cambió; no existe →
 * inserta. Nunca borra ni desactiva nada, y nunca toca filas sin slug (las que
 * cargó a mano el cliente).
 *
 * @param {import('pg').ClientBase} cliente Conexión a la DB del tenant.
 * @param {Array<{slug: string, titulo: string, tipoTicket: string|null, visibleParaSolicitante: boolean, contenido: string}>} articulos
 * @param {(mensaje: string) => void} [avisar] Canal para los avisos no fatales.
 * @returns {Promise<{insertados: number, actualizados: number, sinCambios: number, tiposNoEncontrados: string[]}>}
 */
async function sincronizarTenant(cliente, articulos, avisar = () => {}) {
  const resumen = { insertados: 0, actualizados: 0, sinCambios: 0, tiposNoEncontrados: [] };

  for (const articulo of articulos) {
    let tipoTicketId = null;
    if (articulo.tipoTicket !== null) {
      tipoTicketId = await resolverTipoTicketId(cliente, articulo.tipoTicket);
      if (tipoTicketId === null) {
        resumen.tiposNoEncontrados.push(articulo.tipoTicket);
        avisar(
          `tipo de ticket "${articulo.tipoTicket}" inexistente en este tenant; ` +
            `"${articulo.slug}" queda sin tipo`,
        );
      }
    }

    const { rows } = await cliente.query(
      'select id, titulo, contenido, tipo_ticket_id, visible_para_solicitante ' +
        'from kb_articulos where slug = $1',
      [articulo.slug],
    );

    if (rows.length === 0) {
      // autor_id se omite: la columna es nullable y estos artículos no tienen
      // una persona del tenant detrás. `updated_at` sí va explícito: es NOT NULL
      // y sin DEFAULT en la tabla (Prisma la mantiene desde la app, no la DB).
      await cliente.query(
        'insert into kb_articulos (slug, titulo, contenido, tipo_ticket_id, visible_para_solicitante, updated_at) ' +
          'values ($1, $2, $3, $4, $5, now())',
        [
          articulo.slug,
          articulo.titulo,
          articulo.contenido,
          tipoTicketId,
          articulo.visibleParaSolicitante,
        ],
      );
      resumen.insertados += 1;
      continue;
    }

    const actual = rows[0];
    const iguales =
      actual.titulo === articulo.titulo &&
      actual.contenido === articulo.contenido &&
      actual.tipo_ticket_id === tipoTicketId &&
      actual.visible_para_solicitante === articulo.visibleParaSolicitante;

    if (iguales) {
      // No se escribe: un UPDATE inútil movería `updated_at` y haría que cada
      // corrida pareciera un cambio real.
      resumen.sinCambios += 1;
      continue;
    }

    // `activo` y `deleted_at` quedan intactos a propósito: si el cliente dio de
    // baja el artículo, el sync no lo resucita.
    await cliente.query(
      'update kb_articulos set titulo = $2, contenido = $3, tipo_ticket_id = $4, ' +
        'visible_para_solicitante = $5, updated_at = now() where slug = $1',
      [
        articulo.slug,
        articulo.titulo,
        articulo.contenido,
        tipoTicketId,
        articulo.visibleParaSolicitante,
      ],
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
  sincronizarTenant,
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

  /** URL del tenant = master con el pathname reemplazado por /db_name. */
  const tenantUrl = (dbName) => {
    const u = new URL(masterUrl);
    u.pathname = '/' + dbName;
    return u.toString();
  };

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

    const masterPool = new Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
    let dbNames;
    try {
      const { rows } = await masterPool.query(
        'select db_name from clientes where activo = true and deleted_at is null order by db_name',
      );
      dbNames = rows.map((r) => r.db_name);
    } finally {
      await masterPool.end();
    }

    if (dbNames.length === 0) {
      console.log('[sync-ayuda] no hay tenants activos, nada que sincronizar');
      return;
    }
    console.log('[sync-ayuda] ' + dbNames.length + ' tenant(s): ' + dbNames.join(', '));

    for (const dbName of dbNames) {
      const pool = new Pool({
        connectionString: tenantUrl(dbName),
        connectionTimeoutMillis: 10000,
      });
      try {
        const resumen = await sincronizarTenant(pool, articulos, (aviso) =>
          console.warn('[sync-ayuda]    aviso: ' + aviso),
        );
        console.log(
          '[sync-ayuda] -> ' +
            dbName +
            ': ' +
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
    }
    console.log('[sync-ayuda] OK, ' + dbNames.length + ' tenant(s) sincronizada(s)');
  })().catch((e) => {
    console.error('[sync-ayuda] ERROR:', e.message);
    process.exit(1);
  });
}
/* c8 ignore stop */
