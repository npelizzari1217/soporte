/**
 * PrismaReparacionCompraRepository — implementación del puerto
 * IReparacionCompraRepository sobre `ticket_compra` (odd/ticket-unificado, S1).
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - `vincular()` es `createMany({ skipDuplicates: true })` (D4): la UNIQUE
 *   de `ticket_compra` resuelve la idempotencia en la base vía
 *   `ON CONFLICT DO NOTHING`, sin check-then-insert.
 * - `desvincular()` es hard delete real (D5), `deleteMany` por el par.
 * - `findComprasVinculadasByTicketIds()` filtra `compra.deletedAt IS NULL`
 *   (D6) EN LA CONSULTA (relation filter de Prisma), no en memoria después.
 * - La tabla vieja `reparacion_compra` ya no existe (migración 20261025150000): la fuente es
 *   `ticket_compra`.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D2/D3/D4/D5/D6.
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
   * `(ticket_id, compra_id)`. Si `compraId` no existe, la FK RESTRICT sí
   * rechaza el INSERT (skipDuplicates solo absorbe conflictos de UNIQUE).
   */
  async vincular(ticketId: string, compraId: string): Promise<void> {
    await this.client.ticketCompra.createMany({
      data: [{ ticketId, compraId }],
      skipDuplicates: true,
    });
  }

  /** Hard delete real del vínculo (D5) — sin `deleted_at`, la fila deja de existir. */
  async desvincular(ticketId: string, compraId: string): Promise<void> {
    await this.client.ticketCompra.deleteMany({ where: { ticketId, compraId } });
  }

  async findComprasVinculadasByTicketIds(
    ticketIds: string[],
  ): Promise<Map<string, CompraVinculada[]>> {
    // Cortar acá y no delegar en Prisma: un `IN ()` vacío es una ida a la
    // base cuyo resultado ya conocemos.
    if (ticketIds.length === 0) {
      return new Map();
    }

    const rows = await this.client.ticketCompra.findMany({
      where: {
        ticketId: { in: ticketIds },
        // D6: compra.deletedAt IS NULL filtrado EN LA CONSULTA (relation
        // filter), no leído y descartado después.
        compra: { deletedAt: null },
      },
      include: { compra: { include: { items: true } } },
      orderBy: { compra: { numero: 'asc' } },
    });

    const resultado = new Map<string, CompraVinculada[]>();
    for (const row of rows) {
      const compraVinculada = ReparacionCompraMapper.toCompraVinculada(row);
      const existentes = resultado.get(row.ticketId);
      if (existentes === undefined) {
        resultado.set(row.ticketId, [compraVinculada]);
      } else {
        existentes.push(compraVinculada);
      }
    }
    return resultado;
  }
}
