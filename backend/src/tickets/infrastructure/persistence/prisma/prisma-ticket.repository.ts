/**
 * PrismaTicketRepository — implementación del puerto ITicketRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ TicketEntity vía TicketMapper.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe).
 * - delete() es soft delete: setea deleted_at = now().
 * - findLastSecuencia() parsea la secuencia del campo `numero` (formato {PREFIX}-{YEAR}-{SEQ}).
 *
 * Tarea: 3.D.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITicketRepository } from '../../../domain/ports/i-ticket.repository';
import { TicketEntity } from '../../../domain/entities/ticket.entity';
import { TicketMapper } from './ticket.mapper';

@Injectable()
export class PrismaTicketRepository implements ITicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  /**
   * Retorna el cliente Prisma del tenant activo.
   * Lanza si no hay TenantContext activo.
   */
  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<TicketEntity | null> {
    const row = await this.client.ticket.findUnique({ where: { id } });
    return row ? TicketMapper.toDomain(row) : null;
  }

  async findByNumero(numero: string): Promise<TicketEntity | null> {
    const row = await this.client.ticket.findUnique({ where: { numero } });
    return row ? TicketMapper.toDomain(row) : null;
  }

  async findLastSecuencia(tipoId: string, anio: number): Promise<number> {
    // numero format: {PREFIX}-{YEAR}-{SEQ5} e.g. "SOP-2026-00042"
    // Filtramos por tipoId + numero que contiene el año y tomamos el mayor (desc por numero).
    // Dado que la secuencia es zero-padded a 5 dígitos, el orden string = orden numérico.
    const yearStr = String(anio);

    const rows = await this.client.ticket.findMany({
      where: {
        tipoId,
        numero: { contains: `-${yearStr}-` },
      },
      select: { numero: true },
      orderBy: { numero: 'desc' },
      take: 1,
    });

    if (rows.length === 0) return 0;

    // Parsear la secuencia del último segmento: "SOP-2026-00042" → ["SOP","2026","00042"]
    const parts = rows[0].numero.split('-');
    return parseInt(parts[parts.length - 1], 10) || 0;
  }

  async findByEstado(estadoId: string): Promise<TicketEntity[]> {
    const rows = await this.client.ticket.findMany({
      where: { estadoId, deletedAt: null },
    });
    return rows.map(TicketMapper.toDomain);
  }

  async save(ticket: TicketEntity): Promise<void> {
    const data = TicketMapper.toPersistence(ticket);
    const { id, ...updateData } = data;
    await this.client.ticket.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    // Soft delete: seta deleted_at = now()
    await this.client.ticket.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
