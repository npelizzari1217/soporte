import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { IApiHabilitadaRepository } from '../domain/api-habilitada-repository.port';

/** Escribe solo `clientes.api_habilitada`, con un UPDATE dirigido (JD-5). */
@Injectable()
export class PrismaApiHabilitadaRepository implements IApiHabilitadaRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async fijar(clienteId: string, habilitada: boolean): Promise<boolean> {
    const { count } = await this.prismaService.getMasterClient().cliente.updateMany({
      where: { id: clienteId },
      data: { apiHabilitada: habilitada },
    });
    return count > 0;
  }
}
