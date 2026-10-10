import { Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiereAcciones } from '../../auth/infrastructure/guards/decorators';
import { DomainError, Result } from '../../shared/domain/result';
import { ListarEstadosUseCase } from '../../tickets/application/use-cases/listar-estados.use-case';
import { ListarPrioridadesUseCase } from '../../tickets/application/use-cases/listar-prioridades.use-case';
import { toHttpException } from '../../tickets/interface/controllers/tickets.controller';
import { TiposTicketV1Query } from '../application/tipos-ticket-v1.query';
import { ApiV1 } from './api-v1.decorator';
import { CatalogosV1 } from './catalogos-v1.dto';
import { aCatalogosV1 } from './catalogos-v1.presenter';

/**
 * API publica `v1` de catalogos (api-publica, T5c): los ids que el integrador necesita para crear
 * tickets y para leer su estado. Solo lectura, del tenant de la clave (lo bindea `ApiClaveGuard`).
 * Tipos y prioridades: solo los activos, porque un catalogo dado de baja no sirve para el alta. Los
 * tipos salen de `TiposTicketV1Query`, la misma fuente que valida el alta (T5e).
 */
@ApiV1('catalogos')
@ApiTags('Catálogos')
export class CatalogosV1Controller {
  constructor(
    private readonly tiposV1: TiposTicketV1Query,
    private readonly listarPrioridades: ListarPrioridadesUseCase,
    private readonly listarEstados: ListarEstadosUseCase,
  ) {}

  /** Tipos, prioridades y estados del cliente de la clave. Requiere `TICKETS:LECTURA`. */
  @Get()
  @RequiereAcciones('TICKETS:LECTURA')
  @ApiOperation({
    summary: 'Lista los catálogos del cliente',
    description:
      'Tipos, prioridades y estados: los ids que pide el alta de tickets y los que devuelven los ' +
      'tickets. Requiere el permiso de lectura.',
  })
  @ApiOkResponse({ type: CatalogosV1 })
  async listar(): Promise<CatalogosV1> {
    const [tipos, prioridades, estados] = await Promise.all([
      this.tiposV1.listar(),
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
