/**
 * PrismaTicketEdiliciaRepository — implementación del puerto
 * ITicketEdiliciaRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
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
import { AlcanceListadoTickets } from '../../../../tickets/domain/ports/i-ticket.repository';
import { whereAlcanceListado } from '../../../../tickets/infrastructure/persistence/prisma/alcance-listado.prisma';

@Injectable()
export class PrismaTicketEdiliciaRepository implements ITicketEdiliciaRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findByTicketId(ticketId: string): Promise<TicketEdiliciaEntity | null> {
    const row = await this.client.ticketEdilicia.findUnique({ where: { ticketId } });
    return row ? TicketEdiliciaMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<TicketEdiliciaEntity | null> {
    const row = await this.client.ticketEdilicia.findUnique({ where: { id } });
    return row ? TicketEdiliciaMapper.toDomain(row) : null;
  }

  async findAll(alcance: AlcanceListadoTickets | null): Promise<TicketEdiliciaEntity[]> {
    const rows = await this.client.ticketEdilicia.findMany({
      where: {
        deletedAt: null,
        // Un ticket base borrado (odd/permisos-por-tipo-ticket, S8) saca a su reparación del
        // listado. El alcance se mide sobre el ticket base, con la misma regla que el listado de
        // tickets.
        ticket: { deletedAt: null, ...(alcance !== null && whereAlcanceListado(alcance)) },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(TicketEdiliciaMapper.toDomain);
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
