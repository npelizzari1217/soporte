import { IPermisoTipoTicketRepository } from '../../domain/ports/i-permiso-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';

/** Agente (TECNICO o COLABORADOR) que puede atender tickets de un tipo. */
export interface AgenteAsignable {
  id: string;
  nombre: string;
  apellido: string;
}

/**
 * Elegibilidad de quien recibe un ticket o una tarea (odd/permisos-por-tipo-ticket, S1, S2, D5 g):
 * tener `LECTURA` sobre el tipo del ticket en `permisos_tipo_ticket` del tenant. Es la ÚNICA
 * fuente de la regla para la asignación manual, el combo de asignables, el técnico de una tarea,
 * el responsable de una regla de asignación y la asignación automática del alta. Master solo
 * aporta identidad, rol y membresía; las celdas por módulo ya no cuentan.
 *
 * Dos universos, con la misma condición de tipo:
 * - asignación manual (`esAsignableATipo`): ROOT y ADMINISTRADOR siempre; el resto, con `LECTURA`
 *   sobre el tipo, sea cual sea su rol (ortogonal a que esté activo en el tenant, que el caso de
 *   uso valida aparte);
 * - agentes (`listarAgentesDeTipo`, `esAgenteDeTipo`): TECNICO o COLABORADOR con `LECTURA` sobre
 *   el tipo. ADMINISTRADOR y ROOT no son técnicos de una tarea ni responsables de una regla.
 *
 * La lectura del tenant va antes que la de master y queda separada (`tieneLecturaSobreTipo`,
 * `esAgente`) para quien necesite tratar distinto un fallo de cada base: la asignación automática
 * degrada uno de master pero propaga uno del tenant.
 */
export class ElegibilidadAsignado {
  constructor(
    private readonly master: Pick<IUsuarioMasterChecker, 'esAdminTotalEnTenant' | 'listarAgentes'>,
    private readonly permisos: Pick<
      IPermisoTipoTicketRepository,
      'listarPorUsuario' | 'listarUsuariosConAccion'
    >,
  ) {}

  /**
   * Asignación manual: ROOT o ADMINISTRADOR del cliente, o `LECTURA` sobre el tipo.
   *
   * @param usuarioId Usuario que recibiría la asignación.
   * @param clienteId Cliente activo.
   * @param tipoId Tipo ACTUAL del ticket.
   * @returns `true` si puede ser responsable de un ticket del tipo.
   */
  async esAsignableATipo(usuarioId: string, clienteId: string, tipoId: string): Promise<boolean> {
    if (await this.master.esAdminTotalEnTenant(usuarioId, clienteId)) return true;
    return this.tieneLecturaSobreTipo(usuarioId, tipoId);
  }

  /**
   * Parte del tenant de la regla: el usuario tiene `LECTURA` sobre el tipo.
   *
   * @param usuarioId Usuario a evaluar.
   * @param tipoId Tipo del ticket.
   * @returns `true` si la fila (usuario, tipo, `LECTURA`) existe.
   */
  async tieneLecturaSobreTipo(usuarioId: string, tipoId: string): Promise<boolean> {
    const porTipo = await this.permisos.listarPorUsuario(usuarioId);
    return porTipo.get(tipoId)?.has('LECTURA') ?? false;
  }

  /**
   * Parte de master de la regla: el usuario es TECNICO o COLABORADOR activo del cliente.
   *
   * @param usuarioId Usuario a evaluar.
   * @param clienteId Cliente activo.
   * @returns `true` si es un agente del cliente.
   */
  async esAgente(usuarioId: string, clienteId: string): Promise<boolean> {
    const agentes = await this.master.listarAgentes(clienteId, [usuarioId]);
    return agentes.some((agente) => agente.id === usuarioId);
  }

  /**
   * Agente con `LECTURA` sobre el tipo. Sin la fila del tipo no consulta master.
   *
   * @param usuarioId Usuario a evaluar.
   * @param clienteId Cliente activo.
   * @param tipoId Tipo del ticket.
   * @returns `true` si figura en `listarAgentesDeTipo` para ese tipo.
   */
  async esAgenteDeTipo(usuarioId: string, clienteId: string, tipoId: string): Promise<boolean> {
    if (!(await this.tieneLecturaSobreTipo(usuarioId, tipoId))) return false;
    return this.esAgente(usuarioId, clienteId);
  }

  /**
   * Agentes que pueden atender tickets del tipo.
   *
   * @param clienteId Cliente activo.
   * @param tipoId Tipo del ticket.
   * @returns Agentes ordenados por apellido y nombre.
   */
  async listarAgentesDeTipo(clienteId: string, tipoId: string): Promise<AgenteAsignable[]> {
    return (await this.listarAgentesPorTipo(clienteId, [tipoId])).get(tipoId) ?? [];
  }

  /**
   * Agentes de cada tipo, con una consulta al tenant y otra a master para todo el lote.
   *
   * @param clienteId Cliente activo.
   * @param tipoIds Tipos a resolver.
   * @returns Mapa `tipoId` → agentes ordenados por apellido y nombre; vacío para un tipo sin nadie.
   */
  async listarAgentesPorTipo(
    clienteId: string,
    tipoIds: readonly string[],
  ): Promise<Map<string, AgenteAsignable[]>> {
    const conLectura = await this.permisos.listarUsuariosConAccion(tipoIds, 'LECTURA');
    const candidatos = [...new Set([...conLectura.values()].flat())];
    const agentes =
      candidatos.length === 0 ? [] : await this.master.listarAgentes(clienteId, candidatos);
    return new Map(
      tipoIds.map((tipoId) => {
        const delTipo = new Set(conLectura.get(tipoId) ?? []);
        return [tipoId, agentes.filter((agente) => delTipo.has(agente.id))];
      }),
    );
  }
}
