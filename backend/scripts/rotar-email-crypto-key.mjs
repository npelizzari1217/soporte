// Rotación de `EMAIL_CRYPTO_KEY`: re-cifra todos los secretos que protege esa
// clave (lista `DESTINOS`: la contraseña SMTP de `clientes` y los secretos TOTP
// activo y pendiente de `usuarios_tfa`) de una clave anterior (`OLD_KEY`) a una
// nueva (`NEW_KEY`), preservando el formato `v1` de `AesGcmSecretCipher` sin
// introducir keyring ni `kid`. Todos los destinos van en UNA sola transacción.
//
// Ref proposal/spec: sdd/rotacion-email-crypto-key. Ref design: ADR-1 a
// ADR-5. Ref tasks: WU1 (1.3, 1.4) agregó validación y clasificación. WU2a
// (2a.1-2a.3) agregó la transacción real (`ejecutarRotacion`), `--dry-run` y
// `main()`/CLI. Esta unidad (WU2b, 2b.1) agrega el modo `--verificar`.
//
// El cifrado v1 vive aparte, en `scripts/lib/cifrado-secreto-v1.mjs` (ADR-5):
// ese módulo es puro y tiene su propio test de descifrado cruzado contra
// `AesGcmSecretCipher`; este archivo orquesta validación, clasificación y la
// transacción sobre `pg`.
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { cifrarV1, descifrarV1, leerClaveHex } from './lib/cifrado-secreto-v1.mjs';

/**
 * Destinos cifrados con `EMAIL_CRYPTO_KEY`. `aad` arma el AAD de cada fila a
 * partir de su clave primaria: SMTP usa el `id` del cliente; los secretos TOTP
 * usan `tfa:{usuario_id}` (el mismo que `SecretoTotpCifrado`). Agregar un
 * secreto nuevo cifrado con esta clave es agregar una entrada acá.
 */
export const DESTINOS = [
  { tabla: 'clientes', pk: 'id', columna: 'smtp_password_cifrada', aad: (pk) => String(pk) },
  {
    tabla: 'usuarios_tfa',
    pk: 'usuario_id',
    columna: 'secreto_cifrado',
    aad: (pk) => `tfa:${pk}`,
  },
  {
    tabla: 'usuarios_tfa',
    pk: 'usuario_id',
    columna: 'secreto_pendiente_cifrado',
    aad: (pk) => `tfa:${pk}`,
  },
];

const nombreDestino = (d) => `${d.tabla}.${d.columna}`;
const sqlSeleccion = (d, paraActualizar) =>
  `SELECT ${d.pk} AS pk, ${d.columna} AS payload FROM ${d.tabla} WHERE ${d.columna} IS NOT NULL ORDER BY ${d.pk}` +
  (paraActualizar ? ' FOR UPDATE' : '');

/**
 * Valida `OLD_KEY` y `NEW_KEY` ANTES de abrir cualquier conexión a la base
 * (spec: "Validación de las claves de entrada"): cada una debe decodificar
 * como 64 caracteres hexadecimales (32 bytes), y no pueden ser la misma
 * clave. La igualdad se compara **como bytes** — `'AB…'` y `'ab…'` son la
 * misma clave — para que una rotación con la misma clave en mayúsculas y
 * minúsculas también se rechace.
 *
 * Lanza `Error` ante cualquier incumplimiento; nunca abre `pg.Pool`.
 * @param {unknown} oldKey
 * @param {unknown} newKey
 * @returns {{ oldKeyBuf: Buffer, newKeyBuf: Buffer }}
 */
export function validarClaves(oldKey, newKey) {
  const oldKeyBuf = leerClaveHex(oldKey);
  if (!oldKeyBuf) {
    throw new Error('OLD_KEY inválida: se esperan 64 caracteres hexadecimales');
  }

  const newKeyBuf = leerClaveHex(newKey);
  if (!newKeyBuf) {
    throw new Error('NEW_KEY inválida: se esperan 64 caracteres hexadecimales');
  }

  if (oldKeyBuf.equals(newKeyBuf)) {
    throw new Error(
      'OLD_KEY y NEW_KEY son la misma clave (comparadas como bytes) — no hay nada que rotar',
    );
  }

  return { oldKeyBuf, newKeyBuf };
}

/**
 * Valida `ROTACION_VERIFICAR_KEY` (spec: "Modo `--verificar` de solo
 * lectura"): mismo formato que `OLD_KEY`/`NEW_KEY`, sin comparar contra otra
 * clave. Lanza `Error` antes de abrir cualquier conexión a la base.
 * @param {unknown} verificarKey
 * @returns {Buffer}
 */
