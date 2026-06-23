/**
 * PrismaPresupuestoRepository — implementación del puerto IPresupuestoRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ PresupuestoEntity vía PresupuestoMapper.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe).
 *   Usado por SeleccionarPresupuestoUseCase para el swap atómico de seleccionado.
 * - delete() es soft delete: setea deleted_at = now().
 * - findByTicketCompraId() retorna solo activos (deleted_at IS NULL).
 * - findSelectedByTicketCompraId() retorna el único presupuesto con seleccionado=TRUE
 *   y deleted_at IS NULL, o null si no hay ninguno seleccionado.
 *
 * Invariante de negocio (garantizada por SeleccionarPresupuestoUseCase):
 * Solo un presupuesto puede tener seleccionado=TRUE por ticket_compra_id a la vez.
 * El swap atómico se realiza fuera de este repositorio, dentro de TenantTransactionRunner.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 4.C.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPresupuestoRepository } from '../../../domain/ports/i-presupuesto.repository';
import { PresupuestoEntity } from '../../../domain/entities/presupuesto.entity';
import { PresupuestoMapper } from './presupuesto.mapper';

@Injectable()
export class PrismaPresupuestoRepository implements IPresupuestoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<PresupuestoEntity | null> {
    const row = await this.client.presupuesto.findUnique({ where: { id } });
    return row ? PresupuestoMapper.toDomain(row) : null;
  }

  async findByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity[]> {
    // Solo activos (deleted_at IS NULL).
    const rows = await this.client.presupuesto.findMany({
      where: { ticketCompraId, deletedAt: null },
    });
    return rows.map(PresupuestoMapper.toDomain);
  }

  async findSelectedByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity | null> {
    // Retorna el presupuesto activo (deleted_at IS NULL) con seleccionado=TRUE.
    // La invariante de negocio garantiza que hay a lo sumo uno.
    // findFirst es seguro aquí: la invariante es mantenida por el use case.
    const row = await this.client.presupuesto.findFirst({
      where: { ticketCompraId, seleccionado: true, deletedAt: null },
    });
    return row ? PresupuestoMapper.toDomain(row) : null;
  }

  async save(presupuesto: PresupuestoEntity): Promise<void> {
    const data = PresupuestoMapper.toPersistence(presupuesto);
    const { id, ...updateData } = data;
    await this.client.presupuesto.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.presupuesto.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
