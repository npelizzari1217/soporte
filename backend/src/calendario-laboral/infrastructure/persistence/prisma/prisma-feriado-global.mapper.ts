/**
 * PrismaFeriadoGlobalMapper — convierte entre el modelo Prisma `Feriado`
 * (master, tabla `feriados`) y `FeriadoEntity` del ABM global (WU1/WU2).
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint). Reusa `PrismaCalendarioLaboralMapper.claveDiaUtcDe()`
 * para la trampa `@db.Date` en vez de duplicarla (WU1.5).
 */
import type { Feriado as PrismaFeriado } from '.prisma/master';
import { FeriadoEntity } from '../../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../../domain/value-objects/fecha-calendario';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

export class PrismaFeriadoGlobalMapper {
  static toDomain(row: PrismaFeriado): FeriadoEntity {
    const clave = PrismaCalendarioLaboralMapper.claveDiaUtcDe(row.fecha);
    // getOrThrow(): la fila viene de una columna que solo esta misma
    // infraestructura escribe, así que una clave inválida acá es un bug de
    // datos — tolerado en el límite de infraestructura (result.ts).
    const fecha = FechaCalendario.crear(clave).getOrThrow();
    return FeriadoEntity.reconstitute(
      { fecha, descripcion: row.descripcion },
      row.id,
      row.createdAt,
      row.updatedAt,
    );
  }

  static toPersistence(entity: FeriadoEntity): { id: string; fecha: Date; descripcion: string } {
    return {
      id: entity.id,
      fecha: entity.fecha.aDateUtc(),
      descripcion: entity.descripcion,
    };
  }
}
