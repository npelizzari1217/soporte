/**
 * AesGcmSecretCipher — implementación de ISecretCipher con AES-256-GCM
 * (`node:crypto`, sin dependencias externas).
 *
 * La clave se lee y valida LAZY (dentro de `loadKey()`, invocada por cada
 * `encrypt()`/`decrypt()`) — NUNCA en el constructor. Esto es DISTINTO de la
 * validación de boot-time (F1, fail-fast): esa vive en
 * `config-encryption-key.ts` y se invoca UNA VEZ desde el `useFactory` de
 * `SECRET_CIPHER` en `shared.module.ts`. Acá, `loadKey()` retorna
 * `Result.fail` (nunca lanza) porque `encrypt`/`decrypt` son operaciones de
 * FILA de datos que deben degradar graciosamente incluso si, por algún motivo
 * extraordinario, la clave dejara de ser válida en runtime (spec R2/R6).
 *
 * Espejo del patrón `IHashProvider`→`Argon2HashProvider`
 * (`auth/infrastructure/argon2-hash.provider.ts`), pero cross-dominio ⇒ vive
 * en `shared/infrastructure/crypto/` (Dz2).
 *
 * Ref design: §2 Dz2/Dz3, §6. Ref spec: R2. Tarea: 1.8 (PR1).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { CipherPayload, ISecretCipher } from '../../domain/ports/i-secret-cipher';
import { CifradoError } from '../../domain/errors/cifrado.errors';
import { Result } from '../../domain/result';
import { checkConfigEncryptionKeyFormat } from './config-encryption-key';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce recomendado para GCM

@Injectable()
export class AesGcmSecretCipher implements ISecretCipher {
  // Infra puede importar `Logger` de `@nestjs/common` directo (mismo
  // precedente que `NotificarCambioEstadoListener`/`TenantGuard` — solo
  // `application/` debe pasar por el puerto `ILogger`, ver
  // shared/domain/ports/i-logger.port.ts).
  private readonly logger = new Logger(AesGcmSecretCipher.name);

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private loadKey(): Result<Buffer, CifradoError> {
    // Delega TODO el chequeo (trim → formato → longitud) al predicado
    // compartido de config-encryption-key.ts — NUNCA reimplementar el orden
    // acá. Antes de este fix, este método reimplementaba formato→longitud
    // mientras `validateConfigEncryptionKey()` hacía longitud→formato: el
    // MISMO input inválido daba dos diagnósticos distintos según el camino
    // (Judgment Day PR1 Ronda 2, confirmado A+B).
    const result = checkConfigEncryptionKeyFormat(this.env.CONFIG_ENCRYPTION_KEY);

    if (result.ok) {
      return Result.ok(result.key);
    }

    switch (result.reason) {
      case 'missing':
        return Result.fail(new CifradoError('CONFIG_ENCRYPTION_KEY ausente.'));
      case 'formato':
        return Result.fail(
          new CifradoError('CONFIG_ENCRYPTION_KEY tiene formato base64 inválido.'),
        );
      case 'longitud':
        return Result.fail(new CifradoError('CONFIG_ENCRYPTION_KEY tiene longitud inválida.'));
    }
  }

  encrypt(plaintext: string): Result<CipherPayload, CifradoError> {
    const keyResult = this.loadKey();
    if (keyResult.isFail()) {
      return Result.fail(keyResult.getError());
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, keyResult.getValue(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return Result.ok({
      valor: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    });
  }

  decrypt(payload: CipherPayload): Result<string, CifradoError> {
    const keyResult = this.loadKey();
    if (keyResult.isFail()) {
      return Result.fail(keyResult.getError());
    }

    try {
      const decipher = createDecipheriv(
        ALGO,
        keyResult.getValue(),
        Buffer.from(payload.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.valor, 'base64')),
        decipher.final(), // lanza si el authTag no valida — capturado acá
      ]);
      return Result.ok(plaintext.toString('utf8'));
    } catch (err) {
      // Logueamos la excepción CRUDA antes de mapearla a CifradoError — sin
      // esto, tampering (authTag inválido, esperado) y un bug real (ej.
      // `payload.iv` undefined → TypeError) son indistinguibles desde afuera
      // (Judgment Day PR1 Ronda 1, WARNING teórico). Solo `err.message`/tipo:
      // NUNCA `payload.valor` ni la clave (spec R2 — el secreto en claro
      // nunca sale de memoria, ni siquiera en un log). El contrato
      // "decrypt() nunca throw / Result.fail" se mantiene — esto es logging,
      // no re-throw.
      const raw = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`decrypt() falló: ${raw.constructor.name}: ${raw.message}`, raw.stack);
      // Clave equivocada, authTag alterado (tampering) o payload corrupto →
      // error tipado sin filtrar detalle crudo del cripto-fallo (spec R2).
      return Result.fail(
        new CifradoError('No se pudo descifrar el secreto (clave inválida o dato alterado).'),
      );
    }
  }
}
