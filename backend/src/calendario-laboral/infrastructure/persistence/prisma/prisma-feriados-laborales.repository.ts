/**
 * PrismaFeriadosLaboralesRepository — implementación del puerto
 * IFeriadosLaboralesRepository usando el MasterPrismaClient de
 * PrismaService (los feriados son globales, viven en MASTER).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IFeriadosLaboralesRepository } from '../../../domain/ports/i-feriados-laborales.repository';
import { FeriadosLaborales } from '../../../domain/services/calcular-sla-habil-vence.service';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

@Injectable()
export class PrismaFeriadosLaboralesRepository implements IFeriadosLaboralesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async obtener(): Promise<FeriadosLaborales> {
    const filas = await this.client.feriado.findMany();
    return PrismaCalendarioLaboralMapper.toFeriados(filas);
  }
}
