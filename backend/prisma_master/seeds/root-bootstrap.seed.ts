/**
 * root-bootstrap.seed.ts — bootstrap idempotente del primer usuario root.
 *
 * Reemplaza en intención al bootstrap frágil previo
 * (`prisma_master/migrations/20260630000000_set_global_admin_nestor`): un
 * `UPDATE` atado a un email hardcodeado, no-op silencioso si la fila no
 * preexistía. Este seed:
 *   - Lee TODAS las credenciales de variables de entorno (`ROOT_ADMIN_*`),
 *     nunca literales en el código (R3 escenario "credenciales nunca
 *     hardcodeadas").
 *   - Falla RUIDOSAMENTE (throw) si falta cualquier env obligatoria — nunca
 *     un no-op silencioso.
 *   - Es idempotente vía `upsert` por `email` (UNIQUE en `usuarios.email`):
 *     crea la fila si no existe (con `isGlobalAdmin=true`, password argon2id,
 *     `activo=true`, sin roles); si ya existe, ACTUALIZA únicamente
 *     `isGlobalAdmin=true` sin pisar `passwordHash`/`nombre`/`apellido`.
 *
 * Uso (post `migrate:master`):
 *   pnpm run seed:root
 *
 * La migración vieja `20260630000000_set_global_admin_nestor` se mantiene en
 * el historial de migraciones (no se borra — romper el historial es inseguro
 * en DBs ya migradas); queda como histórico, superada en intención por este
 * seed.
 *
 * Spec ref: root-tenant-admin R3 (Dz3)
 * Tarea: B.15-B.16
 */

import { Argon2HashProvider } from '../../src/auth/infrastructure/argon2-hash.provider';
import { IHashProvider } from '../../src/auth/domain/ports/i-hash.provider';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';

/** Lee una env obligatoria o falla ruidosamente (R3: nada hardcodeado, sin no-op silencioso). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`[root-bootstrap] Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

/** Datos del root de bootstrap, leídos de env (`ROOT_ADMIN_*`). */
export interface RootBootstrapEnv {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  /** Tenant de origen — `usuarios.cliente_id` es NOT NULL. */
  clienteId: string;
}

/** Agrupa las 5 env `ROOT_ADMIN_*` — falta cualquiera → throw (R3-d). */
export function readRootBootstrapEnv(): RootBootstrapEnv {
  return {
    email: requireEnv('ROOT_ADMIN_EMAIL'),
    password: requireEnv('ROOT_ADMIN_PASSWORD'),
    nombre: requireEnv('ROOT_ADMIN_NOMBRE'),
    apellido: requireEnv('ROOT_ADMIN_APELLIDO'),
    clienteId: requireEnv('ROOT_ADMIN_CLIENTE_ID'),
  };
}

/**
 * Bootstrapea el primer usuario root de forma idempotente.
 *
 * `masterClient` y `hashProvider` se reciben como parámetros (en lugar de
 * instanciarse acá) para que el script sea testeable contra una DB real de
 * test sin duplicar wiring de infraestructura.
 *
 * @param masterClient  Cliente Prisma de la DB master (usuarios, clientes).
 * @param env           Datos del root leídos de env (`readRootBootstrapEnv()`).
 * @param hashProvider  Puerto de hashing — Argon2HashProvider real en producción.
 */
export async function bootstrapRoot(
  masterClient: InstanceType<typeof MasterPrismaClient>,
  env: RootBootstrapEnv,
  hashProvider: IHashProvider = new Argon2HashProvider(),
): Promise<void> {
  const passwordHash = await hashProvider.hash(env.password);

  // Idempotente: upsert por email (UNIQUE).
  //  - create: fila nueva con isGlobalAdmin=true, activo=true, sin roles.
  //  - update: SOLO isGlobalAdmin=true (no pisa password/nombre/otras columnas).
  await masterClient.usuario.upsert({
    where: { email: env.email },
    create: {
      email: env.email,
      nombre: env.nombre,
      apellido: env.apellido,
      passwordHash,
      clienteId: env.clienteId,
      activo: true,
      isGlobalAdmin: true,
    },
    update: { isGlobalAdmin: true },
  });
}

// ─── Ejecución directa (ts-node) ───────────────────────────────────────────────
// Node 22+: carga .env sin dependencias adicionales. En CI/prod las env vars
// ya están en el entorno real, por eso el try/catch (no debe fallar si no hay
// archivo .env). Mismo patrón que prisma_tenant/seeds/tenant-seed.ts.
if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente — se usan las variables del entorno.
  }

  const masterUrl = requireEnv('DATABASE_URL_MASTER');
  const prismaService = new PrismaService(masterUrl);

  bootstrapRoot(prismaService.getMasterClient(), readRootBootstrapEnv())
    .then(() => {
      console.log('[root-bootstrap] OK — root garantizado en master.usuarios.');
    })
    .catch((err) => {
      console.error('[root-bootstrap] Error durante el bootstrap:', err);
      process.exitCode = 1;
    })
    .finally(() => prismaService.onModuleDestroy());
}