export function validarClaveVerificar(verificarKey) {
  const verificarKeyBuf = leerClaveHex(verificarKey);
  if (!verificarKeyBuf) {
    throw new Error('ROTACION_VERIFICAR_KEY inválida: se esperan 64 caracteres hexadecimales');
  }
  return verificarKeyBuf;
}

/**
 * Clasifica una fila de `clientes` según la tabla ADR-1: prueba primero
 * `OLD_KEY`, y solo si falla prueba `NEW_KEY`.
 *
 * - `pendiente`: descifra con `OLD_KEY` (y no se prueba `NEW_KEY`) → hay
 *   que re-cifrarla. Devuelve también el texto plano ya descifrado, para
 *   que `ejecutarRotacion` (WU2a) no tenga que volver a descifrar.
 * - `ya_migrada`: no descifra con `OLD_KEY` pero sí con `NEW_KEY` → no-op
 *   explícito, se cuenta pero no se toca.
 * - `indescifrable`: no descifra con ninguna de las dos claves. Un payload
 *   malformado (≠ 4 segmentos o prefijo ≠ `v1`) también cae acá, porque
 *   `descifrarV1` lanza en ambos intentos.
 *
 * Nunca lanza: el llamador decide qué hacer con `indescifrable` (abortar la
 * corrida entera, ADR-1).
 * @param {{ id: string, smtp_password_cifrada: string }} fila
 * @param {Buffer} oldKeyBuf
 * @param {Buffer} newKeyBuf
 * @returns {{ estado: 'pendiente', textoPlano: string } | { estado: 'ya_migrada' } | { estado: 'indescifrable' }}
 */
export function clasificarFila(fila, oldKeyBuf, newKeyBuf) {
  return clasificarPayload(fila.smtp_password_cifrada, String(fila.id), oldKeyBuf, newKeyBuf);
}

/** Misma clasificación que {@link clasificarFila}, para cualquier destino (payload + AAD). */
export function clasificarPayload(payload, aad, oldKeyBuf, newKeyBuf) {
  try {
    const textoPlano = descifrarV1(oldKeyBuf, payload, aad);
    return { estado: 'pendiente', textoPlano };
  } catch {
    // No descifró con OLD_KEY — sigue probando con NEW_KEY antes de rendirse.
  }

  try {
    descifrarV1(newKeyBuf, payload, aad);
    return { estado: 'ya_migrada' };
  } catch {
    return { estado: 'indescifrable' };
  }
}

/**
 * Construye el resultado de fallo (exit 3, "Datos" según ADR-1): nunca
 * incluye claves ni texto descifrado, solo el `id` (UUID) de la fila y una
 * descripción genérica de la fase que falló.
 * @param {string} motivo
 * @returns {{ exitCode: 3, motivo: string }}
 */
function falloDeDatos(motivo) {
  return { exitCode: 3, motivo };
}

/**
 * Ejecuta la rotación completa (o su simulación en `--dry-run`) en **una
 * sola** transacción sobre **una sola** conexión (`client = await
 * pool.connect()`, ADR-2) — con `pool.query` cada sentencia podría ir por
 * una conexión distinta y el `BEGIN` no protegería nada.
 *
 * Orden: `BEGIN` (`READ ONLY` en dry-run) → `SELECT … FOR UPDATE` (omitido
 * en dry-run: Postgres rechaza `FOR UPDATE` en una transacción de solo
 * lectura) → clasificar cada fila con {@link clasificarFila} → re-cifrar las
 * `pendiente` (`UPDATE … WHERE id=$1 AND smtp_password_cifrada=$2`, exige
 * `rowCount===1`) → releer TODAS las filas no nulas y verificar que
 * descifran con `NEW_KEY` reproduciendo el texto plano guardado en memoria
 * → `COMMIT` (o `ROLLBACK` si es dry-run o si algo falló).
 *
 * Alcance de filas: `smtp_password_cifrada IS NOT NULL`, sin filtrar por
 * `deleted_at` — un cliente soft-deleted que se restaure no puede quedar con
 * una credencial indescifrable (ADR-1).
 * @param {import('pg').Pool} pool
 * @param {{ oldKeyBuf: Buffer, newKeyBuf: Buffer, modo: 'rotar' | 'dry-run' }} opciones
 * @param {{ cifrar?: typeof cifrarV1 }} [deps] `deps.cifrar` existe SOLO para
 *   que el test inyecte un ciphertext corrupto y fuerce el fallo del
 *   round-trip después de un `UPDATE` real.
 * @returns {Promise<{ exitCode: 0, migradas: number, yaMigradas: number } | { exitCode: 1 | 3, motivo: string }>}
 */
