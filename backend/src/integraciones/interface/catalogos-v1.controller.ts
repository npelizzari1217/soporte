import { Get } from '@nestjs/common';
import { RequiereAcciones } from '../../auth/infrastructure/guards/decorators';
import { DomainError, Result } from '../../shared/domain/result';
import { ListarEstadosUseCase } from '../../tickets/application/use-cases/listar-estados.use-case';
import { ListarPrioridadesUseCase } from '../../tickets/application/use-cases/listar-prioridades.use-case';
import { ListarTiposTicketUseCase } from '../../tickets/application/use-cases/listar-tipos-ticket.use-case';
import { toHttpException } from '../../tickets/interface/controllers/tickets.controller';
import { ApiV1 } from './api-v1.decorator';
import { CatalogosV1 } from './catalogos-v1.dto';
import { aCatalogosV1 } from './catalogos-v1.presenter';

/**
 * La API solo opera tickets del modulo TICKETS (CA1; el actor de la clave tiene `modulos:
 * ['TICKETS']`). Un tipo de otro modulo crearia un ticket que la misma clave no puede listar.
 */
const MODULO_API = 'TICKETS';

/**
 * API publica `v1` de catalogos (api-publica, T5c): los ids que el integrador necesita para crear
 * tickets y para leer su estado. Solo lectura, del tenant de la clave (lo bindea `ApiClaveGuard`).
 * Tipos y prioridades: solo los activos, porque un catalogo dado de baja no sirve para el alta.
 */
@ApiV1('catalogos')
export class CatalogosV1Controller {
  constructor(
    private readonly listarTipos: ListarTiposTicketUseCase,
    private readonly listarPrioridades: ListarPrioridadesUseCase,
    private readonly listarEstados: ListarEstadosUseCase,
  ) {}

  /** Tipos, prioridades y estados del cliente de la clave. Requiere `TICKETS:LECTURA`. */
  @Get()
  @RequiereAcciones('TICKETS:LECTURA')
  async listar(): Promise<CatalogosV1> {
    const [tipos, prioridades, estados] = await Promise.all([
      this.listarTipos.execute({ modulo: MODULO_API }),
      this.listarPrioridades.execute(),
      this.listarEstados.execute(),
    ]);
    return aCatalogosV1(valor(tipos), valor(prioridades), valor(estados));
  }
}

function valor<T>(result: Result<T, DomainError>): T {
  if (result.isFail()) {
    throw toHttpException(result.getError());
  }
  return result.getValue();
}
