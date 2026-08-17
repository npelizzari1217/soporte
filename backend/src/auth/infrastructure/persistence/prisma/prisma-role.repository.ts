/**
 * PrismaRoleRepository — implementación del puerto IRoleRepository.
 *
 * Los roles son datos de catálogo (read-only en el flujo de auth de PR5). El
 * alta/edición de roles vive fuera de esta fase.
 *
 * findByCodigo: excluye roles soft-deleted (deletedAt: null) — evita
 * resolver un rol legacy dado de baja lógica. Retorna RoleEntity básico
 * (sin permisos).
 *
 * Fix post-verify C2 (sdd/matriz-permisos-por-usuario): `findWithPermisos`
 * (JOIN `role → rolesPermisos → permiso`, RBAC viejo) se retiró — CERO
 * consumidores de producción (los permisos salen de la matriz nueva desde
 * WU-7.1) y tocaba las mismas tablas que `drop-legacy-rbac-matriz-vieja.sql`
 * (WU-9) dropea. Mismo criterio que `PrismaMembresiaRepository`.
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IRoleRepository } from '../../../domain/ports/i-role.repository';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { RoleMapper } from './role.mapper';

@Injectable()
export class PrismaRoleRepository implements IRoleRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findByCodigo(codigo: string): Promise<RoleEntity | null> {
    const row = await this.client.role.findFirst({
      where: { codigo, deletedAt: null },
    });
    return row ? RoleMapper.toDomain(row) : null;
  }

  async findAll(): Promise<RoleEntity[]> {
    const rows = await this.client.role.findMany({
      where: { deletedAt: null },
      orderBy: { nombre: 'asc' },
    });
    return rows.map((row) => RoleMapper.toDomain(row));
  }
}
