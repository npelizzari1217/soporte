import { DomainError, Result } from '../../../shared/domain/result';
import { ListaDeAgentesNoPermitidaError } from '../../domain/errors/tickets.errors';
import { IPermisoTipoTicketRepository } from '../../domain/ports/i-permiso-tipo-ticket.repository';
import { AgenteAsignable, ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import { AlcanceActorTicket, puedeVerListaDeUsuarios } from '../services/visibilidad-ticket';

/**
 * DTO de entrada de `ListarAgentesFiltroTicketsUseCase`. El alcance del actor lo carga la capa de
 * interface (`CargadorAlcanceTicket`).
 */
export interface ListarAgentesFiltroTicketsDto extends AlcanceActorTicket {
  clienteId: string;
  /** Tipo filtrado en el listado (`?tipo=`); ausente, todos los tipos que el actor ve. */
  tipoId?: string;
}

/**
 * ListarAgentesFiltroTicketsUseCase — opciones del filtro "Asignado" del listado de tickets: los
 * agentes (TECNICO o COLABORADOR) con `LECTURA` sobre alguno de los tipos que el actor ve, o solo
 * sobre el tipo filtrado. Un ticket solo se asigna a quien atiende su tipo
 * (`ElegibilidadAsignado`), así que ofrecer a otro sería un filtro que nunca devuelve filas.
 *
 * - Acceso: la misma regla que abre `GET /usuarios` (`puedeVerListaDeUsuarios`), que es la que
 *   decide en el front si el filtro se muestra. Sin ella → `ListaDeAgentesNoPermitidaError` (403).
 * - Tipos: los que tienen `LECTURA` en el alcance del actor; sin restricción (ROOT y
 *   ADMINISTRADOR), todos los del tenant. Con `tipoId`, la intersección: un tipo que el actor no
 *   ve da la lista vacía, nunca amplía el alcance (mismo criterio que `alcanceDeListado`).
 *
 * Solo lectura. Sin throw para fallos esperados.
 */
export class ListarAgentesFiltroTicketsUseCase {
  constructor(
    private readonly tipos: Pick<IPermisoTipoTicketRepository, 'listarTipos'>,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'listarAgentesPorTipo'>,
  ) {}

  /**
   * @param dto Alcance del actor, cliente activo y tipo filtrado opcional.
   * @returns Agentes sin repetir, ordenados por apellido y nombre; o el 403 de acceso.
   */
  async execute(
    dto: ListarAgentesFiltroTicketsDto,
  ): Promise<Result<AgenteAsignable[], DomainError>> {
    if (!(await puedeVerListaDeUsuarios(dto, this.tipos))) {
      return Result.fail(new ListaDeAgentesNoPermitidaError());
    }

    const visibles = await this.tiposVisibles(dto);
    const tipoIds =
      dto.tipoId === undefined ? visibles : visibles.filter((tipoId) => tipoId === dto.tipoId);
    if (tipoIds.length === 0) return Result.ok([]);

    const porTipo = await this.elegibilidad.listarAgentesPorTipo(dto.clienteId, tipoIds);
    // Un agente de varios tipos llega una vez por tipo: se queda una sola, y el orden se rehace
    // porque cada lista viene ordenada por separado.
    const unicos = new Map<string, AgenteAsignable>();
    for (const agentes of porTipo.values()) {
      for (const agente of agentes) unicos.set(agente.id, agente);
    }
    return Result.ok(
      [...unicos.values()].sort(
        (a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre),
      ),
    );
  }

  /** Tipos con `LECTURA` del actor; sin restricción, todos los del tenant. */
  private async tiposVisibles(alcance: AlcanceActorTicket): Promise<string[]> {
    if (alcance.permisosPorTipo === null) {
      return (await this.tipos.listarTipos()).map((tipo) => tipo.id);
    }
    return [...alcance.permisosPorTipo]
      .filter(([, acciones]) => acciones.has('LECTURA'))
      .map(([tipoId]) => tipoId);
  }
}
