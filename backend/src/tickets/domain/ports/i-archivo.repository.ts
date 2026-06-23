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
   * Baja lógica: setea deleted_at en la fila de archivos.
   * NO borra el binario del storage (proceso asíncrono separado).
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IArchivoRepository en NestJS. */
export const ARCHIVO_REPOSITORY = Symbol('ARCHIVO_REPOSITORY');
