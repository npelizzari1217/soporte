// Backfill 5.2 (one-off): asigna los 4 módulos a todas las membresías activas.
// Idempotente (ON CONFLICT DO NOTHING en el SQL). Carga backend/.env en el
// proceso vía process.loadEnvFile (Node 22+) — no expone el secreto fuera de acá.
import { readFileSync } from 'node:fs';
import pg from 'pg';

process.loadEnvFile('.env');
const connectionString = process.env.DATABASE_URL_MASTER;
if (!connectionString) {
  console.error('Falta DATABASE_URL_MASTER en backend/.env');
  process.exit(1);
}

const sql = readFileSync('scripts/backfill-modulos-5.2.sql', 'utf8');
const pool = new pg.Pool({ connectionString });
try {
  const res = await pool.query(sql);
  const total = await pool.query('SELECT COUNT(*)::int AS n FROM usuario_cliente_modulos');
  console.log('Filas insertadas esta corrida:', res.rowCount);
  console.log('Total filas en usuario_cliente_modulos:', total.rows[0].n);
} catch (e) {
  console.error('Error en el backfill:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
