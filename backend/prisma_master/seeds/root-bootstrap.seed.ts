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
 *   - `ROOT_ADMIN_TOTP_SECRET` (opcional, L10): activa el 2FA del ROOT con un secreto
 *     CONOCIDO, solo si `NODE_ENV` vale exactamente `development` o `test` (lista
 *     positiva, fail-closed). Con la variable presente y `NODE_ENV` ausente (el VPS),
 *     `production` o cualquier otro valor, el seed termina con error ANTES de tocar la
 *     base: un secreto conocido en el VPS sería una puerta trasera. Sin la variable, el
 *     ROOT pasa por la configuración forzada del 2FA en su primer login.
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
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_EMAIL_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from '../../src/auth/domain/entities/usuario.entity';
import { SecretoTotpCifrado } from '../../src/auth/application/tfa/secreto-totp-cifrado';
import { AesGcmSecretCipher } from '../../src/shared/infrastructure/crypto/aes-gcm-secret-cipher';
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

/**
 * Lee una env obligatoria y verifica que entre en su columna.
 *
 * POR QUÉ existe: este seed escribe `usuarios.*` DIRECTO por Prisma, sin pasar
 * por `UsuarioEntity`, así que el guard de largo del dominio no lo cubre. Sin
 * esto, un `ROOT_ADMIN_NOMBRE` de 150 caracteres llegaba a la columna
 * `VarChar(100)` y el deploy moría con un 22001 del driver — un error que NO
 * nombra la variable culpable, justo en el peor momento para adivinar.
 *
 * El tope se importa del dominio, no se escribe acá: es la misma autoridad que
 * usan `CreateUsuarioTenantDto` y `CreateClienteDto`. Si la columna se ensancha,
 * este seed la sigue solo.
 *
 * @param name - Nombre de la variable de entorno, tal cual aparece en `.env`. Se
 *   usa en el mensaje de error, así que tiene que ser el nombre real y no un
 *   alias: es lo único que le dice al operador cuál de las cuatro corregir.
 * @param max - Tope de caracteres, importado del dominio.
 * @returns El valor de la variable, ya verificado que entra en su columna.
 * @throws Error si la variable falta, está vacía, o supera `max`.
 */
export function requireEnvConTope(name: string, max: number): string {
  const value = requireEnv(name);
  if (value.length > max) {
    throw new Error(
      `[root-bootstrap] ${name} tiene ${value.length} caracteres y el máximo es ${max}.`,
    );
  }
  return value;
}

/** Datos del root de bootstrap, leídos de env (`ROOT_ADMIN_*`). */
export interface RootBootstrapEnv {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  /** Secreto TOTP conocido (base32), solo para `development` y `test`. */
  totpSecret?: string;
}

/** Entornos donde se honra `ROOT_ADMIN_TOTP_SECRET` (lista positiva, fail-closed). */
const ENTORNOS_CON_TOTP_CONOCIDO: readonly string[] = ['development', 'test'];

/**
 * Rechaza `ROOT_ADMIN_TOTP_SECRET` fuera de la lista positiva. Se llama ANTES de cualquier
 * acceso a la base. Un guard `!== 'production'` fallaría abierto con `NODE_ENV` ausente.
 */
export function assertTotpPermitido(
  totpSecret: string | undefined,
  nodeEnv: string | undefined,
): void {
  if (totpSecret === undefined) return;
  if (nodeEnv === undefined || !ENTORNOS_CON_TOTP_CONOCIDO.includes(nodeEnv)) {
    throw new Error(
      `[root-bootstrap] ROOT_ADMIN_TOTP_SECRET solo se admite con NODE_ENV=development o test ` +
        `(NODE_ENV actual: ${nodeEnv ?? 'ausente'}). Quitá la variable: un secreto conocido ` +
        `fuera de desarrollo es una puerta trasera.`,
    );
  }
  if (!/^[A-Z2-7]{16,}$/.test(totpSecret)) {
    throw new Error(
      '[root-bootstrap] ROOT_ADMIN_TOTP_SECRET debe ser base32 (A-Z, 2-7), 16+ caracteres.',
    );
  }
}

/** Agrupa las 4 env `ROOT_ADMIN_*` — falta cualquiera → throw (R2). */
export function readRootBootstrapEnv(): RootBootstrapEnv {
  return {
    email: requireEnvConTope('ROOT_ADMIN_EMAIL', USUARIO_EMAIL_MAX_LENGTH),
    // `password` NO lleva tope: se persiste hasheada (argon2id), así que lo que
    // llega a la columna tiene largo fijo y no depende de lo que se tipeó.
    password: requireEnv('ROOT_ADMIN_PASSWORD'),
    nombre: requireEnvConTope('ROOT_ADMIN_NOMBRE', USUARIO_NOMBRE_MAX_LENGTH),
    apellido: requireEnvConTope('ROOT_ADMIN_APELLIDO', USUARIO_APELLIDO_MAX_LENGTH),
    totpSecret: process.env.ROOT_ADMIN_TOTP_SECRET?.trim() || undefined,
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
 * @param entorno       Entorno cuyo `NODE_ENV` valida se valida `env.totpSecret` (L10).
 * @param secretos      Cifrador del secreto TOTP (AAD `tfa:{usuarioId}`, `EMAIL_CRYPTO_KEY`).
 * @throws RootBootstrapAccountInactiveError si `env.email` ya existe pero está
 *   suspendida o soft-deleted.
 */
export async function bootstrapRoot(
  masterClient: InstanceType<typeof MasterPrismaClient>,
  env: RootBootstrapEnv,
  hashProvider: IHashProvider = new Argon2HashProvider(),
  entorno: Record<string, string | undefined> = process.env,
  secretos: SecretoTotpCifrado = new SecretoTotpCifrado(new AesGcmSecretCipher()),
): Promise<void> {
  // L10: antes de cualquier lectura o escritura en la base.
  assertTotpPermitido(env.totpSecret, entorno.NODE_ENV);

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
    await activarTotp(masterClient, secretos, existing.id, env.totpSecret);
    return;
  }

  // create: fila nueva con isGlobalAdmin=true, activo=true, sin membresía ni rol.
  // Hash argon2id calculado SOLO acá, donde realmente se persiste.
  const passwordHash = await hashProvider.hash(env.password);
  const creado = await masterClient.usuario.create({
    data: {
      email: env.email,
      nombre: env.nombre,
      apellido: env.apellido,
      passwordHash,
      activo: true,
      isGlobalAdmin: true,
    },
  });
  await activarTotp(masterClient, secretos, creado.id, env.totpSecret);
}

/** Deja el 2FA del ROOT activo con el secreto conocido (solo si se pidió y ya pasó el guard). */
async function activarTotp(
  masterClient: InstanceType<typeof MasterPrismaClient>,
  secretos: SecretoTotpCifrado,
  usuarioId: string,
  totpSecret: string | undefined,
): Promise<void> {
  if (totpSecret === undefined) return;
  const secretoCifrado = secretos.cifrar(usuarioId, totpSecret);
  const datos = {
    secretoCifrado,
    confirmadoAt: new Date(),
    ultimoPaso: 0,
    secretoPendienteCifrado: null,
    pendienteCreadoAt: null,
  };
  await masterClient.usuarioTfa.upsert({
    where: { usuarioId },
    create: { usuarioId, ...datos },
    update: datos,
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
