/**
 * PrismaUsuarioTiposTicketRepository — implementación del puerto IUsuarioTiposTicketRepository.
 *
 * Gestiona la elegibilidad de asignación de usuarios a tipos de ticket.
 * La tabla `usuario_tipos_ticket` NO tiene soft delete: baja = eliminación física.
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 * - assign() es idempotente (skipDuplicates en createMany).
 * - revoke() es idempotente (no falla si la fila no existe).
 *
 * Tarea: 3.D.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IUsuarioTiposTicketRepository } from '../../../domain/ports/i-usuario-tipos-ticket.repository';

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

  async findTipoIdsByUsuario(usuarioId: string): Promise<string[]> {
    const rows = await this.client.usuarioTiposTicket.findMany({
      where: { usuarioId },
      select: { tipoTicketId: true },
    });
    return rows.map((r) => r.tipoTicketId);
  }

  async findUsuarioIdsByTipo(tipoTicketId: string): Promise<string[]> {
    const rows = await this.client.usuarioTiposTicket.findMany({
      where: { tipoTicketId },
      select: { usuarioId: true },
    });
    return rows.map((r) => r.usuarioId);
  }

  async assign(usuarioId: string, tipoTicketId: string): Promise<void> {
    // Idempotente: createMany con skipDuplicates ignora el error de PK duplicada
    await this.client.usuarioTiposTicket.createMany({
      data: [{ usuarioId, tipoTicketId }],
      skipDuplicates: true,
    });
  }

  async revoke(usuarioId: string, tipoTicketId: string): Promise<void> {
    // Idempotente: deleteMany no falla si la fila no existe
    await this.client.usuarioTiposTicket.deleteMany({
      where: { usuarioId, tipoTicketId },
    });
  }
}
