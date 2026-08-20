import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';

/** DTO de entrada de `ListarTecnicosAsignablesUseCase`. */
export interface ListarTecnicosAsignablesDto {
  ticketId: string;
  clienteId: string;
}

/**
 * Agente (rol TECNICO o COLABORADOR) elegible para el combo de asignación
 * (proyección mínima de presentación). El nombre `TecnicoAsignable` se
 * mantiene sin renombrar aunque el universo ya incluye COLABORADOR — ver
 * JSDoc de `listarTecnicosAsignables` en `IUsuarioMasterChecker`.
 */
export interface TecnicoAsignable {
  id: string;
  nombre: string;
  apellido: string;
}

/**
 * ListarTecnicosAsignablesUseCase — arma el universo de AGENTES (TÉCNICOS y
 * COLABORADORES, ambos cumplen funciones de técnico) elegibles para atender
 * un ticket, para el combo del control unificado "Asignar y poner en
 * proceso".
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe o está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Carga el tipo del ticket (`tipoTicketRepo.findById(ticket.tipoId)`) y lee su
 *    `modulo` directo de la columna (B2, fuente de verdad). Antes se derivaba por
 *    convención de `codigo`, lo que dejaba a los tipos CUSTOM sin módulo (`null`)
 *    y por ende sin técnicos asignables; ahora todo tipo tiene un módulo real.
 * 3. Delega en `usuarioMasterChecker.listarTecnicosAsignables(clienteId, modulo)`.
 *
 * Solo LECTURA: no muta ni abre transacción. Sin throw para fallos esperados.
 */
export class ListarTecnicosAsignablesUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>,
  ) {}

  async execute(
    dto: ListarTecnicosAsignablesDto,
  ): Promise<Result<TecnicoAsignable[], DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // Catálogo de tipos: la ausencia del tipo de un ticket vivo es una
    // inconsistencia de infraestructura, no un error del caller (throw
    // defensivo, mismo patrón que TransicionarEstadoUseCase).
    const tipoTicket = await this.tipoTicketRepo.findById(ticket.tipoId);
    if (!tipoTicket) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo con id "${ticket.tipoId}" en el tenant activo.`,
      );
    }

    const tecnicos = await this.usuarioMasterChecker.listarTecnicosAsignables(
      dto.clienteId,
      tipoTicket.modulo,
    );
    return Result.ok(tecnicos);
  }
}
