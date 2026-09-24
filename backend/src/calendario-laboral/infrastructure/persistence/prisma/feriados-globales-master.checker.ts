import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IFeriadosGlobalesChecker } from '../../../domain/ports/i-feriados-globales.checker';
import { FechaCalendario } from '../../../domain/value-objects/fecha-calendario';

/**
 * FeriadosGlobalesMasterChecker — implementación de IFeriadosGlobalesChecker.
 *
 * Opera SIEMPRE sobre la DB MASTER (`master.feriados`) vía
 * `PrismaService.getMasterClient()`, NUNCA usa TenantContext — mismo patrón
 * que `UsuarioMasterChecker` (`tickets/infrastructure/persistence/prisma/usuario-master.checker.ts`).
 * Solo lectura: no expone create/update/delete (D4).
 *
 * `FechaCalendario.aDateUtc()` produce la medianoche UTC que `@db.Date`
 * espera (D2) — la misma conversión que usan `PrismaFeriadoGlobalMapper` y
 * `PrismaFeriadoClienteRepository` al escribir.
 */
@Injectable()
export class FeriadosGlobalesMasterChecker implements IFeriadosGlobalesChecker {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async esGlobal(fecha: FechaCalendario): Promise<boolean> {
    const fila = await this.masterClient.feriado.findUnique({
      where: { fecha: fecha.aDateUtc() },
      select: { id: true },
    });
    return fila !== null;
  }
}
