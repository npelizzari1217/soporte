/**
 * PrismaFeriadoClienteMapper — convierte entre el modelo Prisma
 * `FeriadoCliente` (tenant, tabla `feriados_cliente`) y `FeriadoEntity`
 * (WU3a, sdd/feriados-configurables). Importa de '.prisma/tenant' solo
 * porque está en infrastructure/ (fitness rule de ESLint). Reusa
 * `PrismaCalendarioLaboralMapper.claveDiaUtcDe()` para la trampa `@db.Date`
 * en vez de duplicarla (WU1.5) — misma implementación que
 * `PrismaFeriadoGlobalMapper`, distinto tipo Prisma de origen.
 */
import type { FeriadoCliente as PrismaFeriadoCliente } from '.prisma/tenant';
import { FeriadoEntity } from '../../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../../domain/value-objects/fecha-calendario';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

export class PrismaFeriadoClienteMapper {
  static toDomain(row: PrismaFeriadoCliente): FeriadoEntity {
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
