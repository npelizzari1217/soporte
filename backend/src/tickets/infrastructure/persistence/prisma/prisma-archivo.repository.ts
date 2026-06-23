/**
 * PrismaArchivoRepository — implementación del puerto IArchivoRepository.
 *
 * Gestiona solo METADATA de archivos. El binario vive en IFileStorage.
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 * - save() es solo INSERT (archivos son inmutables una vez subidos).
 * - linkToTicket() crea la fila en archivos_ticket (join N:M).
 * - delete() es soft delete: setea deleted_at = now().
 * - findByTicketId() excluye archivos soft-deleted.
 *
 * Tarea: 3.D.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IArchivoRepository } from '../../../domain/ports/i-archivo.repository';
import { ArchivoEntity } from '../../../domain/entities/archivo.entity';
import { ArchivoMapper } from './archivo.mapper';

@Injectable()
export class PrismaArchivoRepository implements IArchivoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<ArchivoEntity | null> {
    const row = await this.client.archivo.findUnique({ where: { id } });
    return row ? ArchivoMapper.toDomain(row) : null;
  }

  async findByStorageKey(storageKey: string): Promise<ArchivoEntity | null> {
    const row = await this.client.archivo.findUnique({ where: { storageKey } });
    return row ? ArchivoMapper.toDomain(row) : null;
  }

  async findByTicketId(ticketId: string): Promise<ArchivoEntity[]> {
    // Busca archivos no soft-deleted vinculados al ticket via archivos_ticket
    const rows = await this.client.archivo.findMany({
      where: {
        deletedAt: null,
        archivosTicket: {
          some: { ticketId },
        },
      },
    });
    return rows.map(ArchivoMapper.toDomain);
  }

  async save(archivo: ArchivoEntity): Promise<void> {
    // Solo INSERT: archivos son inmutables
    const data = ArchivoMapper.toPersistence(archivo);
    await this.client.archivo.create({ data });
  }

  async linkToTicket(archivoId: string, ticketId: string): Promise<void> {
    // Crea la fila en archivos_ticket (join N:M)
    // Si ya existe (idempotente), Prisma lanzará un error único — el use case
    // garantiza que se llama solo una vez por combinación archivo+ticket.
    await this.client.archivoTicket.create({
      data: { archivoId, ticketId },
    });
  }

  async delete(id: string): Promise<void> {
    // Soft delete: setea deleted_at = now()
    await this.client.archivo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
