/**
 * ReglasAsignacionModule — API de configuración de la asignación automática por tipo.
 *
 * Importa `AuthModule` (guards) y `TicketsModule`, que exporta el puerto de reglas, el de tipos
 * y el checker de master: la pantalla depende de `tickets`, nunca al revés (ADR-8).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import {
  ITipoTicketRepository,
  TIPO_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-tipo-ticket.repository';
import {
  IReglaAsignacionRepository,
  REGLA_ASIGNACION_REPOSITORY,
} from '../tickets/domain/ports/i-regla-asignacion.repository';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../tickets/domain/ports/i-usuario-master.checker';
import { ListarReglasAsignacionUseCase } from './application/use-cases/listar-reglas-asignacion.use-case';
import { ConfigurarReglaAsignacionUseCase } from './application/use-cases/configurar-regla-asignacion.use-case';
import { ReglasAsignacionController } from './interface/controllers/reglas-asignacion.controller';

@Module({
  imports: [AuthModule, TicketsModule],
  controllers: [ReglasAsignacionController],
  providers: [
    {
      provide: ListarReglasAsignacionUseCase,
      useFactory: (
        tipoRepo: ITipoTicketRepository,
        reglaRepo: IReglaAsignacionRepository,
        checker: IUsuarioMasterChecker,
      ) => new ListarReglasAsignacionUseCase(tipoRepo, reglaRepo, checker),
      inject: [TIPO_TICKET_REPOSITORY, REGLA_ASIGNACION_REPOSITORY, USUARIO_MASTER_CHECKER],
    },
    {
      provide: ConfigurarReglaAsignacionUseCase,
      useFactory: (
        tipoRepo: ITipoTicketRepository,
        reglaRepo: IReglaAsignacionRepository,
        checker: IUsuarioMasterChecker,
      ) => new ConfigurarReglaAsignacionUseCase(tipoRepo, reglaRepo, checker),
      inject: [TIPO_TICKET_REPOSITORY, REGLA_ASIGNACION_REPOSITORY, USUARIO_MASTER_CHECKER],
    },
  ],
})
export class ReglasAsignacionModule {}
