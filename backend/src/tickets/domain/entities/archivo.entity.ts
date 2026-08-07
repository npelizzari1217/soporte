import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { ArchivoTamanoCeroError } from '../errors/tickets.errors';

/**
 * ArchivoProps — shape de las propiedades de metadata de un archivo
 * adjunto. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * El binario NUNCA se almacena en DB: vive en `IFileStorage` (ADR-7).
 * `storageKey` es el identificador del objeto en el servicio de storage.
 *
 * Nota sobre soft refs: `subidoPorId` es UUID de master.usuarios, sin FK
 * cross-DB.
 */
export interface ArchivoProps {
  /** Path/key en IFileStorage. NUNCA un blob. UNIQUE en DB. */
  storageKey: string;
  /** Nombre del archivo tal como lo subió el usuario. */
  nombreOriginal: string;
  /** Tipo MIME (ej. "application/pdf", "image/png"). */
  mimeType: string;
  /**
   * Tamaño en bytes. CHECK `tamano_bytes > 0` garantizado en DB y en
   * dominio (`create()`). `bigint` para soportar archivos grandes (>2GB)
   * sin perder precisión.
   */
  tamanoBytes: bigint;
  /** Soft ref → master.usuarios.id. Sin FK cross-DB. */
  subidoPorId: string;
}

/**
 * ArchivoEntity — entidad de dominio con los metadatos de un archivo
 * adjunto. El binario vive en `IFileStorage` (local disk o S3); la DB solo
 * almacena metadata.
 *
 * Reglas de dominio:
 * - `tamanoBytes` DEBE ser `> 0` (validado en `create()` con
 *   `Result.fail(ArchivoTamanoCeroError)` si viola).
 * - `reconstitute()` NO re-valida: los datos ya fueron validados al
 *   persistir.
 *
 * Ref spec: sdd/tickets-core/spec T20, T21. Ref design: ADR-7. Tarea: T3.6.
 */
export class ArchivoEntity extends BaseEntity<ArchivoProps> {
  private constructor(props: ArchivoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio. Retorna
   * `Result.fail(ArchivoTamanoCeroError)` si `tamanoBytes <= 0`.
   */
  static create(props: ArchivoProps, id?: string): Result<ArchivoEntity, ArchivoTamanoCeroError> {
    if (props.tamanoBytes <= BigInt(0)) {
      return Result.fail(new ArchivoTamanoCeroError(props.tamanoBytes));
    }
    return Result.ok(new ArchivoEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida `tamanoBytes`: los datos ya fueron validados al persistir.
   */
  static reconstitute(
    props: ArchivoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ArchivoEntity {
    const entity = new ArchivoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get storageKey(): string {
    return this.props.storageKey;
  }

  get nombreOriginal(): string {
    return this.props.nombreOriginal;
  }

  get mimeType(): string {
    return this.props.mimeType;
  }

  get tamanoBytes(): bigint {
    return this.props.tamanoBytes;
  }

  get subidoPorId(): string {
    return this.props.subidoPorId;
  }
}
