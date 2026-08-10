/**
 * PrismaTipoComponenteMasterRepository — implementación del puerto
 * ITipoComponenteMasterRepository usando el MasterPrismaClient de
 * PrismaService (el catálogo de tipos de componente es global, vive en
 * MASTER).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITipoComponenteMasterRepository } from '../../../domain/ports/i-tipo-componente-master.repository';
import { TipoComponente } from '../../../domain/entities/tipo-componente.entity';
import { TipoComponenteMasterMapper } from './tipo-componente-master.mapper';

@Injectable()
export class PrismaTipoComponenteMasterRepository implements ITipoComponenteMasterRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async findById(id: string): Promise<TipoComponente | null> {
    const row = await this.client.tipoComponente.findUnique({ where: { id } });
    return row ? TipoComponenteMasterMapper.toDomain(row) : null;
  }

  async findByCodigo(codigo: string): Promise<TipoComponente | null> {
    const row = await this.client.tipoComponente.findUnique({ where: { codigo } });
    return row ? TipoComponenteMasterMapper.toDomain(row) : null;
  }

  async findAll(): Promise<TipoComponente[]> {
    const rows = await this.client.tipoComponente.findMany();
    return rows.map((row) => TipoComponenteMasterMapper.toDomain(row));
  }

  async save(tipo: TipoComponente): Promise<void> {
    const data = TipoComponenteMasterMapper.toPersistence(tipo);
    const { id, ...updateData } = data;

    await this.client.tipoComponente.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }
}
