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
 * ser TECNICO o COLABORADOR activo del cliente y tener `LECTURA` sobre el tipo del ticket en
 * `permisos_tipo_ticket` del tenant. Es la ÚNICA fuente de la regla para la asignación manual, el
 * combo de asignables, el técnico de una tarea, el responsable de una regla de asignación y la
 * asignación automática del alta. Master solo aporta identidad, rol y membresía; las celdas por
 * módulo ya no cuentan.
 *
 * Un solo universo: lo que acepta una escritura (`esAgenteDeTipo`, `aceptaComoResponsable`) es lo
 * que ofrece la lista (`listarAgentesDeTipo`). ADMINISTRADOR, ROOT y USUARIO no reciben tickets
 * aunque tengan `LECTURA` sobre el tipo (decisión del dueño del 2026-10-23: antes la asignación
 * manual aceptaba a cualquiera con `LECTURA` y a los administradores siempre).
 *
 * La lectura del tenant va antes que la de master y queda separada (`tieneLecturaSobreTipo`,
 * `esAgente`) para quien necesite tratar distinto un fallo de cada base: la asignación automática
 * degrada uno de master pero propaga uno del tenant.
 */
export class ElegibilidadAsignado {
  constructor(
    private readonly master: Pick<IUsuarioMasterChecker, 'listarAgentes'>,
    private readonly permisos: Pick<
      IPermisoTipoTicketRepository,
      'listarPorUsuario' | 'listarUsuariosConAccion'
    >,
  ) {}

  /**
   * Asignación manual: el destinatario tiene que ser agente del tipo (`esAgenteDeTipo`), salvo que
   * ya sea el responsable del ticket. Esa excepción existe por los tickets asignados antes de la
   * regla a un ADMINISTRADOR o un ROOT: operar sobre ellos sin cambiar de responsable no falla, y
   * el dato guardado no se toca.
   *
   * @param ticket Responsable vigente y tipo ACTUAL del ticket.
   * @param usuarioId Usuario que quedaría como responsable.
   * @param clienteId Cliente activo.
   * @returns `true` si la asignación se puede escribir.
   */
  async aceptaComoResponsable(
    ticket: { readonly asignadoId: string | null; readonly tipoId: string },
    usuarioId: string,
    clienteId: string,
  ): Promise<boolean> {
    if (ticket.asignadoId === usuarioId) return true;
    return this.esAgenteDeTipo(usuarioId, clienteId, ticket.tipoId);
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
