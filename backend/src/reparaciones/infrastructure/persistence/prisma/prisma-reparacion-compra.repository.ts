/**
 * PrismaReparacionCompraRepository — implementación del puerto
 * IReparacionCompraRepository (WU1.5).
 *
 * Reglas (mismo patrón que `PrismaComentarioReparacionRepository`):
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - `vincular()` es `createMany({ skipDuplicates: true })` (D4): la UNIQUE
 *   de `reparacion_compra` resuelve la idempotencia en la base vía
 *   `ON CONFLICT DO NOTHING`, sin check-then-insert.
 * - `desvincular()` es hard delete real (D5), `deleteMany` por el par.
 * - `findComprasVinculadasByTicketEdiliciaIds()` filtra `compra.deletedAt IS
 *   NULL` (D6) EN LA CONSULTA (relation filter de Prisma), no en memoria
 *   después.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D2/D3/D4/D5/D6.
 * Tarea: WU2.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IReparacionCompraRepository } from '../../../domain/ports/i-reparacion-compra.repository';
import { CompraVinculada } from '../../../domain/services/bloqueo-reparacion';
import { ReparacionCompraMapper } from './reparacion-compra.mapper';

@Injectable()
export class PrismaReparacionCompraRepository implements IReparacionCompraRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * `createMany({ skipDuplicates: true })` sobre un único registro: Postgres
   * lo resuelve como `INSERT ... ON CONFLICT DO NOTHING` contra la UNIQUE
   * `(ticket_edilicia_id, compra_id)`. Si `compraId` no existe, la FK
   * RESTRICT sí rechaza el INSERT (skipDuplicates solo absorbe conflictos de
   * UNIQUE, no violaciones de FK).
   */
  async vincular(ticketEdiliciaId: string, compraId: string): Promise<void> {
    await this.client.reparacionCompra.createMany({
      data: [{ ticketEdiliciaId, compraId }],
      skipDuplicates: true,
    });
  }

  /** Hard delete real del vínculo (D5) — sin `deleted_at`, la fila deja de existir. */
  async desvincular(ticketEdiliciaId: string, compraId: string): Promise<void> {
    await this.client.reparacionCompra.deleteMany({
      where: { ticketEdiliciaId, compraId },
    });
  }

  async findComprasVinculadasByTicketEdiliciaIds(
    ticketEdiliciaIds: string[],
  ): Promise<Map<string, CompraVinculada[]>> {
    // Cortar acá y no delegar en Prisma: un `IN ()` vacío es una ida a la
    // base cuyo resultado ya conocemos.
    if (ticketEdiliciaIds.length === 0) {
      return new Map();
    }

    const rows = await this.client.reparacionCompra.findMany({
      where: {
        ticketEdiliciaId: { in: ticketEdiliciaIds },
        // D6: compra.deletedAt IS NULL filtrado EN LA CONSULTA (relation
        // filter), no leído y descartado después.
        compra: { deletedAt: null },
      },
      include: { compra: { include: { items: true } } },
    });

    const resultado = new Map<string, CompraVinculada[]>();
    for (const row of rows) {
      const compraVinculada = ReparacionCompraMapper.toCompraVinculada(row);
      const existentes = resultado.get(row.ticketEdiliciaId);
      if (existentes === undefined) {
        resultado.set(row.ticketEdiliciaId, [compraVinculada]);
      } else {
        existentes.push(compraVinculada);
      }
    }
    return resultado;
  }
}
