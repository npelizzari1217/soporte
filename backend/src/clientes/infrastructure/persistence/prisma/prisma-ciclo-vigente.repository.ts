import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ICicloVigenteRepository } from '../../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../../domain/entities/ciclo-vigente.entity';
import { CicloVigenteMapper } from './ciclo-vigente.mapper';

/**
 * PrismaCicloVigenteRepository — implementación del puerto ICicloVigenteRepository
 * usando el MasterPrismaClient de PrismaService.
 *
 * Reglas:
 * - Usa MasterPrismaClient (ciclos vigentes son globales, viven en MASTER).
 * - findAllNonDeleted() excluye soft-deleted para la validación de solapamiento.
 * - save() es un upsert por id.
 *
 * Tarea: 1.C.2
 */
@Injectable()
export class PrismaCicloVigenteRepository implements ICicloVigenteRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findById(id: string): Promise<CicloVigenteEntity | null> {
    const row = await this.client.cicloVigente.findUnique({
      where: { id },
    });
    return row ? CicloVigenteMapper.toDomain(row) : null;
  }

  async findAllNonDeleted(): Promise<CicloVigenteEntity[]> {
    const rows = await this.client.cicloVigente.findMany({
      where: { deletedAt: null },
    });
    return rows.map(CicloVigenteMapper.toDomain);
  }

  async findAll(): Promise<CicloVigenteEntity[]> {
    const rows = await this.client.cicloVigente.findMany();
    return rows.map(CicloVigenteMapper.toDomain);
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

  async delete(id: string): Promise<void> {
    await this.client.cicloVigente.delete({ where: { id } });
  }
}
