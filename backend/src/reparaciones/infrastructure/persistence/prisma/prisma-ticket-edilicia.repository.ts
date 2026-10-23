/**
 * PrismaTicketEdiliciaRepository — implementación del puerto
 * ITicketEdiliciaRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Las lecturas traen la ubicación del ticket base (odd/ticket-unificado): la
 *   columna `ticket_edilicia.ubicacion` quedó congelada y no se lee ni se escribe.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe); nunca
 *   pisa `createdAt` en el UPDATE (mismo patrón que PrismaTicketCompraRepository).
 *
 * Tarea: T7.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITicketEdiliciaRepository } from '../../../domain/ports/i-ticket-edilicia.repository';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';
import { TicketEdiliciaMapper } from './ticket-edilicia.mapper';

/** La ubicación del ticket base, lo único que el mapper lee del ticket. */
const CON_UBICACION_DEL_TICKET = { ticket: { select: { ubicacion: true } } } as const;

@Injectable()
export class PrismaTicketEdiliciaRepository implements ITicketEdiliciaRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findByTicketId(ticketId: string): Promise<TicketEdiliciaEntity | null> {
    const row = await this.client.ticketEdilicia.findUnique({
      where: { ticketId },
      include: CON_UBICACION_DEL_TICKET,
    });
    return row ? TicketEdiliciaMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<TicketEdiliciaEntity | null> {
    const row = await this.client.ticketEdilicia.findUnique({
      where: { id },
      include: CON_UBICACION_DEL_TICKET,
    });
    return row ? TicketEdiliciaMapper.toDomain(row) : null;
  }

  async save(ticketEdilicia: TicketEdiliciaEntity): Promise<void> {
    const data = TicketEdiliciaMapper.toPersistence(ticketEdilicia);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.ticketEdilicia.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
