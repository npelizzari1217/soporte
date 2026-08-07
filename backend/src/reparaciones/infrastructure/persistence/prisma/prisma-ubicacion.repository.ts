/**
 * PrismaUbicacionRepository — implementación del puerto IUbicacionRepository.
 *
 * `findSubtree` usa una CTE recursiva (`WITH RECURSIVE`) vía `$queryRaw`
 * (mismo patrón que `PrismaTicketRepository.findLastSecuencia`, el único
 * uso previo de SQL crudo en el proyecto): obtiene la raíz + TODOS sus
 * descendientes no soft-deleted en una sola query, dentro de la transacción
 * activa (garantiza atomicidad total de lectura+borrado en
 * `EliminarUbicacionUseCase`, riesgo técnico #3 del design).
 *
 * Tarea: T7.2, T7.3, T7.4.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IUbicacionRepository } from '../../../domain/ports/i-ubicacion.repository';
import { UbicacionEntity } from '../../../domain/entities/ubicacion.entity';
import { UbicacionMapper } from './ubicacion.mapper';

/** Fila cruda retornada por la CTE recursiva de `findSubtree` (columnas snake_case de la tabla `ubicaciones`). */
interface UbicacionSubtreeRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  padre_id: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

@Injectable()
export class PrismaUbicacionRepository implements IUbicacionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<UbicacionEntity | null> {
    const row = await this.client.ubicacion.findUnique({ where: { id } });
    return row ? UbicacionMapper.toDomain(row) : null;
  }

  async findAll(): Promise<UbicacionEntity[]> {
    const rows = await this.client.ubicacion.findMany({
      where: { deletedAt: null },
      orderBy: { nombre: 'asc' },
    });
    return rows.map(UbicacionMapper.toDomain);
  }

  /**
   * CTE recursiva: parte de la raíz (`ubicacionId`) y desciende por
   * `padre_id` hasta agotar el árbol. Excluye nodos soft-deleted en CADA
   * nivel (un descendiente eliminado corta esa rama, mismo criterio que un
   * `LEFT JOIN` con filtro).
   */
  async findSubtree(ubicacionId: string): Promise<UbicacionEntity[]> {
    const rows = await this.client.$queryRaw<UbicacionSubtreeRow[]>`
      WITH RECURSIVE subtree AS (
        SELECT id, nombre, descripcion, padre_id, activo, created_at, updated_at, deleted_at
        FROM ubicaciones
        WHERE id = ${ubicacionId}::uuid AND deleted_at IS NULL
        UNION ALL
        SELECT u.id, u.nombre, u.descripcion, u.padre_id, u.activo, u.created_at, u.updated_at, u.deleted_at
        FROM ubicaciones u
        INNER JOIN subtree s ON u.padre_id = s.id
        WHERE u.deleted_at IS NULL
      )
      SELECT * FROM subtree
    `;

    return rows.map((row) =>
      UbicacionEntity.reconstitute(
        {
          nombre: row.nombre,
          descripcion: row.descripcion,
          padreId: row.padre_id,
          activo: row.activo,
        },
        row.id,
        row.created_at,
        row.updated_at,
        row.deleted_at,
      ),
    );
  }

  async save(ubicacion: UbicacionEntity): Promise<void> {
    const data = UbicacionMapper.toPersistence(ubicacion);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.ubicacion.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.ubicacion.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
