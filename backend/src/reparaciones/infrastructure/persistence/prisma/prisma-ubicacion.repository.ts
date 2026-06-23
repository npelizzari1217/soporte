/**
 * PrismaUbicacionRepository — implementación del puerto IUbicacionRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ UbicacionEntity vía UbicacionMapper.
 * - save() es un upsert por id.
 * - delete() es soft delete: setea deleted_at = now().
 * - findAllActive() retorna solo activo=true Y deleted_at IS NULL.
 * - findSubtree() usa WITH RECURSIVE (CTE) para obtener el árbol completo
 *   en una sola query, dentro de la transacción activa para garantizar atomicidad.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 5.C.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IUbicacionRepository } from '../../../domain/ports/i-ubicacion.repository';
import { UbicacionEntity } from '../../../domain/entities/ubicacion.entity';
import { UbicacionMapper, RawUbicacionRow } from './ubicacion.mapper';

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

  async findAllActive(): Promise<UbicacionEntity[]> {
    const rows = await this.client.ubicacion.findMany({
      where: { activo: true, deletedAt: null },
    });
    return rows.map(UbicacionMapper.toDomain);
  }

  /**
   * Retorna el subárbol completo (raíz + todos los descendientes no soft-deleted)
   * usando una CTE recursiva (WITH RECURSIVE) dentro de la transacción activa.
   *
   * Esto garantiza atomicidad total: la lectura del árbol y las escrituras
   * posteriores (soft-delete + operaciones) ocurren en la MISMA transacción.
   *
   * Implementación:
   *   - Base case: el nodo raíz (WHERE id = $1 AND deleted_at IS NULL).
   *   - Recursive case: hijos directos de cada nodo ya en el set (INNER JOIN).
   *   - Ambos filtran deleted_at IS NULL → solo nodos vivos.
   *
   * @param ubicacionId UUID del nodo raíz del subárbol.
   * @returns [raíz, ...descendientes] en orden BFS. Vacío si no existe o ya deleted.
   */
  async findSubtree(ubicacionId: string): Promise<UbicacionEntity[]> {
    const rows = await this.client.$queryRawUnsafe<RawUbicacionRow[]>(
      `
      WITH RECURSIVE subtree AS (
        SELECT id, nombre, descripcion, padre_id, activo,
               created_at, updated_at, deleted_at
        FROM ubicaciones
        WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT u.id, u.nombre, u.descripcion, u.padre_id, u.activo,
               u.created_at, u.updated_at, u.deleted_at
        FROM ubicaciones u
        INNER JOIN subtree s ON u.padre_id = s.id
        WHERE u.deleted_at IS NULL
      )
      SELECT * FROM subtree
      `,
      ubicacionId,
    );
    return rows.map(UbicacionMapper.toDomainFromRaw);
  }

  async save(ubicacion: UbicacionEntity): Promise<void> {
    const data = UbicacionMapper.toPersistence(ubicacion);
    const { id, ...updateData } = data;
    await this.client.ubicacion.upsert({
      where: { id },
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
