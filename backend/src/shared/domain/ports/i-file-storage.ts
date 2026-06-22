/**
 * IFileStorage — puerto de almacenamiento de archivos binarios.
 *
 * El dominio define SOLO esta interface (el puerto); las implementaciones
 * concretas viven en shared/infrastructure/storage/:
 *   - LocalFileStorage   — dev/test, guarda en disco local
 *   - S3FileStorage      — producción (fase futura)
 *
 * La tabla `archivos` en la DB guarda únicamente metadata (storage_key, mime,
 * tamano_bytes, nombre). El binario vive exclusivamente en el almacenamiento
 * apuntado por storage_key — NUNCA en la DB.
 */
export interface IFileStorage {
  /**
   * Sube un archivo al almacenamiento y retorna la clave de almacenamiento
   * (storage_key) que identifica el archivo. La URL pública/signed se
   * construye separadamente si es necesario.
   *
   * @param key     Clave única del archivo (p.ej. "tickets/uuid/filename.pdf").
   * @param buffer  Contenido binario del archivo.
   * @param mime    MIME type del archivo (p.ej. "application/pdf").
   * @returns       storage_key confirmada (puede diferir de key si el
   *                adaptador la normaliza, p.ej. agrega prefijo de bucket).
   */
  upload(key: string, buffer: Buffer, mime: string): Promise<string>;

  /**
   * Elimina un archivo del almacenamiento por su storage_key.
   * No lanza error si el archivo no existe (idempotente).
   *
   * @param key  storage_key del archivo a eliminar.
   */
  delete(key: string): Promise<void>;
}

/** Token de inyección de dependencias para IFileStorage en NestJS. */
export const FILE_STORAGE = Symbol('FILE_STORAGE');
