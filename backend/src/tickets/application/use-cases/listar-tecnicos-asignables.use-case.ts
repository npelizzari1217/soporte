import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { resolverModuloDeTipoCodigo } from '../../../shared/domain/modulos';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';

/** DTO de entrada de `ListarTecnicosAsignablesUseCase`. */
export interface ListarTecnicosAsignablesDto {
  ticketId: string;
  clienteId: string;
}

/** Técnico elegible para el combo de asignación (proyección mínima de presentación). */
export interface TecnicoAsignable {
  id: string;
  nombre: string;
  apellido: string;
}

/**
 * ListarTecnicosAsignablesUseCase — arma el universo de TÉCNICOS elegibles
 * para atender un ticket, para el combo del control unificado "Asignar y poner
 * en proceso".
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe o está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Resuelve el MÓDULO del tipo del ticket: `tipoTicketRepo.findById(ticket.tipoId)`
 *    devuelve el `codigo` del tipo y `resolverModuloDeTipoCodigo(codigo)` lo mapea
 *    a su módulo (o `null` si es un tipo CUSTOM sin módulo). Se prefiere resolver
 *    por el `codigo` del tipo (una sola consulta, usando el mapa inverso
 *    `TIPO_CODIGO_A_MODULO`) antes que recorrer `MODULO_A_TIPO_CODIGO` haciendo
 *    N `findIdByCodigo` — mismo resultado, menos I/O, y aprovecha el mapa inverso.
 * 3. Delega en `usuarioMasterChecker.listarTecnicosAsignables(clienteId, modulo)`:
 *    con `modulo === null` (tipo custom) la lista es `[]` (no hay técnicos
 *    elegibles por catálogo).
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

    const modulo = resolverModuloDeTipoCodigo(tipoTicket.codigo);
    const tecnicos = await this.usuarioMasterChecker.listarTecnicosAsignables(
      dto.clienteId,
      modulo,
    );
    return Result.ok(tecnicos);
  }
}
