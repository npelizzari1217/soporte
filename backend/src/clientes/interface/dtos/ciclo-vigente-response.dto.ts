import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';

/**
 * CicloVigenteResponseDto — shape del response de rutas de ciclos vigentes.
 *
 * Tarea: 1.D.2
 */
export class CicloVigenteResponseDto {
  id!: string;
  nombre!: string;
  fechaInicio!: Date;
  fechaFin!: Date;
  activo!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;

  static fromEntity(entity: CicloVigenteEntity): CicloVigenteResponseDto {
    const dto = new CicloVigenteResponseDto();
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
