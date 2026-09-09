/**
 * CalendarioLaboralModule — provee los puertos de lectura del calendario
 * laboral y los feriados (WU-2, sdd/sla-habil), con sus adaptadores Prisma
 * de MASTER.
 *
 * Deliberadamente SIN cablear todavía al módulo SLA: eso es WU-3. Este
 * módulo no se importa desde ningún otro todavía.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver `backend/eslint.config.js`).
 *
 * PrismaService llega vía `SharedModule` (`@Global()`) — no se importa acá,
 * mismo patrón que `TiposComponenteModule`.
 */
import { Module } from '@nestjs/common';
import { CALENDARIO_LABORAL_SEMANAL_REPOSITORY } from './domain/ports/i-calendario-laboral-semanal.repository';
import { FERIADOS_LABORALES_REPOSITORY } from './domain/ports/i-feriados-laborales.repository';
import { PrismaCalendarioLaboralSemanalRepository } from './infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository';
import { PrismaFeriadosLaboralesRepository } from './infrastructure/persistence/prisma/prisma-feriados-laborales.repository';

@Module({
  providers: [
    {
      provide: CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
      useClass: PrismaCalendarioLaboralSemanalRepository,
    },
    { provide: FERIADOS_LABORALES_REPOSITORY, useClass: PrismaFeriadosLaboralesRepository },
  ],
  exports: [CALENDARIO_LABORAL_SEMANAL_REPOSITORY, FERIADOS_LABORALES_REPOSITORY],
})
export class CalendarioLaboralModule {}
