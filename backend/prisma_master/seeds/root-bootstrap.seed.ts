/**
 * root-bootstrap.seed.ts — bootstrap idempotente del primer usuario ROOT.
 *
 * ROOT NO es un rol de `roles` (esos son USUARIO/COLABORADOR/TECNICO/ADMINISTRADOR,
 * ver `20260805110000_seed_rbac_4_roles_permisos`) — es `usuarios.is_global_admin`
 * (ADR-1). El primer usuario root del sistema se crea vía este seed, leyendo
 * TODAS sus credenciales de variables de entorno (`ROOT_ADMIN_*`), nunca de
 * literales en el código.
 *
 * Contrato (spec R2):
 *   - Falta cualquier `ROOT_ADMIN_*` → throw ruidoso (nunca un no-op silencioso).
 *   - Idempotente por `email` (UNIQUE en `usuarios.email`):
 *     · no existe la fila → la crea con `isGlobalAdmin=true`, `activo=true`,
 *       password argon2id, SIN membresía ni rol RBAC.
 *     · ya existe y está viva (`activo=true && deletedAt IS NULL`) → se deja
 *       INTACTA (no se re-hashea el password ni se pisan otras columnas) —
 *       correr el seed dos veces no crea un segundo root ni cambia el hash.
 *     · ya existe pero está suspendida o soft-deleted (`activo=false` o
 *       `deletedAt != null`) → MUST throw con un mensaje claro. A diferencia
 *       de soporte1 (que reactivaba la cuenta), acá se prefiere fallar
 *       ruidosamente: reactivar en silencio una cuenta dada de baja mediante
 *       un seed de bootstrap es una operación de negocio distinta a
 *       "garantizar que exista un root", y merece decisión explícita del
 *       dueño (borrar la fila o correr una reactivación manual), no un efecto
 *       secundario de re-ejecutar el seed en cada deploy.
 *   - El password en texto plano MUST NOT loguearse nunca (no hay ningún
 *     `console.log`/`Logger` que reciba `env.password` en este archivo).
 *
 * Uso (post `migrate:master`):
 *   pnpm run seed:root
 *
 * Ref spec: sdd/auth-multitenancy/spec §R2
 * Ref design: sdd/auth-multitenancy/design ADR-1, ADR-8 (argon2id m=19456,t=2,p=1)
 * Tareas: T1.4, T1.5 (PR1)
 */
import { Argon2HashProvider } from '../../src/auth/infrastructure/argon2-hash.provider';
import { IHashProvider } from '../../src/auth/domain/ports/i-hash.provider';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';

/** Lee una env obligatoria o falla ruidosamente (R2: nada hardcodeado, sin no-op silencioso). */
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
}

/** Agrupa las 4 env `ROOT_ADMIN_*` — falta cualquiera → throw (R2). */
export function readRootBootstrapEnv(): RootBootstrapEnv {
  return {
    email: requireEnv('ROOT_ADMIN_EMAIL'),
    password: requireEnv('ROOT_ADMIN_PASSWORD'),
    nombre: requireEnv('ROOT_ADMIN_NOMBRE'),
    apellido: requireEnv('ROOT_ADMIN_APELLIDO'),
  };
}

/**
 * Error explícito cuando `ROOT_ADMIN_EMAIL` apunta a una cuenta suspendida o
 * soft-deleted — el seed NO la reactiva en silencio (ver comentario de
 * cabecera del archivo).
 */
export class RootBootstrapAccountInactiveError extends Error {
  constructor(email: string) {
    super(
      `[root-bootstrap] La cuenta "${email}" existe pero está inactiva o borrada ` +
        `(activo=false o deleted_at != null). El seed de bootstrap NO reactiva ` +
        `cuentas existentes — decisión explícita requerida (reactivar manualmente ` +
        `o usar otro ROOT_ADMIN_EMAIL).`,
    );
    this.name = 'RootBootstrapAccountInactiveError';
  }
}

/**
 * Bootstrapea el primer usuario root de forma idempotente.
 *
 * `masterClient` y `hashProvider` se reciben como parámetros (en lugar de
 * instanciarse acá) para que el script sea testeable contra una DB real de
 * test sin duplicar wiring de infraestructura.
 *
 * @param masterClient  Cliente Prisma de la DB master (usuarios).
 * @param env           Datos del root leídos de env (`readRootBootstrapEnv()`).
 * @param hashProvider  Puerto de hashing — Argon2HashProvider real en producción.
 * @throws RootBootstrapAccountInactiveError si `env.email` ya existe pero está
 *   suspendida o soft-deleted.
 */
export async function bootstrapRoot(
  masterClient: InstanceType<typeof MasterPrismaClient>,
  env: RootBootstrapEnv,
  hashProvider: IHashProvider = new Argon2HashProvider(),
): Promise<void> {
  // Idempotente por email (UNIQUE): findUnique primero para decidir
  // create vs no-op SIN hashear salvo que se vaya a crear la fila (el
  // argon2id hash es costoso y el camino existente lo descartaría igual).
  const existing = await masterClient.usuario.findUnique({ where: { email: env.email } });

  if (existing) {
    if (!existing.activo || existing.deletedAt !== null) {
      throw new RootBootstrapAccountInactiveError(env.email);
    }
    // Cuenta viva y ya root-capaz (o no) — se deja INTACTA: ni se re-hashea
    // el password ni se pisan nombre/apellido. isGlobalAdmin NO se fuerza acá
    // a propósito: si alguien lo bajó a false manualmente, ese es un cambio
    // de negocio consciente que este seed no debe revertir en cada deploy.
    return;
  }

  // create: fila nueva con isGlobalAdmin=true, activo=true, sin membresía ni rol.
  // Hash argon2id calculado SOLO acá, donde realmente se persiste.
  const passwordHash = await hashProvider.hash(env.password);
  await masterClient.usuario.create({
    data: {
      email: env.email,
      nombre: env.nombre,
      apellido: env.apellido,
      passwordHash,
      activo: true,
      isGlobalAdmin: true,
    },
  });
}

// ─── Ejecución directa (ts-node) ───────────────────────────────────────────────
// Node 22+: carga .env sin dependencias adicionales. En CI/prod las env vars
// ya están en el entorno real, por eso el try/catch (no debe fallar si no hay
// archivo .env). Mismo patrón que prisma_master/seeds/demo-seed.ts.
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
