import { ClienteEntity } from '../../domain/entities/cliente.entity';

/**
 * ClienteResponseDto — shape del response de rutas de clientes.
 * El dominio (ClienteEntity) nunca se expone directamente al cliente HTTP.
 *
 * Tarea: 1.D.2
 */
export class ClienteResponseDto {
  id!: string;
  nombre!: string;
  razonSocial!: string | null;
  cuit!: string | null;
  dbName!: string;
  activo!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;

  static fromEntity(entity: ClienteEntity): ClienteResponseDto {
    const dto = new ClienteResponseDto();
    dto.id = entity.id;
    dto.nombre = entity.nombre;
    dto.razonSocial = entity.razonSocial;
    dto.cuit = entity.cuit;
    dto.dbName = entity.dbName;
    dto.activo = entity.activo;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
