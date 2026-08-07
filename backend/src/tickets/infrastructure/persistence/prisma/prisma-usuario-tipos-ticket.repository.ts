/**
 * PrismaUsuarioTiposTicketRepository — implementación del puerto
 * IUsuarioTiposTicketRepository (routing usuario↔tipo_ticket, spec T3).
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - `assign()` es idempotente (`createMany` + `skipDuplicates` ignora la
 *   violación de PK compuesta si la fila ya existe).
 * - `revoke()` es idempotente (`deleteMany` no falla si la fila no existe).
 * - Sin soft delete: la tabla `usuario_tipos_ticket` no tiene `deleted_at`
 *   (spec T3 — la baja es eliminación física).
 *
 * Tarea: T8.3
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  IUsuarioTiposTicketRepository,
  RoutingAsociacion,
} from '../../../domain/ports/i-usuario-tipos-ticket.repository';

@Injectable()
export class PrismaUsuarioTiposTicketRepository implements IUsuarioTiposTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async isUserEligibleForType(usuarioId: string, tipoTicketId: string): Promise<boolean> {
    const row = await this.client.usuarioTiposTicket.findUnique({
      where: { usuarioId_tipoTicketId: { usuarioId, tipoTicketId } },
    });
    return row !== null;
  }

  async findAll(): Promise<RoutingAsociacion[]> {
    const rows = await this.client.usuarioTiposTicket.findMany();
    return rows.map((row) => ({ usuarioId: row.usuarioId, tipoTicketId: row.tipoTicketId }));
  }

  async assign(usuarioId: string, tipoTicketId: string): Promise<void> {
    await this.client.usuarioTiposTicket.createMany({
      data: [{ usuarioId, tipoTicketId }],
      skipDuplicates: true,
    });
  }

  async revoke(usuarioId: string, tipoTicketId: string): Promise<void> {
    await this.client.usuarioTiposTicket.deleteMany({
      where: { usuarioId, tipoTicketId },
    });
  }
}
