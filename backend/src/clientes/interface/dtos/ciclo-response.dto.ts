import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

/**
 * CicloResponseDto — shape del response de rutas /ciclos (tenant-level admin).
 *
 * Nunca incluye cicloVigenteId (soft-ref a master, detalle de infraestructura).
 *
 * Tarea: T2.15
 */
export class CicloResponseDto {
  id!: string;
  nombre!: string;
  fechaInicio!: Date;
  fechaFin!: Date;
  activo!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;

  static fromEntity(entity: CicloClienteEntity): CicloResponseDto {
    const dto = new CicloResponseDto();
    dto.id = entity.id;
    dto.nombre = entity.nombre;
    dto.fechaInicio = entity.fechaInicio;
    dto.fechaFin = entity.fechaFin;
    dto.activo = entity.activo;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
