import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IClienteRepository } from '../../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';
import { ClienteMapper } from './cliente.mapper';

/**
 * PrismaClienteRepository — implementación del puerto IClienteRepository
 * usando el MasterPrismaClient de PrismaService.
 *
 * Reglas:
 * - Obtiene el master client vía PrismaService (inyectado desde SharedModule).
 * - NO importa @prisma/client directamente — solo usa el client tipado del servicio.
 * - Mapea Prisma rows ↔ ClienteEntity vía ClienteMapper.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe).
 *
 * Tarea: 1.C.2
 */
@Injectable()
export class PrismaClienteRepository implements IClienteRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findById(id: string): Promise<ClienteEntity | null> {
    const row = await this.client.cliente.findUnique({
      where: { id },
    });
    return row ? ClienteMapper.toDomain(row) : null;
  }

  async findByDbName(dbName: string): Promise<ClienteEntity | null> {
    const row = await this.client.cliente.findUnique({
      where: { dbName },
    });
    return row ? ClienteMapper.toDomain(row) : null;
  }

  async findAll(): Promise<ClienteEntity[]> {
    const rows = await this.client.cliente.findMany();
    return rows.map(ClienteMapper.toDomain);
  }

  async save(cliente: ClienteEntity): Promise<void> {
    const data = ClienteMapper.toPersistence(cliente);
    const { id, ...updateData } = data;
    await this.client.cliente.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.cliente.delete({ where: { id } });
  }
}
