/**
 * EncuestaSatisfaccionMapper — convierte entre Prisma EncuestaSatisfaccion
 * (TENANT) y EncuestaSatisfaccionEntity.
 *
 * `puntaje` viaja como `number` primitivo hacia y desde Prisma — la entidad
 * de dominio ya lo recibe validado por `PuntajeCsat` en `create()` (WU4);
 * `reconstitute()` no re-envuelve el VO al leer de DB (ver comentario de la
 * entidad).
 *
 * Ref design: sección "Modelo de datos y migraciones" (TENANT —
 * `encuestas_satisfaccion`). Tarea: 5.3.
 */
import type { EncuestaSatisfaccion as PrismaEncuestaSatisfaccion } from '.prisma/tenant';
import { EncuestaSatisfaccionEntity } from '../../../domain/entities/encuesta-satisfaccion.entity';

export class EncuestaSatisfaccionMapper {
  static toDomain(row: PrismaEncuestaSatisfaccion): EncuestaSatisfaccionEntity {
    return EncuestaSatisfaccionEntity.reconstitute(
      {
        ticketId: row.ticketId,
        tokenId: row.tokenId,
        puntaje: row.puntaje,
        comentario: row.comentario ?? null,
        respondidaEn: row.respondidaEn,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  static toPersistence(
    entity: EncuestaSatisfaccionEntity,
  ): Omit<PrismaEncuestaSatisfaccion, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      tokenId: entity.tokenId,
      puntaje: entity.puntaje,
      comentario: entity.comentario,
      respondidaEn: entity.respondidaEn,
      deletedAt: entity.deletedAt,
    };
  }
}
