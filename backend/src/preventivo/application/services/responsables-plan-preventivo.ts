import { DomainError, Result } from '../../../shared/domain/result';
import {
  AgenteAsignable,
  ElegibilidadAsignado,
} from '../../../tickets/application/services/elegibilidad-asignado';
import { ResponsableNoElegibleError } from '../../domain/errors/preventivo.errors';

/**
 * Quién puede ser responsable de un plan preventivo: el técnico que atiende los tickets que el plan
 * genera, que son del tipo de ticket del plan (odd/preventivo-por-tipo, S5). La regla es la de
 * `ElegibilidadAsignado` para ese tipo (TECNICO o COLABORADOR activo del cliente con `LECTURA`
 * sobre él): este servicio no la duplica. Lo usan el selector del alta y la edición (`listar`) y
 * los casos de uso que guardan el responsable (`exigirElegible`).
 */
export class ResponsablesPlanPreventivo {
  constructor(
    private readonly elegibilidad: Pick<
      ElegibilidadAsignado,
      'listarAgentesDeTipo' | 'esAgenteDeTipo'
    >,
  ) {}

  /**
   * @param clienteId Cliente activo.
   * @param tipoId Tipo de ticket del plan.
   * @returns Los agentes elegibles, ordenados por apellido y nombre.
   */
  async listar(clienteId: string, tipoId: string): Promise<AgenteAsignable[]> {
    return this.elegibilidad.listarAgentesDeTipo(clienteId, tipoId);
  }

  /**
   * @param clienteId Cliente activo.
   * @param responsableId Usuario elegido como responsable.
   * @param tipoId Tipo de ticket del plan, el que tendría después de guardar.
   * @returns Ok si es elegible; si no, `ResponsableNoElegibleError` (422).
   */
  async exigirElegible(
    clienteId: string,
    responsableId: string,
    tipoId: string,
  ): Promise<Result<void, DomainError>> {
    if (await this.elegibilidad.esAgenteDeTipo(responsableId, clienteId, tipoId)) {
      return Result.ok(undefined);
    }
    return Result.fail(new ResponsableNoElegibleError());
  }
}
