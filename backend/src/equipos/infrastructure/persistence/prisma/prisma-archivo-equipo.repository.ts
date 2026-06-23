/**
 * PrismaArchivoEquipoRepository — repositorio de infraestructura para archivos_equipo.
 *
 * ArchivoEquipo es una tabla join (archivo_id, equipo_id) sin entidad de dominio propia.
 * No se creó entidad en 6.A por diseño del spec.
 * Este repositorio opera directamente sobre la tabla join, siguiendo el patrón
 * de ArchivoTicket (tickets/infrastructure) y ArchivoPresupuesto (compras/infrastructure).
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 * - Sin soft delete: la baja es eliminación física (ON DELETE CASCADE desde archivos/equipos).
 *
 * DECISIÓN INFERIDA: ArchivoEquipo no tiene entidad de dominio (confirmado por el spec
 * que no creó una en 6.A). Si en el futuro se necesita upload de adjuntos a equipos,
 * se deberá crear un puerto IAdjuntarArchivoEquipoUseCase y opcionalmente la entidad.
 * MARCAR para consulta si se necesita.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 6.C.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

@Injectable()
export class PrismaArchivoEquipoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * Vincula un archivo existente a un equipo (INSERT en archivos_equipo).
   *
   * @param archivoId UUID del archivo (debe existir en la tabla archivos).
   * @param equipoId  UUID del equipo (debe existir en equipos_informaticos).
   */
  async linkToEquipo(archivoId: string, equipoId: string): Promise<void> {
    await this.client.archivoEquipo.create({
      data: { archivoId, equipoId },
    });
  }

  /**
   * Desvincula un archivo de un equipo (DELETE físico — no soft delete).
   * La fila se elimina permanentemente.
   *
   * @param archivoId UUID del archivo.
   * @param equipoId  UUID del equipo.
   */
  async unlinkFromEquipo(archivoId: string, equipoId: string): Promise<void> {
    await this.client.archivoEquipo.delete({
      where: { archivoId_equipoId: { archivoId, equipoId } },
    });
  }

  /**
   * Retorna los IDs de archivos vinculados a un equipo.
   *
   * @param equipoId UUID del equipo.
   */
  async findArchivoIdsByEquipoId(equipoId: string): Promise<string[]> {
    const rows = await this.client.archivoEquipo.findMany({
      where: { equipoId },
      select: { archivoId: true },
    });
    return rows.map((r) => r.archivoId);
  }
}
