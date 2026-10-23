import { DomainError, Result } from '../../../shared/domain/result';
import {
  AgenteAsignable,
  ElegibilidadAsignado,
} from '../../../tickets/application/services/elegibilidad-asignado';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TIPO_CODIGO_PREVENTIVO } from '../../../tickets/domain/tipos-ticket.constants';
import { ResponsableNoElegibleError } from '../../domain/errors/preventivo.errors';

/**
 * Quién puede ser responsable de un plan preventivo: el técnico que atiende los tickets que el plan
 * genera, que son siempre del tipo fijo `PREVENTIVO`. La regla es la de `ElegibilidadAsignado`
 * para ese tipo (TECNICO o COLABORADOR activo del cliente con `LECTURA` sobre él): este servicio
 * solo resuelve el tipo y no la duplica. Lo usan el selector del alta y la edición
 * (`listar`) y los casos de uso que guardan el responsable (`exigirElegible`).
 */
export class ResponsablesPlanPreventivo {
  constructor(
    private readonly tipos: Pick<ITipoTicketRepository, 'findIdByCodigo'>,
    private readonly elegibilidad: Pick<
      ElegibilidadAsignado,
      'listarAgentesDeTipo' | 'esAgenteDeTipo'
    >,
  ) {}

  /**
   * @param clienteId Cliente activo.
   * @returns Los agentes elegibles, ordenados por apellido y nombre.
   */
  async listar(clienteId: string): Promise<AgenteAsignable[]> {
    return this.elegibilidad.listarAgentesDeTipo(clienteId, await this.tipoPreventivoId());
  }

  /**
   * @param clienteId Cliente activo.
   * @param responsableId Usuario elegido como responsable.
   * @returns Ok si es elegible; si no, `ResponsableNoElegibleError` (422).
   */
  async exigirElegible(
    clienteId: string,
    responsableId: string,
  ): Promise<Result<void, DomainError>> {
    const tipoId = await this.tipoPreventivoId();
    if (await this.elegibilidad.esAgenteDeTipo(responsableId, clienteId, tipoId)) {
      return Result.ok(undefined);
    }
    return Result.fail(new ResponsableNoElegibleError());
  }

  /**
   * El tipo sale del seed de provisioning: su ausencia es un tenant mal armado, no un error
   * esperado del caller. Mismo `throw` defensivo que `GenerarPreventivosUseCase`.
   */
  private async tipoPreventivoId(): Promise<string> {
    const tipoId = await this.tipos.findIdByCodigo(TIPO_CODIGO_PREVENTIVO);
    if (!tipoId) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo "${TIPO_CODIGO_PREVENTIVO}" en el tenant activo.`,
      );
    }
    return tipoId;
  }
}
