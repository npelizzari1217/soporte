import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { ArchivoTamanoCeroError } from '../errors/tickets.errors';

/**
 * ArchivoProps — shape de las propiedades de metadata de un archivo adjunto.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * El binario NUNCA se almacena en DB: vive en IFileStorage.
 * La storage_key es el identificador del objeto en el servicio de storage.
 *
 * Nota sobre soft refs:
 * - subido_por_id es UUID de master.usuarios — sin FK cross-DB.
 */
export interface ArchivoProps {
  /** Path/key en IFileStorage. NUNCA un blob. UNIQUE en DB. */
  storageKey: string;
  /** Nombre del archivo tal como lo subió el usuario. */
  nombreOriginal: string;
  /** Tipo MIME. Ej: "application/pdf", "image/png". */
  mimeType: string;
  /**
   * Tamaño en bytes. CHECK tamano_bytes > 0 garantizado en DB y en dominio.
   * Usamos bigint para soportar archivos de gran tamaño (>2GB) sin perder precisión.
   */
  tamanoBytes: bigint;
  /** Soft ref → master.usuarios.id. Sin FK cross-DB. */
  subidoPorId: string;
}

/**
 * ArchivoEntity — entidad de dominio que representa los metadatos de un archivo adjunto.
 *
 * El binario vive en IFileStorage (S3 o equivalente). La DB solo almacena metadata.
 *
 * Reglas de dominio:
 * - tamanoBytes DEBE ser > 0 (validado en create() con Result.fail si viola).
 * - reconstitute() NO valida (datos ya validados al persistir).
 *
 * Ref spec: [SPEC:tickets-core/Tabla archivos, Adjuntos vía IFileStorage]
 * Tarea: 3.A.2
 */
export class ArchivoEntity extends BaseEntity<ArchivoProps> {
  private constructor(props: ArchivoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio.
   * Retorna Result.fail(ArchivoTamanoCeroError) si tamanoBytes <= 0.
   */
  static create(props: ArchivoProps, id?: string): Result<ArchivoEntity, ArchivoTamanoCeroError> {
    if (props.tamanoBytes <= BigInt(0)) {
      return Result.fail(new ArchivoTamanoCeroError(props.tamanoBytes));
    }
    return Result.ok(new ArchivoEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * NO re-valida tamanoBytes: los datos ya fueron validados al persistir.
   */
  static reconstitute(
    props: ArchivoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ArchivoEntity {
    const entity = new ArchivoEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
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
