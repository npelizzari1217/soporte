/**
 * CertificadoAvanceMapper — convierte entre `certificaciones_avance` (con sus filas de
 * `certificacion_tarea`) y `CertificadoAvanceEntity`. Vive en infrastructure/: puede importar de
 * '.prisma/tenant'.
 */
import type {
  CertificacionAvance as PrismaCertificacion,
  CertificacionTarea as PrismaCertificacionTarea,
} from '.prisma/tenant';
import { CertificadoAvanceEntity } from '../../../domain/entities/certificado-avance.entity';

export type CertificacionConTareas = PrismaCertificacion & { tareas: PrismaCertificacionTarea[] };

export class CertificadoAvanceMapper {
  /** Fila con sus tareas (`include: { tareas: true }`) → entidad. */
  static toDomain(row: CertificacionConTareas): CertificadoAvanceEntity {
    return CertificadoAvanceEntity.reconstitute(
      {
        ticketId: row.ticketId,
        numero: row.numero,
        porcentaje: row.porcentaje,
        emitidoPorId: row.emitidoPorId,
        emitidoEn: row.emitidoEn,
        anuladoEn: row.anuladoEn,
        anuladoPorId: row.anuladoPorId,
        motivoAnulacion: row.motivoAnulacion,
        tareas: row.tareas.map((tarea) => ({ tareaId: tarea.tareaId, peso: tarea.peso })),
      },
      row.id,
      row.createdAt,
      row.updatedAt,
    );
  }
}