export async function ejecutarRotacion(pool, opciones, deps = {}) {
  const cifrar = deps.cifrar ?? cifrarV1;
  const { oldKeyBuf, newKeyBuf, modo } = opciones;
  const esDryRun = modo === 'dry-run';
  const client = await pool.connect();

  try {
    await client.query(esDryRun ? 'BEGIN READ ONLY' : 'BEGIN');

    let migradas = 0;
    let yaMigradas = 0;
    const textosPlanosEsperados = new Map();

    for (const destino of DESTINOS) {
      // `FOR UPDATE` se omite en dry-run: Postgres lo rechaza en READ ONLY.
      const { rows } = await client.query(sqlSeleccion(destino, !esDryRun));

      for (const fila of rows) {
        const id = String(fila.pk);
        const aad = destino.aad(fila.pk);
        const clave = `${nombreDestino(destino)}:${id}`;
        const clasificacion = clasificarPayload(fila.payload, aad, oldKeyBuf, newKeyBuf);

        if (clasificacion.estado === 'indescifrable') {
          await client.query('ROLLBACK');
          return falloDeDatos(
            `${nombreDestino(destino)} ${id}: indescifrable con OLD_KEY y con NEW_KEY`,
          );
        }

        if (clasificacion.estado === 'ya_migrada') {
          yaMigradas++;
          continue;
        }

        // estado === 'pendiente'
        const nuevoPayload = cifrar(newKeyBuf, clasificacion.textoPlano, aad);
        textosPlanosEsperados.set(clave, clasificacion.textoPlano);

        if (esDryRun) {
          // Round-trip SOLO en memoria — ningún UPDATE (spec: "--dry-run no escribe nada").
          let planoRedescifrado;
          try {
            planoRedescifrado = descifrarV1(newKeyBuf, nuevoPayload, aad);
          } catch {
            await client.query('ROLLBACK');
            return falloDeDatos(`${clave}: round-trip en memoria (dry-run) no descifró`);
          }
          if (planoRedescifrado !== clasificacion.textoPlano) {
            await client.query('ROLLBACK');
            return falloDeDatos(`${clave}: round-trip en memoria (dry-run) no coincide`);
          }
          migradas++;
          continue;
        }

        const resultadoUpdate = await client.query(
          `UPDATE ${destino.tabla} SET ${destino.columna} = $1 WHERE ${destino.pk} = $2 AND ${destino.columna} = $3`,
          [nuevoPayload, fila.pk, fila.payload],
        );
        if (resultadoUpdate.rowCount !== 1) {
          await client.query('ROLLBACK');
          return falloDeDatos(`${clave}: UPDATE no afectó exactamente una fila`);
        }
        migradas++;
      }
    }

    if (!esDryRun) {
      // Verificación round-trip contra la base (ADR-2): relee TODAS las
      // filas no nulas de TODOS los destinos, dentro de la misma transacción,
      // y confirma que descifran con NEW_KEY reproduciendo el texto plano guardado.
      for (const destino of DESTINOS) {
        const relectura = await client.query(sqlSeleccion(destino, false));
        for (const fila of relectura.rows) {
          const id = String(fila.pk);
          const clave = `${nombreDestino(destino)}:${id}`;
          let plano;
          try {
            plano = descifrarV1(newKeyBuf, fila.payload, destino.aad(fila.pk));
          } catch {
            await client.query('ROLLBACK');
            return falloDeDatos(`${clave}: la relectura no descifra con NEW_KEY`);
          }
          const esperado = textosPlanosEsperados.get(clave);
          if (esperado !== undefined && plano !== esperado) {
            await client.query('ROLLBACK');
            return falloDeDatos(`${clave}: la relectura no reproduce el texto plano original`);
          }
        }
      }
    }

    await client.query(esDryRun ? 'ROLLBACK' : 'COMMIT');
    return { exitCode: 0, migradas, yaMigradas };
  } catch (error) {
    // Exit 1 (ADR-1, "Inesperado"): conexión o SQL. Si el COMMIT mismo
    // falló, el resultado es ambiguo — la recuperación queda en manos de
    // `--verificar` (WU2b) y el `.ps1` (WU3, ADR-4).
    try {
      await client.query('ROLLBACK');
    } catch {
      // La conexión ya puede estar rota — no hay nada más que intentar.
    }
    return { exitCode: 1, motivo: error.message };
  } finally {
    client.release();
  }
}

/**
 * Modo `--verificar`: dentro de `BEGIN READ ONLY` … `ROLLBACK` (nunca
 * escribe por construcción), comprueba que toda fila no nula de todos los destinos descifra con
 * `verificarKeyBuf` usando su AAD. Nunca imprime la clave ni
 * texto descifrado — solo el `id` de la fila que falla, como
 * {@link falloDeDatos}.
 * @param {import('pg').Pool} pool
 * @param {{ verificarKeyBuf: Buffer }} opciones
 * @returns {Promise<{ exitCode: 0 } | { exitCode: 1 | 3, motivo: string }>}
 */
