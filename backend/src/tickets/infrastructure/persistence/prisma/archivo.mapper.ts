/**
 * ArchivoMapper — convierte entre Prisma Archivo (row de DB) y ArchivoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 * La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * tamanoBytes: Prisma lo mapea como `BigInt` en TS (mapea a BIGINT en Postgres).
 * No requiere conversión especial — ArchivoEntity también usa `bigint`.
 *
 * Tarea: 3.D.2
 */
import type { Archivo as PrismaArchivo } from '.prisma/tenant';
import { ArchivoEntity } from '../../../domain/entities/archivo.entity';

export class ArchivoMapper {
  /**
   * Convierte una fila de DB Prisma → ArchivoEntity de dominio.
   * Usa ArchivoEntity.reconstitute() — omite validación de tamanoBytes
   * (ya fue validado al persistir).
   */
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

  /**
   * Convierte ArchivoEntity → objeto plano para Prisma create.
   * Archivos son solo INSERT (inmutables una vez subidos).
   */
  static toPersistence(entity: ArchivoEntity): Omit<PrismaArchivo, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      storageKey: entity.storageKey,
      nombreOriginal: entity.nombreOriginal,
      mimeType: entity.mimeType,
      tamanoBytes: entity.tamanoBytes,
      subidoPorId: entity.subidoPorId,
      deletedAt: entity.deletedAt,
    };
  }
}
