/**
 * MembresiaMapper — proyecta una fila Prisma Membresia (con cliente + rol
 * incluidos) a `MembresiaResuelta` (puerto `IMembresiaRepository`).
 *
 * A diferencia del resto de los mappers, NO produce una entidad de dominio:
 * `MembresiaResuelta` es una PROYECCIÓN de solo-lectura pensada para
 * alimentar el JWT (R4, R6) sin round-trips adicionales — LoginUseCase/
 * SwitchTenantUseCase/RefreshTokenUseCase (PR3/PR4) la consumen tal cual.
 *
 * Fix post-verify C2 (sdd/matriz-permisos-por-usuario): ya NO incluye
 * `rol → rolesPermisos → permiso` (RBAC viejo, tablas que WU-9 dropea) — ver
 * `MembresiaResuelta` para el detalle.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: T5.3 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import type {
  Membresia as PrismaMembresia,
  Cliente as PrismaCliente,
  Role as PrismaRole,
} from '.prisma/master';
import { MembresiaResuelta } from '../../../domain/ports/i-membresia.repository';

/** Prisma row con el JOIN membresia → cliente + rol (SIN permisos, C2). */
export type PrismaMembresiaResuelta = PrismaMembresia & {
  cliente: PrismaCliente;
  rol: PrismaRole;
};

export class MembresiaMapper {
  static toResuelta(row: PrismaMembresiaResuelta): MembresiaResuelta {
    return {
      clienteId: row.cliente.id,
      clienteNombre: row.cliente.nombre,
      rolCodigo: row.rol.codigo,
      clienteRequiere2fa: row.cliente.requiere2fa,
    };
  }
}
