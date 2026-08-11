import { DomainError, Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { esModuloValido } from '../../../shared/domain/modulos';
import { ModuloTipoTicketInvalidoError } from '../../domain/errors/tickets.errors';

/** DTO de entrada de `ListarTiposTicketUseCase` — filtro opcional por módulo (B2). */
export interface ListarTiposTicketDto {
  /**
   * Si viene, limita el listado a los tipos de ese módulo (separación estricta,
   * B2). Si se omite, devuelve todos los tipos activos del tenant.
   */
  modulo?: string;
}

/**
 * ListarTiposTicketUseCase — lista el catálogo de tipos de ticket ACTIVOS del
 * tenant. Cierra el gap G1 (sdd/beta-frontend/spec §3): desbloquea el form de
 * creación de ticket (select de tipo), la barra de filtros y la vista admin
 * de catálogos. Cualquier usuario autenticado del tenant puede listarlo (sin
 * `@RequirePermissions` en el controller) — es un catálogo de solo lectura.
 *
 * B2: acepta un filtro opcional por `modulo` para que el alta de cada módulo
 * (ej. compras) muestre SOLO sus tipos (separación estricta). Sin filtro, se
 * comporta como antes (todos los tipos activos).
 *
 * Ref spec: sdd/beta-frontend/spec §3 G1. Ref design: ADR-5.
 */
export class ListarTiposTicketUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<
      ITipoTicketRepository,
      'findAllActive' | 'findAllActiveByModulo'
    >,
  ) {}

  async execute(dto: ListarTiposTicketDto = {}): Promise<Result<TipoTicketEntity[], DomainError>> {
    if (dto.modulo !== undefined) {
      if (!esModuloValido(dto.modulo)) {
        return Result.fail(new ModuloTipoTicketInvalidoError(dto.modulo));
      }
      const tipos = await this.tipoTicketRepo.findAllActiveByModulo(dto.modulo);
      return Result.ok(tipos);
    }

    const tipos = await this.tipoTicketRepo.findAllActive();
    return Result.ok(tipos);
  }
}
