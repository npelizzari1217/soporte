/**
 * ArchivoMapper — convierte entre Prisma Archivo (fila de DB) y
 * ArchivoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * `reconstitute()` NO re-valida `tamanoBytes` (ya validado al persistir) —
 * de ahí que `toDomain` use `reconstitute`, no `create`, y no retorne
 * `Result`.
 *
 * Tarea: alcance PR5 explícito de esta sesión (adelanta PrismaArchivoRepository
 * + mapper desde PR10, ver apply-progress).
 */
import type { Archivo as PrismaArchivo } from '.prisma/tenant';
import { ArchivoEntity } from '../../../domain/entities/archivo.entity';

export class ArchivoMapper {
  /** Convierte una fila de DB Prisma → ArchivoEntity de dominio. */
  static toDomain(row: PrismaArchivo): ArchivoEntity {
    return ArchivoEntity.reconstitute(
      {
        storageKey: row.storageKey,
        nombreOriginal: row.nombreOriginal,
        mimeType: row.mimeType,
        tamanoBytes: row.tamanoBytes,
        subidoPorId: row.subidoPorId,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /** Convierte ArchivoEntity → objeto plano para Prisma INSERT (solo-creación, archivos son inmutables). */
  static toPersistence(entity: ArchivoEntity): Omit<PrismaArchivo, 'updatedAt'> {
    return {
      id: entity.id,
      storageKey: entity.storageKey,
      nombreOriginal: entity.nombreOriginal,
      mimeType: entity.mimeType,
      tamanoBytes: entity.tamanoBytes,
      subidoPorId: entity.subidoPorId,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
