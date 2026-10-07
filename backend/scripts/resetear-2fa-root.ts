/**
 * resetear-2fa-root.ts — resetea el 2FA de un ROOT que perdio el celular, los codigos de
 * recuperacion y no tiene otro ROOT que lo haga (verificacion-dos-pasos, ADR-10, S6/S7).
 *
 * Contrato:
 *   - Lee `DATABASE_URL_MASTER` y `RESET_EMAIL` del entorno; falta cualquiera -> throw ruidoso.
 *   - El usuario debe existir Y ser `isGlobalAdmin`; si no, exit 1 sin tocar nada.
 *   - Efectos de S3 en UNA transaccion: borra el secreto y los codigos de recuperacion, revoca
 *     los dispositivos confiables, consume los desafios abiertos y revoca los refresh tokens.
 *   - Imprime solo `OK`. Nunca imprime secretos ni codigos.
 *
 * Uso (sin .ps1, en el VPS o en WSL):
 *   RESET_EMAIL=root@x.com corepack pnpm exec ts-node scripts/resetear-2fa-root.ts
 */
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import { requireEnv } from '../prisma_master/seeds/root-bootstrap.seed';

/** El email no corresponde a un usuario existente que sea ROOT. */
export class RootNoEncontradoError extends Error {
  constructor() {
    super('[resetear-2fa-root] No existe un usuario ROOT con ese email. No se modifico nada.');
    this.name = 'RootNoEncontradoError';
  }
}

export async function resetear2faRoot(
  masterClient: InstanceType<typeof MasterPrismaClient>,
  email: string,
): Promise<void> {
  const usuario = await masterClient.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.isGlobalAdmin) throw new RootNoEncontradoError();

  const usuarioId = usuario.id;
  const ahora = new Date();
  await masterClient.$transaction([
    masterClient.usuarioTfa.deleteMany({ where: { usuarioId } }),
    masterClient.tfaCodigoRecuperacion.deleteMany({ where: { usuarioId } }),
    masterClient.tfaDispositivoConfiable.updateMany({
      where: { usuarioId, revocadoAt: null },
      data: { revocadoAt: ahora },
    }),
    masterClient.authDesafio.updateMany({
      where: { usuarioId, usadoAt: null },
      data: { usadoAt: ahora },
    }),
    masterClient.refreshToken.updateMany({
      where: { usuarioId, revokedAt: null },
      data: { revokedAt: ahora },
    }),
  ]);
}

if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente — se usan las variables del entorno.
  }

  const prismaService = new PrismaService(requireEnv('DATABASE_URL_MASTER'));
  resetear2faRoot(prismaService.getMasterClient(), requireEnv('RESET_EMAIL'))
    .then(() => console.log('OK'))
    .catch((err) => {
      console.error('[resetear-2fa-root] Error:', (err as Error).message);
      process.exitCode = 1;
    })
    .finally(() => prismaService.onModuleDestroy());
}
