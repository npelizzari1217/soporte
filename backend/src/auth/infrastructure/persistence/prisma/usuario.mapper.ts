/**
 * UsuarioMapper — convierte entre Prisma Usuario y UsuarioEntity.
 *
 * ADR-1 (identidad global + membresías N:N): a diferencia de soporte1 (donde
 * el usuario cargaba roles[] vía JOIN usuarios_roles), acá el Usuario es
 * identidad pura — SIN roles ni cliente_id propios. El rol/permisos se
 * resuelven por separado vía IMembresiaRepository (ver
 * PrismaMembresiaRepository). Este mapper por lo tanto NO hace ningún JOIN.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import type { Usuario as PrismaUsuario } from '.prisma/master';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';

export class UsuarioMapper {
  static toDomain(row: PrismaUsuario): UsuarioEntity {
    return UsuarioEntity.reconstitute(
      {
        email: row.email,
        nombre: row.nombre,
        apellido: row.apellido,
        passwordHash: row.passwordHash,
        activo: row.activo,
        isGlobalAdmin: row.isGlobalAdmin,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  static toPersistence(entity: UsuarioEntity): Omit<PrismaUsuario, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      email: entity.email,
      nombre: entity.nombre,
      apellido: entity.apellido,
      passwordHash: entity.passwordHash,
      activo: entity.activo,
      isGlobalAdmin: entity.isGlobalAdmin,
      deletedAt: entity.deletedAt,
    };
  }
}
