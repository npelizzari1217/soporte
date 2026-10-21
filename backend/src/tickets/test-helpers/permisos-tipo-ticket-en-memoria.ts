import { AccionTipoTicket, TipoTicketConModulo } from '../domain/permisos-tipo-ticket';
import {
  IPermisoTipoTicketRepository,
  PermisoTipoTicketFila,
} from '../domain/ports/i-permiso-tipo-ticket.repository';

/**
 * Doble en memoria de `IPermisoTipoTicketRepository` para tests unitarios: guarda las acciones
 * por usuario y tipo, y los tipos en una lista fija. Permite afirmar sobre el estado final de las
 * filas en vez de sobre las llamadas al repositorio.
 */
export class PermisosTipoTicketEnMemoria implements IPermisoTipoTicketRepository {
  private readonly porUsuario = new Map<string, Map<string, Set<AccionTipoTicket>>>();

  /**
   * @param tipos Tipos del tenant que devuelve `listarTipos`.
   * @param iniciales Filas ya existentes antes del test.
   */
  constructor(
    private readonly tipos: readonly TipoTicketConModulo[],
    iniciales: readonly PermisoTipoTicketFila[] = [],
  ) {
    for (const fila of iniciales) this.agregar(fila);
  }

  /**
   * Filas de un usuario como `tipoId:ACCION`, ordenadas.
   *
   * @param usuarioId Id del usuario en master.
   * @returns Los pares (tipo, acción) del usuario.
   */
  filasDe(usuarioId: string): string[] {
    const porTipo = this.porUsuario.get(usuarioId) ?? new Map<string, Set<AccionTipoTicket>>();
    return [...porTipo]
      .flatMap(([tipoId, acciones]) => [...acciones].map((a) => `${tipoId}:${a}`))
      .sort();
  }

  async listarPorUsuario(usuarioId: string): Promise<Map<string, Set<AccionTipoTicket>>> {
    const porTipo = this.porUsuario.get(usuarioId) ?? new Map<string, Set<AccionTipoTicket>>();
    return new Map([...porTipo].map(([tipoId, acciones]) => [tipoId, new Set(acciones)]));
  }

  async listarUsuariosConAccion(
    tipoIds: readonly string[],
    accion: AccionTipoTicket,
  ): Promise<Map<string, string[]>> {
    const porTipo = new Map<string, string[]>();
    for (const [usuarioId, acciones] of this.porUsuario) {
      for (const [tipoId, concedidas] of acciones) {
        if (!tipoIds.includes(tipoId) || !concedidas.has(accion)) continue;
        porTipo.set(tipoId, [...(porTipo.get(tipoId) ?? []), usuarioId]);
      }
    }
    return porTipo;
  }

  async reemplazarDeUsuario(
    usuarioId: string,
    filas: readonly Omit<PermisoTipoTicketFila, 'usuarioId'>[],
  ): Promise<void> {
    this.porUsuario.delete(usuarioId);
    for (const fila of filas) this.agregar({ usuarioId, ...fila });
  }

  async agregarSiFaltan(filas: readonly PermisoTipoTicketFila[]): Promise<number> {
    return filas.filter((fila) => this.agregar(fila)).length;
  }

  async listarTipos(): Promise<TipoTicketConModulo[]> {
    return this.tipos.map((tipo) => ({ ...tipo }));
  }

  /** Agrega la terna; devuelve `false` si ya existía. */
  private agregar({ usuarioId, tipoId, accion }: PermisoTipoTicketFila): boolean {
    const porTipo = this.porUsuario.get(usuarioId) ?? new Map<string, Set<AccionTipoTicket>>();
    const acciones = porTipo.get(tipoId) ?? new Set<AccionTipoTicket>();
    const nueva = !acciones.has(accion);
    acciones.add(accion);
    porTipo.set(tipoId, acciones);
    this.porUsuario.set(usuarioId, porTipo);
    return nueva;
  }
}
