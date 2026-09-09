/**
 * PrismaCalendarioLaboralSemanalRepository — implementación del puerto
 * ICalendarioLaboralSemanalRepository usando el MasterPrismaClient de
 * PrismaService (el calendario laboral es global, vive en MASTER).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ICalendarioLaboralSemanalRepository } from '../../../domain/ports/i-calendario-laboral-semanal.repository';
import { CalendarioLaboralSemanal } from '../../../domain/services/calcular-sla-habil-vence.service';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

@Injectable()
export class PrismaCalendarioLaboralSemanalRepository implements ICalendarioLaboralSemanalRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async obtener(): Promise<CalendarioLaboralSemanal> {
    const filas = await this.client.calendarioLaboralDia.findMany();
    return PrismaCalendarioLaboralMapper.toCalendarioSemanal(filas);
  }
}
