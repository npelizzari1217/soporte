/**
 * IFileStorage — puerto de almacenamiento de archivos binarios.
 *
 * El dominio define SOLO esta interface (el puerto); la implementación
 * concreta de Fase 2 vive en shared/infrastructure/storage/:
 *   - LocalDiskFileStorage — guarda en el filesystem del server (dev/beta).
 *
 * La tabla `archivos` (PR10) guarda únicamente metadata (storage_key, mime,
 * tamano_bytes, nombre). El binario vive exclusivamente en el almacenamiento
 * apuntado por storage_key — NUNCA en la DB (T20). La interfaz permite migrar
 * a S3 sin tocar la capa de aplicación (T20).
 *
 * Ref design: ADR-7. Ref tasks: sdd/tickets-core/tasks PR1 T1.5.
 */
export interface IFileStorage {
  /**
   * Sube un archivo al almacenamiento y retorna la clave de almacenamiento
   * (storage_key) que identifica el archivo.
   *
   * @param key    Clave única del archivo (p.ej. "tickets/{ticketId}/{archivoId}").
   * @param buffer Contenido binario del archivo.
   * @param mime   MIME type del archivo (p.ej. "application/pdf").
   * @returns      storage_key confirmada.
   */
  upload(key: string, buffer: Buffer, mime: string): Promise<string>;

  /**
   * Elimina un archivo del almacenamiento por su storage_key.
   * No lanza error si el archivo no existe (idempotente).
   *
   * @param key storage_key del archivo a eliminar.
   */
  delete(key: string): Promise<void>;

  /**
   * Lee un archivo del almacenamiento por su storage_key.
   * Devuelve `null` si el archivo no existe — nunca lanza por ausencia
   * (simétrico con `delete()`, que también es idempotente ante ausencia).
   *
   * Ref design: sdd/logo-por-cliente, D-camino de lectura (WU1).
   *
   * @param key storage_key del archivo a leer.
   * @returns   el Buffer del archivo, o `null` si no existe.
   */
  retrieve(key: string): Promise<Buffer | null>;
}

/** Token de inyección de dependencias para IFileStorage en NestJS. */
export const FILE_STORAGE = Symbol('FILE_STORAGE');
