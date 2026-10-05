/**
 * RespuestaPredefinidaMapper — convierte entre la fila Prisma y la entidad de dominio.
 * Archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 */
import type { RespuestaPredefinida as PrismaRespuestaPredefinida } from '.prisma/tenant';
import { RespuestaPredefinidaEntity } from '../../../domain/entities/respuesta-predefinida.entity';

export class RespuestaPredefinidaMapper {
  static toDomain(row: PrismaRespuestaPredefinida): RespuestaPredefinidaEntity {
    return RespuestaPredefinidaEntity.reconstitute(
      { titulo: row.titulo, texto: row.texto, activo: row.activo },
      row.id,
      row.createdAt,
      row.updatedAt,
    );
  }

  /** Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE. */
  static toPersistence(
    entity: RespuestaPredefinidaEntity,
  ): Omit<PrismaRespuestaPredefinida, 'updatedAt'> {
    return {
      id: entity.id,
      titulo: entity.titulo,
      texto: entity.texto,
      activo: entity.activo,
      createdAt: entity.createdAt,
    };
  }
}
