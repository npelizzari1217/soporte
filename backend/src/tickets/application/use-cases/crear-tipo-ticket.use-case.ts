import { DomainError, Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TipoTicketCodigoDuplicadoError,
  PrefijoTipoTicketColisionError,
  TipoTicketDesconocidoError,
} from '../../domain/errors/tickets.errors';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';

/** DTO de entrada de `CrearTipoTicketUseCase` (T2, PR11). */
export interface CrearTipoTicketDto {
  codigo: string;
  nombre: string;
}

/**
 * CrearTipoTicketUseCase — alta de un tipo de ticket EDITABLE por el
 * ADMINISTRADOR del tenant (T2, PR11).
 *
 * Flujo:
 * 1. Valida que `codigo` no esté en uso (activo O soft-deleted — el UNIQUE
 *    de schema no tiene índice parcial por `deleted_at`) → 422.
 * 2. Deriva el prefijo de numeración (`NumeradorTicket.derivarPrefijo`,
 *    ADR-4). Si el `codigo` es degenerado (sin caracteres alfanuméricos)
 *    → 422, mismo error que usa el numerador en tiempo de creación de
 *    tickets (fail-fast, no dejar un tipo inutilizable en el catálogo).
 * 3. Valida que ese prefijo NO colisione con el de ningún tipo ACTIVO
 *    existente del tenant → 422. Cierra en el punto de alta el riesgo
 *    aceptado en design ADR-4 (colisión de prefijo → violaría el UNIQUE de
 *    `tickets.numero` recién en tiempo de uso real, ya visto como bug real
 *    en e2e de PR8/PR9/PR10).
 * 4. Crea la entidad (`activo=true`) y persiste.
 *
 * Ref spec: sdd/tickets-core/spec T2, T5. Ref design: ADR-4. Tarea: T11.1.
 */
export class CrearTipoTicketUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<
      ITipoTicketRepository,
      'findByCodigo' | 'findAllActive' | 'save'
    >,
  ) {}

  async execute(dto: CrearTipoTicketDto): Promise<Result<TipoTicketEntity, DomainError>> {
    const existente = await this.tipoTicketRepo.findByCodigo(dto.codigo);
    if (existente) {
      return Result.fail(new TipoTicketCodigoDuplicadoError(dto.codigo));
    }

    const prefijo = NumeradorTicket.derivarPrefijo(dto.codigo);
    if (!prefijo) {
      return Result.fail(new TipoTicketDesconocidoError(dto.codigo));
    }

    const activos = await this.tipoTicketRepo.findAllActive();
    const colisionante = activos.find((t) => NumeradorTicket.derivarPrefijo(t.codigo) === prefijo);
    if (colisionante) {
      return Result.fail(
        new PrefijoTipoTicketColisionError(dto.codigo, colisionante.codigo, prefijo),
      );
    }

    const tipo = TipoTicketEntity.create({ codigo: dto.codigo, nombre: dto.nombre, activo: true });
    await this.tipoTicketRepo.save(tipo);

    return Result.ok(tipo);
  }
}
