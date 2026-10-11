import { DomainError, Result } from '../../shared/domain/result';
import { ListarTiposTicketUseCase } from '../../tickets/application/use-cases/listar-tipos-ticket.use-case';
import { TipoTicketEntity } from '../../tickets/domain/entities/tipo-ticket.entity';
import { TipoTicketV1NoDisponibleError } from '../domain/integraciones.errors';

/**
 * La API solo opera tickets del modulo TICKETS (CA1; el actor de la clave tiene `modulos:
 * ['TICKETS']`). Un tipo de otro modulo crearia un ticket que la misma clave no puede listar.
 */
export const MODULO_API_V1 = 'TICKETS';

/**
 * TiposTicketV1Query — unica fuente de los tipos que publica la API `v1` (api-publica, T5c y T5e):
 * los tipos ACTIVOS del modulo TICKETS. `GET /v1/catalogos` los lista y `POST /v1/tickets` solo
 * acepta un `tipoId` de ese mismo conjunto, asi que un id publicado siempre sirve para el alta y
 * uno no publicado nunca.
 */
export class TiposTicketV1Query {
  constructor(private readonly listarTipos: Pick<ListarTiposTicketUseCase, 'execute'>) {}

  /** Los tipos publicados por la API: activos y del modulo TICKETS. */
  listar(): Promise<Result<TipoTicketEntity[], DomainError>> {
    return this.listarTipos.execute({ modulo: MODULO_API_V1 });
  }

  /**
   * Ok si `tipoId` es un tipo publicado. Si no, `TipoTicketV1NoDisponibleError`, igual para un id
   * inexistente, dado de baja o de otro modulo.
   */
  async validarParaAlta(tipoId: string): Promise<Result<void, DomainError>> {
    const tipos = await this.listar();
    if (tipos.isFail()) {
      return Result.fail(tipos.getError());
    }
    return tipos.getValue().some((tipo) => tipo.id === tipoId)
      ? Result.ok(undefined)
      : Result.fail(new TipoTicketV1NoDisponibleError());
  }
}
