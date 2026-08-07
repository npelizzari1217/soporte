/**
 * PrismaCicloVigenteRepository — implementación del puerto
 * ICicloVigenteRepository usando el MasterPrismaClient de PrismaService
 * (los ciclos vigentes son globales, viven en MASTER).
 *
 * Tarea: T9.6 (PR9 — Ciclos)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ICicloVigenteRepository } from '../../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../../domain/entities/ciclo-vigente.entity';
import { CicloVigenteMapper } from './ciclo-vigente.mapper';

@Injectable()
export class PrismaCicloVigenteRepository implements ICicloVigenteRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async findById(id: string): Promise<CicloVigenteEntity | null> {
    const row = await this.client.cicloVigente.findUnique({ where: { id } });
    return row ? CicloVigenteMapper.toDomain(row) : null;
  }

  async save(ciclo: CicloVigenteEntity): Promise<void> {
    const data = CicloVigenteMapper.toPersistence(ciclo);
    const { id, ...updateData } = data;

    await this.client.cicloVigente.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async findAllActivos(): Promise<CicloVigenteEntity[]> {
    const rows = await this.client.cicloVigente.findMany({
      where: { activo: true, deletedAt: null },
      orderBy: { fechaInicio: 'desc' },
    });
    return rows.map((row) => CicloVigenteMapper.toDomain(row));
  }
}
