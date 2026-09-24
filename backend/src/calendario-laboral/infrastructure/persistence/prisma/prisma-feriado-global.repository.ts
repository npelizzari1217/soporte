/**
 * PrismaFeriadoGlobalRepository — implementación de IFeriadoGlobalRepository
 * usando el MasterPrismaClient de PrismaService (feriado global, MASTER
 * `feriados`). Respalda el ABM de WU2 — WU1 lo deja listo, sin cablear.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IFeriadoGlobalRepository } from '../../../domain/ports/i-feriado-global.repository';
import { FeriadoEntity } from '../../../domain/entities/feriado.entity';
import { PrismaFeriadoGlobalMapper } from './prisma-feriado-global.mapper';

@Injectable()
export class PrismaFeriadoGlobalRepository implements IFeriadoGlobalRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async listar(): Promise<FeriadoEntity[]> {
    const filas = await this.client.feriado.findMany({ orderBy: { fecha: 'asc' } });
    return filas.map((fila) => PrismaFeriadoGlobalMapper.toDomain(fila));
  }

  async buscarPorId(id: string): Promise<FeriadoEntity | null> {
    const fila = await this.client.feriado.findUnique({ where: { id } });
    return fila ? PrismaFeriadoGlobalMapper.toDomain(fila) : null;
  }

  async crear(feriado: FeriadoEntity): Promise<void> {
    const data = PrismaFeriadoGlobalMapper.toPersistence(feriado);
    await this.client.feriado.create({ data });
  }

  async editar(feriado: FeriadoEntity): Promise<void> {
    const { id, ...data } = PrismaFeriadoGlobalMapper.toPersistence(feriado);
    await this.client.feriado.update({ where: { id }, data });
  }

  /** Baja física — el feriado global no tiene soft delete (D1). */
  async eliminar(id: string): Promise<void> {
    await this.client.feriado.delete({ where: { id } });
  }
}
