/**
 * SharedModule bootstrap — SECRET_CIPHER fail-fast regression guard (F1, PR1).
 *
 * F1 (design.md §"Resolución de forks — AUTORITATIVA"): `CONFIG_ENCRYPTION_KEY`
 * es infra tier-bootstrap — la app NO debe arrancar si falta o tiene longitud
 * inválida. Mismo patrón que el regression-guard de EMAIL_SENDER en
 * `tickets.module.wiring.spec.ts` ("rechaza el bootstrap si falta SMTP_HOST").
 *
 * El resto de la suite recibe una `CONFIG_ENCRYPTION_KEY` dummy válida vía
 * `test/setup-env.ts` — SIN este test, ningún otro caso cubriría que el
 * bootstrap ABORTE de verdad si falta la clave.
 *
 * Ref design: §14 F1. Ref tasks: PR1 1.9-1.10.
 */
import { Test } from '@nestjs/testing';
import { SharedModule } from './shared.module';
import { SECRET_CIPHER } from './domain/ports/i-secret-cipher';
import { AesGcmSecretCipher } from './infrastructure/crypto/aes-gcm-secret-cipher.adapter';
import { ConfigEncryptionKeyError } from './infrastructure/crypto/config-encryption-key';

describe('SharedModule bootstrap — SECRET_CIPHER (F1 fail-fast)', () => {
  it('resuelve SECRET_CIPHER a un AesGcmSecretCipher real (env dummy del setup global)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(SECRET_CIPHER)).toBeInstanceOf(AesGcmSecretCipher);

    await moduleRef.close();
  });

  it('rechaza el bootstrap si falta CONFIG_ENCRYPTION_KEY (F1 fail-fast)', async () => {
    const previous = process.env.CONFIG_ENCRYPTION_KEY;
    delete process.env.CONFIG_ENCRYPTION_KEY;

    try {
      await expect(
        Test.createTestingModule({
          imports: [SharedModule],
        }).compile(),
      ).rejects.toThrow(ConfigEncryptionKeyError);
    } finally {
      if (previous === undefined) {
        delete process.env.CONFIG_ENCRYPTION_KEY;
      } else {
        process.env.CONFIG_ENCRYPTION_KEY = previous;
      }
    }

    expect(process.env.CONFIG_ENCRYPTION_KEY).toBe(previous);
  });

  // Nota: con el predicado compartido `checkConfigEncryptionKeyFormat` (orden trim→formato→longitud),
  // este fixture de 16 chars falla en la rama 'formato' (no matchea el regex de 44 chars) ANTES del
  // chequeo de longitud. La rama 'longitud' es inalcanzable en la práctica porque el regex ya ancla el
  // largo; su cobertura unitaria vive en config-encryption-key.spec.ts. Acá solo verificamos el
  // fail-fast de bootstrap ante una clave con formato/longitud inválidos.
  it('rechaza el bootstrap si CONFIG_ENCRYPTION_KEY tiene formato/longitud inválidos (F1 fail-fast)', async () => {
    const previous = process.env.CONFIG_ENCRYPTION_KEY;
    process.env.CONFIG_ENCRYPTION_KEY = Buffer.alloc(10, 1).toString('base64');

    try {
      await expect(
        Test.createTestingModule({
          imports: [SharedModule],
        }).compile(),
      ).rejects.toThrow(ConfigEncryptionKeyError);
    } finally {
      if (previous === undefined) {
        delete process.env.CONFIG_ENCRYPTION_KEY;
      } else {
        process.env.CONFIG_ENCRYPTION_KEY = previous;
      }
    }

    expect(process.env.CONFIG_ENCRYPTION_KEY).toBe(previous);
  });
});
