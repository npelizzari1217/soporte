/**
 * TramosTecnicoTicketController — tiempo de cada técnico en un ticket contra la meta del SLA
 * (odd/tasks/tiempo-tecnico.md, T4, S8).
 *
 * Ruta:
 *   GET /tickets/:id/tramos-tecnico → ListarTramosTicketUseCase → tramos del más viejo al más nuevo
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` + `AccionesGuard`, como `TicketsController`, y sin
 * `@RequiereAcciones`: los ve exactamente quien ve el ticket (`LECTURA` sobre su tipo y la regla de
 * fila), y eso lo decide el caso de uso con el alcance que carga `CargadorAlcanceTicket`. No hay
 * campos condicionados por permiso.
 *
 * Vive en `TicketsModule` porque necesita su repositorio y su cargador de alcance, y
 * `TiempoTecnicoModule` no puede importar `TicketsModule` (sería un ciclo).
 */
import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { ListarTramosTicketUseCase } from '../../../tiempo-tecnico/application/listar-tramos-ticket.use-case';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../../domain/ports/i-usuario-master.checker';
import { CargadorAlcanceTicket } from '../alcance-ticket';
import { TramoTecnicoResponseDto, toTramoTecnicoResponseDto } from '../dtos/tramo-tecnico.dto';
import { toHttpException } from './tickets.controller';

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('tickets')
export class TramosTecnicoTicketController {
  constructor(
    private readonly listarTramos: ListarTramosTicketUseCase,
    @Inject(USUARIO_MASTER_CHECKER) private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /**
   * GET /tickets/:id/tramos-tecnico — tramos del ticket con el nombre de cada técnico, resueltos
   * en un solo lote contra master.
   * @throws 404 ticket inexistente, borrado, de otro cliente o no visible para el actor
   */
  @Get(':id/tramos-tecnico')
  async listar(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
  ): Promise<TramoTecnicoResponseDto[]> {
    const result = await this.listarTramos.execute({
      ticketId,
      ...(await this.alcances.cargar(user)),
    });
    if (result.isFail()) throw toHttpException(result.getError());

    const tramos = result.getValue();
    if (tramos.length === 0) return [];
    const nombres = await this.usuarioMasterChecker.resolverNombres([
      ...new Set(tramos.map((tramo) => tramo.tecnicoId)),
    ]);
    return tramos.map((tramo) => toTramoTecnicoResponseDto(tramo, nombres));
  }
}
