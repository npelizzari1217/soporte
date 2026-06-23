import { ArchivoEntity } from '../entities/archivo.entity';

/**
 * IArchivoRepository — puerto de persistencia para metadatos de archivos adjuntos.
 *
 * Solo almacena metadata. El binario vive en IFileStorage.
 * El borrado lógico setea deleted_at; el borrado físico del storage
 * es un proceso asíncrono separado.
 *
 * Ref spec: [SPEC:tickets-core/Tabla archivos, Borrado de adjunto]
 * Tarea: 3.A.3
 */
export interface IArchivoRepository {
  /**
   * Busca un archivo por su identificador técnico.
   * Retorna null si no existe. Incluye archivos soft-deleted.
   */
  findById(id: string): Promise<ArchivoEntity | null>;

  /**
   * Busca un archivo por su storage_key (identificador en IFileStorage).
   * Útil para deduplicación y referencias.
   */
  findByStorageKey(storageKey: string): Promise<ArchivoEntity | null>;

  /**
   * Retorna todos los archivos adjuntos a un ticket específico.
   * Excluye archivos soft-deleted.
   */
  findByTicketId(ticketId: string): Promise<ArchivoEntity[]>;

  /**
   * Persiste los metadatos del archivo.
   * Solo INSERT (los archivos son inmutables una vez subidos).
   */
  save(archivo: ArchivoEntity): Promise<void>;

  /**
   * Crea la fila en archivos_ticket que asocia un archivo con un ticket.
   * Debe llamarse DESPUÉS de save() y dentro de la MISMA transacción.
   *
   * archivos_ticket no tiene soft delete propio: la baja lógica del archivo
   * (soft delete en `archivos`) es suficiente. La fila de join se elimina
   * físicamente solo en cleanup de archivos definitivos.
   *
   * Ref spec: [SPEC:tickets-core/Upload adjunto guarda solo metadata]
   * Tarea: 3.C.8
   */
  linkToTicket(archivoId: string, ticketId: string): Promise<void>;

  /**
   * Baja lógica: setea deleted_at en la fila de archivos.
   * NO borra el binario del storage (proceso asíncrono separado).
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IArchivoRepository en NestJS. */
export const ARCHIVO_REPOSITORY = Symbol('ARCHIVO_REPOSITORY');
