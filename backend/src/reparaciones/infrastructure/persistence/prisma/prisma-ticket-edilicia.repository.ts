/**
 * PrismaTicketEdiliciaRepository — implementación del puerto ITicketEdiliciaRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ TicketEdiliciaEntity vía TicketEdiliciaMapper.
 * - save() es un upsert por id (incluye actualización de porcentajeAvance).
 * - delete() es soft delete: setea deleted_at = now().
 * - findByUbicacionId() excluye soft-deleted (deleted_at IS NULL).
 *   Usado por EliminarUbicacionUseCase para detectar tickets afectados.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 5.C.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITicketEdiliciaRepository } from '../../../domain/ports/i-ticket-edilicia.repository';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';
import { TicketEdiliciaMapper } from './ticket-edilicia.mapper';

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

  async findByUbicacionId(ubicacionId: string): Promise<TicketEdiliciaEntity[]> {
    // Excluye soft-deleted: solo tickets edilicios activos (deleted_at IS NULL).
    // Usado por EliminarUbicacionUseCase para registrar eventos en tickets afectados.
    const rows = await this.client.ticketEdilicia.findMany({
      where: { ubicacionId, deletedAt: null },
    });
    return rows.map(TicketEdiliciaMapper.toDomain);
  }

  async save(ticketEdilicia: TicketEdiliciaEntity): Promise<void> {
    const data = TicketEdiliciaMapper.toPersistence(ticketEdilicia);
    const { id, ...updateData } = data;
    await this.client.ticketEdilicia.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.ticketEdilicia.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
