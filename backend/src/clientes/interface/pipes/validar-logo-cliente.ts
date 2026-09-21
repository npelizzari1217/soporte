/**
 * validarLogoCliente — validación de tamaño/mime del logo de un cliente en
 * la capa interface, ANTES de invocar `ConfigurarLogoClienteUseCase`
 * (sdd/logo-por-cliente, WU2).
 *
 * HERMANO de `../../tickets/interface/pipes/validar-archivo-adjunto.ts`
 * (read-only, nunca reuso): ese pipe acepta cualquier mime `image/*` por
 * PREFIJO (`validar-archivo-adjunto.ts:36`), lo que aceptaría
 * `image/svg+xml` — vector de XSS inaceptable para un archivo que se sirve
 * `inline` en el sidebar de todos los usuarios del tenant. Este pipe usa una
 * whitelist EXACTA de 3 valores (design.md D7), sin ningún `startsWith`.
 *
 * Función pura (sin decoradores NestJS), invocada explícitamente desde
 * `ClienteLogoController` sobre el archivo recibido por `FileInterceptor`
 * (multer, memoryStorage — `file.buffer` disponible).
 *
 * Ref spec: clientes-logo/spec.md, Requirement "Validación de formato y
 * tamaño antes de guardar". Ref design: design.md D7, D8. Tarea: 2.2.
 */
import { UnprocessableEntityException } from '@nestjs/common';

/** Tope máximo de un logo: 512 KB (design.md D7). */
export const MAX_LOGO_BYTES = 512 * 1024;

/**
 * Whitelist EXACTA de mimes permitidos para el logo. A propósito un `Set`
 * cerrado de 3 valores, nunca un prefijo `image/*` — es el control anti-XSS
 * central de esta work unit (design.md D7).
 */
export const MIMES_LOGO = new Set<string>(['image/png', 'image/jpeg', 'image/webp']);

/** Shape mínimo de `Express.Multer.File` que necesita esta validación. */
export interface LogoMulterLike {
  size: number;
  mimetype: string;
}

/**
 * Valida el archivo de logo recibido. Lanza `UnprocessableEntityException`
 * (422) ANTES de que el archivo llegue a escribirse en disco si:
 * - no se envió ningún archivo,
 * - `size <= 0` o `size > 512 KB`,
 * - el `mimetype` no está en `MIMES_LOGO` (incluye `image/svg+xml`, aunque
 *   empiece con `image/`).
 */
export function validarLogoCliente(file: LogoMulterLike | undefined): void {
  if (!file) {
    throw new UnprocessableEntityException('Se requiere un archivo de logo.');
  }
  if (file.size <= 0) {
    throw new UnprocessableEntityException('El archivo no puede estar vacío (0 bytes).');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new UnprocessableEntityException(
      `El archivo excede el tamaño máximo permitido de ${MAX_LOGO_BYTES} bytes (512 KB).`,
    );
  }
  if (!MIMES_LOGO.has(file.mimetype)) {
    throw new UnprocessableEntityException(
      `Tipo de archivo no permitido: "${file.mimetype}". Permitidos: PNG, JPEG, WebP.`,
    );
  }
}