export async function ejecutarVerificacion(pool, opciones) {
  const { verificarKeyBuf } = opciones;
  const client = await pool.connect();

  try {
    await client.query('BEGIN READ ONLY');

    for (const destino of DESTINOS) {
      const { rows } = await client.query(sqlSeleccion(destino, false));
      for (const fila of rows) {
        try {
          descifrarV1(verificarKeyBuf, fila.payload, destino.aad(fila.pk));
        } catch {
          await client.query('ROLLBACK');
          return falloDeDatos(
            `${nombreDestino(destino)} ${String(fila.pk)}: indescifrable con la clave de --verificar`,
          );
        }
      }
    }

    await client.query('ROLLBACK');
    return { exitCode: 0 };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // La conexión ya puede estar rota — no hay nada más que intentar.
    }
    return { exitCode: 1, motivo: error.message };
  } finally {
    client.release();
  }
}

/** Parsea los argv del CLI. Flags soportados: `--dry-run` y `--verificar`
 * (mutuamente excluyentes). */
function parsearArgs(argv) {
  const args = argv.slice(2);
  const flagsConocidos = new Set(['--dry-run', '--verificar']);
  const desconocido = args.find((arg) => !flagsConocidos.has(arg));
  if (desconocido) {
    throw new Error(`Flag desconocido: ${desconocido}`);
  }
  const dryRun = args.includes('--dry-run');
  const verificar = args.includes('--verificar');
  if (dryRun && verificar) {
    throw new Error('--dry-run y --verificar son mutuamente excluyentes');
  }
  return { dryRun, verificar };
}

async function main() {
  // No carga `.env` (ADR-3): las claves y DATABASE_URL_MASTER llegan solo por el
  // entorno que arma el `.ps1`, así el script nunca toma la clave vigente del archivo.
  let opcionesCli;
  try {
    opcionesCli = parsearArgs(process.argv);
  } catch (e) {
    console.error('[rotar-email-crypto-key] ' + e.message);
    process.exit(2);
    return;
  }

  const connectionString = process.env.DATABASE_URL_MASTER;
  if (!connectionString) {
    console.error('[rotar-email-crypto-key] falta DATABASE_URL_MASTER');
    process.exit(2);
    return;
  }

  if (opcionesCli.verificar) {
    let verificarKeyBuf;
    try {
      verificarKeyBuf = validarClaveVerificar(process.env.ROTACION_VERIFICAR_KEY);
    } catch (e) {
      console.error('[rotar-email-crypto-key] ' + e.message);
      process.exit(2);
      return;
    }

    const poolVerificar = new pg.Pool({ connectionString });
    try {
      const resultado = await ejecutarVerificacion(poolVerificar, { verificarKeyBuf });
      if (resultado.exitCode !== 0) {
        console.error('[rotar-email-crypto-key] --verificar: ' + resultado.motivo);
        process.exit(resultado.exitCode);
        return;
      }
      console.log(
        '[rotar-email-crypto-key] --verificar: todas las filas descifran con la clave dada',
      );
    } catch (e) {
      console.error('[rotar-email-crypto-key] Error inesperado: ' + e.message);
      process.exit(1);
    } finally {
      await poolVerificar.end();
    }
    return;
  }

  // ADR-3: nunca lee EMAIL_CRYPTO_KEY del entorno; solo estas variables
  // acotadas a la invocación, que el `.ps1` setea y borra en un `finally`.
  let claves;
  try {
    claves = validarClaves(process.env.ROTACION_OLD_KEY, process.env.ROTACION_NEW_KEY);
  } catch (e) {
    console.error('[rotar-email-crypto-key] ' + e.message);
    process.exit(2);
    return;
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const resultado = await ejecutarRotacion(pool, {
      oldKeyBuf: claves.oldKeyBuf,
      newKeyBuf: claves.newKeyBuf,
      modo: opcionesCli.dryRun ? 'dry-run' : 'rotar',
    });

    if (resultado.exitCode !== 0) {
      console.error('[rotar-email-crypto-key] ' + resultado.motivo);
      process.exit(resultado.exitCode);
      return;
    }

    console.log(
      `[rotar-email-crypto-key] migradas=${resultado.migradas} ya_migradas=${resultado.yaMigradas}` +
        (opcionesCli.dryRun ? ' (--dry-run: sin cambios persistidos)' : ''),
    );
  } catch (e) {
    console.error('[rotar-email-crypto-key] Error inesperado: ' + e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Solo corre la rotación real si el archivo se invoca directamente — así
// los tests pueden importar las funciones sin conectarse a ninguna base.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
