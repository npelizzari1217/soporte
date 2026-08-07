/**
 * MembresiaMapper — proyecta una fila Prisma Membresia (con cliente + rol +
 * permisos incluidos) a `MembresiaResuelta` (puerto `IMembresiaRepository`).
 *
 * A diferencia del resto de los mappers, NO produce una entidad de dominio:
 * `MembresiaResuelta` es una PROYECCIÓN de solo-lectura pensada para
 * alimentar el JWT (R4, R6) sin round-trips adicionales — LoginUseCase/
 * SwitchTenantUseCase/RefreshTokenUseCase (PR3/PR4) la consumen tal cual.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: T5.3 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import type {
  Membresia as PrismaMembresia,
  Cliente as PrismaCliente,
  Role as PrismaRole,
  RolesPermisos,
  Permiso as PrismaPermiso,
} from '.prisma/master';
import { MembresiaResuelta } from '../../../domain/ports/i-membresia.repository';

/** Prisma row con el JOIN completo membresia → cliente + rol → permisos. */
export type PrismaMembresiaResuelta = PrismaMembresia & {
  cliente: PrismaCliente;
  rol: PrismaRole & {
    rolesPermisos: (RolesPermisos & { permiso: PrismaPermiso })[];
  };
};

export class MembresiaMapper {
  static toResuelta(row: PrismaMembresiaResuelta): MembresiaResuelta {
    return {
      clienteId: row.cliente.id,
      clienteNombre: row.cliente.nombre,
      rolCodigo: row.rol.codigo,
      permisos: row.rol.rolesPermisos.map((rp) => rp.permiso.codigo),
    };
  }
}
