/**
 * reset-password.ts — resetea la contraseña de un usuario existente en
 * `master.usuarios`, para operaciones de soporte (ej. recuperar el acceso
 * del admin en producción).
 *
 * Reemplaza a `C:\soporte\rotate-admin-pw.ps1` (sin versionar en el VPS),
 * que dependía de este archivo y NO EXISTÍA — el script fallaba,
 * `$ErrorActionPreference = 'Stop'` no detenía la ejecución porque el error
 * vino de un comando nativo (ts-node vía `corepack pnpm exec`, no un cmdlet
 * PowerShell), y el `.ps1` igual escribía el archivo de "clave nueva" como si
 * el cambio se hubiera aplicado. Ver `rotate-admin-pw.ps1` (raíz del repo)
 * para el fix del lado PowerShell.
 *
 * PUNTO CRÍTICO: el hash tiene que coincidir EXACTAMENTE con lo que espera
 * `LoginUseCase` al loguear. Por eso este script reusa `Argon2HashProvider`
 * (mismos parámetros argon2id que usa el login) en vez de reimplementar el
 * hashing acá — un hash que no valide contra el verificador real deja al
 * usuario afuera aunque el script reporte éxito, que es exactamente el fallo
 * que este script viene a corregir.
 *
 * Contrato:
 *   - Lee `DATABASE_URL_MASTER`, `RESET_EMAIL`, `RESET_PASSWORD` del entorno.
 *     Falta cualquiera → throw ruidoso (nunca un no-op silencioso), mismo
 *     patrón que `root-bootstrap.seed.ts` (spec R2 de auth-multitenancy).
 *   - El email debe existir en `usuarios` — si no, aborta con exit distinto
 *     de cero en vez de crear un usuario nuevo o salir en silencio.
 *   - La contraseña en texto plano NUNCA se imprime ni se loguea, ni en
 *     claro ni parcial, ni en logs ni en mensajes de error.
 *   - Sale con 0 solo si el UPDATE se aplicó de verdad.
 *
 * Uso:
 *   DATABASE_URL_MASTER=... RESET_EMAIL=admin@x.com RESET_PASSWORD=... \
 *     pnpm exec ts-node scripts/reset-password.ts
 */
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { IHashProvider } from '../src/auth/domain/ports/i-hash.provider';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import { requireEnv } from '../prisma_master/seeds/root-bootstrap.seed';

/** Datos para el reset, leídos de env (`RESET_*`). */
export interface ResetPasswordEnv {
  email: string;
  password: string;
}

/** Agrupa las 2 env `RESET_*` — falta cualquiera → throw (mismo contrato que readRootBootstrapEnv). */
export function readResetPasswordEnv(): ResetPasswordEnv {
  return {
    email: requireEnv('RESET_EMAIL'),
    password: requireEnv('RESET_PASSWORD'),
  };
}

/** Error explícito cuando `RESET_EMAIL` no corresponde a ningún usuario existente. */
export class UsuarioNoEncontradoError extends Error {
  constructor(email: string) {
    super(
      `[reset-password] No existe ningún usuario con email "${email}" en usuarios. ` +
        `El script NO crea usuarios nuevos — verificá el email o usá el seed de bootstrap.`,
    );
    this.name = 'UsuarioNoEncontradoError';
  }
}

/**
 * Resetea el password de un usuario existente, identificado por email.
 *
 * `masterClient` y `hashProvider` se reciben como parámetros (mismo patrón
 * que `bootstrapRoot`) para que el script sea testeable contra una DB real
 * de test sin duplicar wiring de infraestructura.
 *
 * @param masterClient  Cliente Prisma de la DB master (usuarios).
 * @param env           Email y password en texto plano (`readResetPasswordEnv()`).
 * @param hashProvider  Puerto de hashing — Argon2HashProvider real en producción,
 *                      EL MISMO que usa LoginUseCase para verificar al loguear.
 * @throws UsuarioNoEncontradoError si `env.email` no existe en `usuarios`.
 */
export async function resetPassword(
  masterClient: InstanceType<typeof MasterPrismaClient>,
  env: ResetPasswordEnv,
  hashProvider: IHashProvider = new Argon2HashProvider(),
): Promise<void> {
  // findUnique primero: si el email no existe, abortamos SIN hashear (el
  // argon2id hash es costoso y el UPDATE fallaría igual).
  const existing = await masterClient.usuario.findUnique({ where: { email: env.email } });
  if (!existing) {
    throw new UsuarioNoEncontradoError(env.email);
  }

  const passwordHash = await hashProvider.hash(env.password);
  await masterClient.usuario.update({
    where: { email: env.email },
    data: { passwordHash },
  });
}

// ─── Ejecución directa (ts-node) ───────────────────────────────────────────────
// Node 22+: carga .env sin dependencias adicionales. En CI/prod las env vars
// ya están en el entorno real, por eso el try/catch (no debe fallar si no hay
// archivo .env). Mismo patrón que prisma_master/seeds/root-bootstrap.seed.ts.
if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente — se usan las variables del entorno.
  }

  const masterUrl = requireEnv('DATABASE_URL_MASTER');
  const prismaService = new PrismaService(masterUrl);

  resetPassword(prismaService.getMasterClient(), readResetPasswordEnv())
    .then(() => {
      // Nunca se imprime la contraseña, ni siquiera parcial.
      console.log('[reset-password] OK — contraseña actualizada.');
    })
    .catch((err) => {
      console.error('[reset-password] Error:', (err as Error).message);
      process.exitCode = 1;
    })
    .finally(() => prismaService.onModuleDestroy());
}
