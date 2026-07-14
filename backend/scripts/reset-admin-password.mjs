/**
 * reset-admin-password.mjs — recuperación de acceso admin (DB master).
 *
 * Uso (correr SIEMPRE desde backend/, con DATABASE_URL_MASTER apuntando a la DB real):
 *
 *   # 1) Listar usuarios admin para recuperar el email olvidado:
 *   DATABASE_URL_MASTER="postgresql://..." node scripts/reset-admin-password.mjs list
 *
 *   # 2) Resetear la contraseña de un usuario por email:
 *   DATABASE_URL_MASTER="postgresql://..." node scripts/reset-admin-password.mjs reset admin@empresa.com 'NuevaClaveSegura123'
 *
 * Genera el hash con @node-rs/argon2 y los MISMOS parámetros que el login
 * (argon2id, m=19456, t=2, p=1). No toca ningún otro campo.
 */
import { hash } from '@node-rs/argon2';
import pg from 'pg';

const { Pool } = pg;

// Parámetros IDÉNTICOS a Argon2HashProvider (spec auth-rbac).
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const url = process.env.DATABASE_URL_MASTER;
if (!url) {
  console.error('ERROR: definí DATABASE_URL_MASTER (cadena de conexión a la DB master).');
  process.exit(1);
}

const [, , cmd, email, newPassword] = process.argv;
const pool = new Pool({ connectionString: url });

async function listAdmins() {
  const { rows } = await pool.query(`
    SELECT u.email, u.nombre, u.apellido, u.activo, u.is_global_admin,
           array_agg(r.codigo ORDER BY r.codigo) AS roles
    FROM usuarios u
    JOIN usuarios_roles ur ON ur.usuario_id = u.id
    JOIN roles r ON r.id = ur.rol_id
    WHERE u.deleted_at IS NULL AND r.codigo = 'ADMIN'
    GROUP BY u.id
    ORDER BY u.created_at
  `);
  if (rows.length === 0) {
    console.log('No hay usuarios con rol ADMIN (¿base sin provisionar?).');
    return;
  }
  console.log(`\nUsuarios con rol ADMIN (${rows.length}):\n`);
  for (const r of rows) {
    console.log(`  • ${r.email}  —  ${r.nombre} ${r.apellido}` +
      `  [activo=${r.activo}, global_admin=${r.is_global_admin}]`);
  }
  console.log('\nElegí el email y corré: node scripts/reset-admin-password.mjs reset <email> \'<nuevaClave>\'\n');
}

async function resetPassword() {
  if (!email || !newPassword) {
    console.error('Uso: reset <email> <nuevaClave>');
    process.exit(1);
  }
  const passwordHash = await hash(newPassword, ARGON2_OPTIONS);
  const { rowCount } = await pool.query(
    `UPDATE usuarios
       SET password_hash = $1, updated_at = now()
     WHERE email = $2 AND deleted_at IS NULL`,
    [passwordHash, email],
  );
  if (rowCount === 0) {
    console.error(`No se encontró un usuario activo con email "${email}". Corré primero "list".`);
    process.exit(1);
  }
  console.log(`✓ Contraseña actualizada para ${email}. Ya podés loguearte con la nueva clave.`);
}

const run = cmd === 'list' ? listAdmins : cmd === 'reset' ? resetPassword : null;
if (!run) {
  console.error('Comando inválido. Usá "list" o "reset <email> <nuevaClave>".');
  process.exit(1);
}

run()
  .catch((err) => { console.error('Error:', err.message); process.exit(1); })
  .finally(() => pool.end());
