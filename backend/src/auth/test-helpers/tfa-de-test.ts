/**
 * Helpers de test para los usuarios con 2FA activo (L10, T2). Los e2e que entran como ROOT no
 * saltean el segundo paso: activan un secreto CONOCIDO y calculan el codigo real.
 *
 * Requiere `EMAIL_CRYPTO_KEY` valida en el entorno (la misma que usa la app bajo test).
 */
import { createHmac } from 'node:crypto';
import { AesGcmSecretCipher } from '../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { SecretoTotpCifrado } from '../application/tfa/secreto-totp-cifrado';
import { TotpNativoService } from '../infrastructure/tfa/totp-nativo.service';

/** Clave de prueba de RFC 6238 ("12345678901234567890") en base32. */
export const SECRETO_TOTP_DE_TEST = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const CLAVE = Buffer.from('12345678901234567890');
const PERIODO_MS = 30_000;
const totp = new TotpNativoService();
const ultimoPasoUsado = new Map<string, number>();

/** Deja al usuario con 2FA activo y el secreto conocido (cifrado con la clave del entorno). */
export async function activarTfaDeTest(prisma: PrismaService, usuarioId: string): Promise<void> {
  const secretoCifrado = new SecretoTotpCifrado(new AesGcmSecretCipher()).cifrar(
    usuarioId,
    SECRETO_TOTP_DE_TEST,
  );
  await prisma.getMasterClient().usuarioTfa.upsert({
    where: { usuarioId },
    create: { usuarioId, secretoCifrado, confirmadoAt: new Date(), ultimoPaso: 0 },
    update: { secretoCifrado, confirmadoAt: new Date(), ultimoPaso: 0 },
  });
  ultimoPasoUsado.delete(usuarioId);
}

/**
 * Codigo TOTP valido AHORA: si el paso actual ya se uso, avanza al siguiente (el antireplay lo
 * rechazaria). La ventana del verificador es +-1, asi que admite un solo avance.
 */
export function codigoDeTest(usuarioId: string): string {
  const ahora = new Date();
  const actual = Math.floor(ahora.getTime() / PERIODO_MS);
  const paso = Math.max(actual, (ultimoPasoUsado.get(usuarioId) ?? -1) + 1);
  if (paso > actual + 1) throw new Error('codigoDeTest: sin pasos libres, espere 30 s');
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', CLAVE).update(contador).digest();
  const codigo = String((h.readUInt32BE(h[h.length - 1] & 0x0f) & 0x7fffffff) % 1_000_000).padStart(
    6,
    '0',
  );
  // El servicio real acepta el codigo en ese paso: si el algoritmo divergiera, falla aca.
  if (totp.verificar(SECRETO_TOTP_DE_TEST, codigo, ahora) !== paso) {
    throw new Error('codigoDeTest: el TOTP real no acepta el codigo calculado');
  }
  ultimoPasoUsado.set(usuarioId, paso);
  return codigo;
}

export function reiniciarAntireplay(): void {
  ultimoPasoUsado.clear();
}
