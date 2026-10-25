/**
 * TiempoTecnicoModule — tramos del técnico contra el SLA, en su propio horario
 * (odd/tasks/tiempo-tecnico.md, T3).
 *
 * Provee `SincronizarTramoTecnicoService`, que `TicketsModule` usa para armar su
 * `TICKET_REPOSITORY` (`TicketRepositoryConTramos`). No importa `TicketsModule` (sería un
 * ciclo): es `TicketsModule` el que importa este módulo y arma su repositorio con el servicio.
 *
 * Importa `CalendarioLaboralModule` por el horario de cada técnico
 * (`ResolverHorarioLaboralUsuarioService`) y los feriados (`FERIADOS_LABORALES_REPOSITORY`).
 * `TenantContext` y `LOGGER` llegan por `SharedModule` (`@Global()`).
 *
 * T4: exporta `TRAMO_TECNICO_REPOSITORY` para el detalle del ticket (`TicketsModule`) y
 * `CUMPLIMIENTO_TECNICO_REPOSITORY` para el cumplimiento por técnico del dashboard.
 */
import { Module } from '@nestjs/common';
import { CalendarioLaboralModule } from '../calendario-laboral/calendario-laboral.module';
import { CalcularSlaHabilVenceService } from '../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ResolverHorarioLaboralUsuarioService } from '../calendario-laboral/domain/services/resolver-horario-laboral-usuario.service';
import {
  FERIADOS_LABORALES_REPOSITORY,
  IFeriadosLaboralesRepository,
} from '../calendario-laboral/domain/ports/i-feriados-laborales.repository';
import { ILogger, LOGGER } from '../shared/domain/ports/i-logger.port';
import { SincronizarTramoTecnicoService } from './application/sincronizar-tramo-tecnico.service';
import {
  ITramoTecnicoRepository,
  TRAMO_TECNICO_REPOSITORY,
} from './domain/ports/i-tramo-tecnico.repository';
import { PrismaTramoTecnicoRepository } from './infrastructure/prisma-tramo-tecnico.repository';
import { CUMPLIMIENTO_TECNICO_REPOSITORY } from './domain/ports/i-cumplimiento-tecnico.repository';
import { PrismaCumplimientoTecnicoRepository } from './infrastructure/prisma-cumplimiento-tecnico.repository';

@Module({
  imports: [CalendarioLaboralModule],
  providers: [
    { provide: TRAMO_TECNICO_REPOSITORY, useClass: PrismaTramoTecnicoRepository },
    { provide: CUMPLIMIENTO_TECNICO_REPOSITORY, useClass: PrismaCumplimientoTecnicoRepository },
    {
      provide: SincronizarTramoTecnicoService,
      useFactory: (
        tramoRepo: ITramoTecnicoRepository,
        horarioResolver: ResolverHorarioLaboralUsuarioService,
        feriadosRepo: IFeriadosLaboralesRepository,
        logger: ILogger,
      ) =>
        new SincronizarTramoTecnicoService(
          tramoRepo,
          horarioResolver,
          feriadosRepo,
          new CalcularSlaHabilVenceService(),
          logger,
        ),
      inject: [
        TRAMO_TECNICO_REPOSITORY,
        ResolverHorarioLaboralUsuarioService,
        FERIADOS_LABORALES_REPOSITORY,
        LOGGER,
      ],
    },
  ],
  exports: [
    SincronizarTramoTecnicoService,
    TRAMO_TECNICO_REPOSITORY,
    CUMPLIMIENTO_TECNICO_REPOSITORY,
  ],
})
export class TiempoTecnicoModule {}
