/**
 * PrismaTipoTicketRepository — implementación del puerto ITipoTicketRepository.
 *
 * Catálogo EDITABLE (spec T2): base sembrada en provisioning + altas custom
 * del ADMINISTRADOR (CRUD en PR11). Este repo (PR2) es SOLO LECTURA — el
 * CRUD de escritura se agrega en PR11.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - findAllActive() excluye tipos soft-deleted (dar de baja NO rompe
 *   tickets existentes que lo referencian — spec T2).
 *
 * Tarea: T2.3
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITipoTicketRepository } from '../../../domain/ports/i-tipo-ticket.repository';
import { TipoTicketEntity } from '../../../domain/entities/tipo-ticket.entity';
import { TipoTicketMapper } from './tipo-ticket.mapper';

@Injectable()
export class PrismaTipoTicketRepository implements ITipoTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<TipoTicketEntity | null> {
    const row = await this.client.tipoTicket.findUnique({ where: { id } });
    return row ? TipoTicketMapper.toDomain(row) : null;
  }

  async findByCodigo(codigo: string): Promise<TipoTicketEntity | null> {
    const row = await this.client.tipoTicket.findUnique({ where: { codigo } });
    return row ? TipoTicketMapper.toDomain(row) : null;
  }

  async findIdByCodigo(codigo: string): Promise<string | null> {
    const row = await this.client.tipoTicket.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findAllActive(): Promise<TipoTicketEntity[]> {
    const rows = await this.client.tipoTicket.findMany({
      where: { deletedAt: null },
      orderBy: { codigo: 'asc' },
    });
    return rows.map(TipoTicketMapper.toDomain);
  }

  /**
   * Upsert por id (T11.1, PR11): INSERT si es nuevo, UPDATE si existe.
   * Nunca pisa `createdAt` en el UPDATE.
   */
  async save(tipo: TipoTicketEntity): Promise<void> {
    const data = TipoTicketMapper.toPersistence(tipo);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.tipoTicket.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
