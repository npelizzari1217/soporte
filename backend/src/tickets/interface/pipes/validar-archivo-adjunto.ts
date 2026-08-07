/**
 * validarAdjunto — validación de tamaño/mime de un adjunto en la capa
 * interface, ANTES de que la request llegue a `AdjuntarArchivoUseCase` (T21).
 *
 * Función pura (sin decoradores NestJS): se invoca explícitamente desde los
 * controllers de adjuntos (`AdjuntosController`) sobre el archivo recibido
 * por `FileInterceptor` (multer, memoryStorage — `file.buffer` disponible).
 *
 * La revalidación de `tamano_bytes > 0` se repite defensivamente en
 * `ArchivoEntity.create()` (dominio, T3.6) — este pipe es la ÚNICA capa que
 * valida el límite superior (10MB) y la whitelist de mime, ninguno de los
 * dos se repite en el dominio (ver ADR-7: "Validación tamaño/mime en la capa
 * interface (pipe) + revalidación defensiva en el use case").
 *
 * Ref spec: sdd/tickets-core/spec T21. Ref design: ADR-7. Tarea: T10.1.
 */
import { UnprocessableEntityException } from '@nestjs/common';

/** Límite máximo de un adjunto: 10MB (T21). */
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;

/** Mimes exactos permitidos fuera de la familia `image/*` (T21: PDF, Office, ZIP). */
const MIME_WHITELIST_EXACTA = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
]);

function esMimeWhitelisted(mimeType: string): boolean {
  return mimeType.startsWith('image/') || MIME_WHITELIST_EXACTA.has(mimeType);
}

/** Shape mínimo de `Express.Multer.File` que necesita esta validación. */
export interface ArchivoMulterLike {
  size: number;
  mimetype: string;
}

/**
 * Valida el archivo multipart recibido. Lanza `UnprocessableEntityException`
 * (422) si:
 * - no se envió ningún archivo,
 * - `size <= 0` o `size > 10MB` (T21),
 * - el `mimetype` no está en la whitelist (imágenes, PDF, Office, ZIP — T21).
 */
export function validarAdjunto(file: ArchivoMulterLike | undefined): void {
  if (!file) {
    throw new UnprocessableEntityException('Se requiere un archivo adjunto.');
  }
  if (file.size <= 0) {
    throw new UnprocessableEntityException('El archivo no puede estar vacío (0 bytes).');
  }
  if (file.size > MAX_ADJUNTO_BYTES) {
    throw new UnprocessableEntityException(
      `El archivo excede el tamaño máximo permitido de ${MAX_ADJUNTO_BYTES} bytes (10MB).`,
    );
  }
  if (!esMimeWhitelisted(file.mimetype)) {
    throw new UnprocessableEntityException(
      `Tipo de archivo no permitido: "${file.mimetype}". Permitidos: imágenes, PDF, Office, ZIP.`,
    );
  }
}
