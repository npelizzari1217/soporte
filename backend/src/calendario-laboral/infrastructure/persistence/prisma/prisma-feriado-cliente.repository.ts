/**
 * PrismaFeriadoClienteRepository — implementación de
 * IFeriadoClienteRepository sobre el PrismaClient del TENANT activo (WU3a,
 * sdd/feriados-configurables). Obtiene el cliente vía `TenantContext`
 * (nunca `PrismaService` directo) — mismo patrón que
 * `PrismaTipoTicketRepository`.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IFeriadoClienteRepository } from '../../../domain/ports/i-feriado-cliente.repository';
import { FeriadoEntity } from '../../../domain/entities/feriado.entity';
import { PrismaFeriadoClienteMapper } from './prisma-feriado-cliente.mapper';

@Injectable()
export class PrismaFeriadoClienteRepository implements IFeriadoClienteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async listar(): Promise<FeriadoEntity[]> {
    const filas = await this.client.feriadoCliente.findMany({ orderBy: { fecha: 'asc' } });
    return filas.map((fila) => PrismaFeriadoClienteMapper.toDomain(fila));
  }

  async buscarPorId(id: string): Promise<FeriadoEntity | null> {
    const fila = await this.client.feriadoCliente.findUnique({ where: { id } });
    return fila ? PrismaFeriadoClienteMapper.toDomain(fila) : null;
  }

  async crear(feriado: FeriadoEntity): Promise<void> {
    const data = PrismaFeriadoClienteMapper.toPersistence(feriado);
    await this.client.feriadoCliente.create({ data });
  }

  async editar(feriado: FeriadoEntity): Promise<void> {
    const { id, ...data } = PrismaFeriadoClienteMapper.toPersistence(feriado);
    await this.client.feriadoCliente.update({ where: { id }, data });
  }

  /** Baja física — el feriado de cliente no tiene soft delete (D1). */
  async eliminar(id: string): Promise<void> {
    await this.client.feriadoCliente.delete({ where: { id } });
  }
}
