/**
 * ClienteMapper — convierte entre Prisma Cliente y ClienteEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext), consumido
 * por PrismaClienteRepository (findById requerido por `resolverScope`, R5/R10).
 */
import type { Cliente as PrismaCliente } from '.prisma/master';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../../shared/domain/zona-horaria';

export class ClienteMapper {
  static toDomain(row: PrismaCliente): ClienteEntity {
    return ClienteEntity.reconstitute(
      {
        nombre: row.nombre,
        razonSocial: row.razonSocial ?? null,
        cuit: row.cuit ?? null,
        dbName: row.dbName,
        activo: row.activo,
        zonaHoraria: ZonaHoraria.desdePersistencia(row.zonaHoraria, row.id),
        csatHabilitado: row.csatHabilitado,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * `Omit` ensancha además las 9 columnas SMTP (sdd/configuracion-correo-por-cliente,
   * WU2): `PrismaClienteRepository.save()` hace `update: updateData` con lo
   * que este método devuelve, así que omitirlas es lo que hace
   * estructuralmente imposible que una edición comercial (nombre, cuit, etc.)
   * borre la config de correo sin querer. La lectura/escritura de esas
   * columnas va por `IClienteEmailConfigRepository` (WU3), no por acá.
   */
  static toPersistence(
    entity: ClienteEntity,
  ): Omit<
    PrismaCliente,
    | 'createdAt'
    | 'updatedAt'
    | 'smtpHost'
    | 'smtpPort'
    | 'smtpUser'
    | 'smtpSecure'
    | 'smtpFrom'
    | 'smtpPasswordCifrada'
    | 'smtpConfigUpdatedAt'
    | 'smtpVerificadoAt'
    | 'smtpVerificacionError'
  > {
    return {
      id: entity.id,
      nombre: entity.nombre,
      razonSocial: entity.razonSocial,
      cuit: entity.cuit,
      dbName: entity.dbName,
      activo: entity.activo,
      zonaHoraria: entity.zonaHoraria.valor,
      csatHabilitado: entity.csatHabilitado,
      deletedAt: entity.deletedAt,
    };
  }
}
