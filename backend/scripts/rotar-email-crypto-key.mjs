// Rotación de `EMAIL_CRYPTO_KEY`: re-cifra `clientes.smtp_password_cifrada`
// de una clave anterior (`OLD_KEY`) a una nueva (`NEW_KEY`), preservando el
// formato `v1` de `AesGcmSecretCipher` sin introducir keyring ni `kid`.
//
// Ref proposal/spec: sdd/rotacion-email-crypto-key. Ref design: ADR-1 a
// ADR-5. Ref tasks: WU1 (1.3, 1.4) agregó validación y clasificación. Esta
// unidad (WU2a, 2a.1-2a.3) agrega la transacción real (`ejecutarRotacion`),
// `--dry-run` y `main()`/CLI. `--verificar` llega en WU2b.
//
// El cifrado v1 vive aparte, en `scripts/lib/cifrado-secreto-v1.mjs` (ADR-5):
// ese módulo es puro y tiene su propio test de descifrado cruzado contra
// `AesGcmSecretCipher`; este archivo orquesta validación, clasificación y la
// transacción sobre `pg`.
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { cifrarV1, descifrarV1, leerClaveHex } from './lib/cifrado-secreto-v1.mjs';

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
  const aad = String(fila.id);
  const payload = fila.smtp_password_cifrada;

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

    const selectSql = esDryRun
      ? `SELECT id, smtp_password_cifrada FROM clientes WHERE smtp_password_cifrada IS NOT NULL ORDER BY id`
      : `SELECT id, smtp_password_cifrada FROM clientes WHERE smtp_password_cifrada IS NOT NULL ORDER BY id FOR UPDATE`;
    const { rows } = await client.query(selectSql);

    let migradas = 0;
    let yaMigradas = 0;
    const textosPlanosEsperados = new Map();

    for (const fila of rows) {
      const id = String(fila.id);
      const clasificacion = clasificarFila(fila, oldKeyBuf, newKeyBuf);

      if (clasificacion.estado === 'indescifrable') {
        await client.query('ROLLBACK');
        return falloDeDatos(`fila ${id}: indescifrable con OLD_KEY y con NEW_KEY`);
      }

      if (clasificacion.estado === 'ya_migrada') {
        yaMigradas++;
        continue;
      }

      // estado === 'pendiente'
      const nuevoPayload = cifrar(newKeyBuf, clasificacion.textoPlano, id);
      textosPlanosEsperados.set(id, clasificacion.textoPlano);

      if (esDryRun) {
        // Round-trip SOLO en memoria — ningún UPDATE (spec: "--dry-run no escribe nada").
        let planoRedescifrado;
        try {
          planoRedescifrado = descifrarV1(newKeyBuf, nuevoPayload, id);
        } catch {
          await client.query('ROLLBACK');
          return falloDeDatos(`fila ${id}: round-trip en memoria (dry-run) no descifró`);
        }
        if (planoRedescifrado !== clasificacion.textoPlano) {
          await client.query('ROLLBACK');
          return falloDeDatos(`fila ${id}: round-trip en memoria (dry-run) no coincide`);
        }
        migradas++;
        continue;
      }

      const resultadoUpdate = await client.query(
        `UPDATE clientes SET smtp_password_cifrada = $1 WHERE id = $2 AND smtp_password_cifrada = $3`,
        [nuevoPayload, fila.id, fila.smtp_password_cifrada],
      );
      if (resultadoUpdate.rowCount !== 1) {
        await client.query('ROLLBACK');
        return falloDeDatos(`fila ${id}: UPDATE no afectó exactamente una fila`);
      }
      migradas++;
    }

    if (!esDryRun) {
      // Verificación round-trip contra la base (ADR-2): relee TODAS las
      // filas no nulas, dentro de la misma transacción, y confirma que
      // descifran con NEW_KEY reproduciendo el texto plano guardado.
      const relectura = await client.query(
        `SELECT id, smtp_password_cifrada FROM clientes WHERE smtp_password_cifrada IS NOT NULL ORDER BY id`,
      );
      for (const fila of relectura.rows) {
        const id = String(fila.id);
        let plano;
        try {
          plano = descifrarV1(newKeyBuf, fila.smtp_password_cifrada, id);
        } catch {
          await client.query('ROLLBACK');
          return falloDeDatos(`fila ${id}: la relectura no descifra con NEW_KEY`);
        }
        const esperado = textosPlanosEsperados.get(id);
        if (esperado !== undefined && plano !== esperado) {
          await client.query('ROLLBACK');
          return falloDeDatos(`fila ${id}: la relectura no reproduce el texto plano original`);
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

/** Parsea los argv del CLI. Único flag soportado por ahora: `--dry-run`. */
function parsearArgs(argv) {
  const args = argv.slice(2);
  const desconocido = args.find((arg) => arg !== '--dry-run');
  if (desconocido) {
    throw new Error(`Flag desconocido: ${desconocido}`);
  }
  return { dryRun: args.includes('--dry-run') };
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
