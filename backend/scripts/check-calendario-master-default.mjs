// Precondicion de deploy (D18, sdd/horario-laboral-por-cliente) — SOLO
// LECTURA. Antes de correr el seed de `calendario_laboral_dias_cliente`
// (WU-1, migracion 20260928150000) hay que confirmar que la master de
// produccion TODAVIA esta en el default lun-vie 540-1080 (9-18hs) y
// sab/dom NULL: el seed es FIJO y NUNCA lee master, asi que el riesgo es el
// inverso — si alguien la cambio a mano, el deploy cambiaria en silencio el
// horario vigente (y el sla_vence_at) de TODOS los clientes al valor fijo
// del seed.
//
// Correccion del 2026-09-29 (fix W5, verify-report.md): antes decia que el
// seed nuevo "copiaria" un horario ajeno. El seed nunca lee master.
//
// No crea, edita ni borra nada: un solo SELECT contra
// `calendario_laboral_dias` en master. Exit 0 = default confirmado.
// Exit 1 = alguna fila difiere del default, o la tabla no existe —
// imprime la diferencia exacta y `deploy.ps1` aborta con `AssertOk`
// ANTES de tocar los servicios (ver D18 y el paso nuevo en deploy.ps1).
//
// `chequearDefaultMaster(query)` recibe la consulta como funcion inyectada
// (mismo criterio que `ejecutarBackfill(pool, config)` en
// backfill-correo-clientes.mjs): separa la logica pura, testeable sin una
// base real, de la conexion real que solo usa `main()`.
import pg from 'pg';
import { pathToFileURL } from 'node:url';

// dia_semana: 0 = domingo … 6 = sabado (mismo orden que el CHECK de la
// tabla). Espeja el seed de `prisma_master/schema.prisma` y de la
// migracion 20260928150000 (D1): lun-vie 09:00-18:00 (540-1080 minutos),
// sab/dom sin horario (NULL/NULL).
const DEFAULT_FILAS = [
  { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
  { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
];

/** Codigo de Postgres para "undefined_table" (la tabla no existe). */
const CODIGO_TABLA_AUSENTE = '42P01';

/**
 * Compara las filas leidas contra el default exacto (D18). Pura: no toca
 * la base. `filas` usa las columnas crudas de la consulta (`dia_semana`,
 * `apertura_minuto`, `cierre_minuto`), sin pasar por el mapper de Prisma.
 */
export function compararConDefault(filas) {
  if (filas.length !== 7) {
    return {
      ok: false,
      motivo: `se esperaban 7 filas en calendario_laboral_dias, se encontraron ${filas.length}`,
    };
  }

  const porDia = new Map(filas.map((f) => [f.dia_semana, f]));
  const diferencias = [];

  for (const esperada of DEFAULT_FILAS) {
    const fila = porDia.get(esperada.diaSemana);
    if (!fila) {
      diferencias.push(`falta la fila dia_semana=${esperada.diaSemana}`);
      continue;
    }
    if (
      fila.apertura_minuto !== esperada.aperturaMinuto ||
      fila.cierre_minuto !== esperada.cierreMinuto
    ) {
      diferencias.push(
        `dia_semana=${esperada.diaSemana}: esperado apertura=${esperada.aperturaMinuto} ` +
          `cierre=${esperada.cierreMinuto}, encontrado apertura=${fila.apertura_minuto} ` +
          `cierre=${fila.cierre_minuto}`,
      );
    }
  }

  if (diferencias.length > 0) {
    return { ok: false, motivo: diferencias.join('; ') };
  }
  return { ok: true };
}

/**
 * Corre `query()` (la consulta inyectada) y evalua el resultado contra el
 * default. Si `query()` lanza "undefined_table" (42P01), lo traduce a un
 * resultado `ok: false` en vez de propagar la excepcion — la tabla ausente
 * es exactamente el caso que esta precondicion existe para bloquear, no un
 * error de infraestructura distinto.
 */
export async function chequearDefaultMaster(query) {
  let filas;
  try {
    filas = await query();
  } catch (e) {
    if (e && e.code === CODIGO_TABLA_AUSENTE) {
      return {
        ok: false,
        motivo: 'la tabla calendario_laboral_dias no existe en master (falta la migracion)',
      };
    }
    throw e;
  }
  return compararConDefault(filas);
}

// ── Entry point ──

async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env ausente: se usan las variables ya presentes en el entorno.
  }

  const connectionString = process.env.DATABASE_URL_MASTER;
  if (!connectionString) {
    console.error('[check-calendario-master-default] falta DATABASE_URL_MASTER');
    process.exit(1);
    return;
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const resultado = await chequearDefaultMaster(async () => {
      const { rows } = await pool.query(
        'SELECT dia_semana, apertura_minuto, cierre_minuto FROM calendario_laboral_dias ORDER BY dia_semana',
      );
      return rows;
    });

    if (!resultado.ok) {
      console.error('[check-calendario-master-default] ' + resultado.motivo);
      process.exit(1);
      return;
    }
    console.log(
      '[check-calendario-master-default] OK: master en el default (lun-vie 540-1080, sab/dom NULL)',
    );
  } catch (e) {
    console.error('[check-calendario-master-default] ERROR: ' + e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Solo corre el chequeo real si el archivo se invoca directamente — asi el
// spec puede importar `compararConDefault`/`chequearDefaultMaster` sin
// conectarse a ninguna base.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
