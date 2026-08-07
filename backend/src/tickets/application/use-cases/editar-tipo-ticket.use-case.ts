import { DomainError, Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TipoTicketNoEncontradoError,
  TipoTicketCodigoDuplicadoError,
  PrefijoTipoTicketColisionError,
  TipoTicketDesconocidoError,
} from '../../domain/errors/tickets.errors';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';

/** DTO de entrada de `EditarTipoTicketUseCase` (T2, PR11) — PATCH semántico. */
export interface EditarTipoTicketDto {
  id: string;
  codigo?: string;
  nombre?: string;
}

/**
 * EditarTipoTicketUseCase — edita `codigo`/`nombre` de un tipo de ticket
 * existente (T2, PR11).
 *
 * Si `codigo` cambia (distinto al actual), revalida el MISMO criterio que
 * `CrearTipoTicketUseCase`: unicidad y ausencia de colisión de prefijo
 * (ADR-4) contra los demás tipos ACTIVOS del tenant (excluyendo la propia
 * entidad). Re-enviar el codigo actual sin cambios NO dispara revalidación.
 *
 * Ref spec: sdd/tickets-core/spec T2, T5. Ref design: ADR-4. Tarea: T11.1.
 */
export class EditarTipoTicketUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<
      ITipoTicketRepository,
      'findById' | 'findByCodigo' | 'findAllActive' | 'save'
    >,
  ) {}

  async execute(dto: EditarTipoTicketDto): Promise<Result<TipoTicketEntity, DomainError>> {
    const tipo = await this.tipoTicketRepo.findById(dto.id);
    if (!tipo) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.id));
    }

    if (dto.codigo !== undefined && dto.codigo !== tipo.codigo) {
      const existente = await this.tipoTicketRepo.findByCodigo(dto.codigo);
      if (existente && existente.id !== tipo.id) {
        return Result.fail(new TipoTicketCodigoDuplicadoError(dto.codigo));
      }

      const prefijo = NumeradorTicket.derivarPrefijo(dto.codigo);
      if (!prefijo) {
        return Result.fail(new TipoTicketDesconocidoError(dto.codigo));
      }

      const activos = await this.tipoTicketRepo.findAllActive();
      const colisionante = activos.find(
        (t) => t.id !== tipo.id && NumeradorTicket.derivarPrefijo(t.codigo) === prefijo,
      );
      if (colisionante) {
        return Result.fail(
          new PrefijoTipoTicketColisionError(dto.codigo, colisionante.codigo, prefijo),
        );
      }
    }

    tipo.actualizar({ codigo: dto.codigo, nombre: dto.nombre });
    await this.tipoTicketRepo.save(tipo);

    return Result.ok(tipo);
  }
}
