import { ACCIONES_TIPO_TICKET, AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { IPermisoTipoTicketRepository } from '../../domain/ports/i-permiso-tipo-ticket.repository';
import { AlcanceActorTicket } from '../services/visibilidad-ticket';

/**
 * Permisos por tipo de la sesión, tal como los consume el frontend para ocultar botones y armar
 * selectores (odd/permisos-por-tipo-ticket, S6). Es comodidad de UI: cada operación la vuelve a
 * decidir el backend con el mismo alcance.
 */
export interface PermisosPorTipoSesion {
  /** `true` para ROOT y ADMINISTRADOR: pueden todo sobre todos los tipos, sin filas. */
  sinRestriccion: boolean;
  /** Acciones concedidas por `tipoId`, en el orden del catálogo. Un tipo sin filas no aparece. */
  porTipo: Record<string, AccionTipoTicket[]>;
  /**
   * Por módulo, la unión de las acciones concedidas en algún tipo de ese módulo. Alimenta el menú,
   * el gate de ruta y el botón de alta sin que el cliente tenga que cruzar con el catálogo de tipos.
   */
  porModulo: Record<string, AccionTipoTicket[]>;
}

/** Ordena un conjunto de acciones según `ACCIONES_TIPO_TICKET`, para una respuesta estable. */
function ordenadas(acciones: ReadonlySet<AccionTipoTicket>): AccionTipoTicket[] {
  return ACCIONES_TIPO_TICKET.filter((accion) => acciones.has(accion));
}

/**
 * ObtenerPermisosPorTipoUseCase — resume el alcance por tipo del actor para el frontend. El
 * módulo de cada tipo sale de `listarTipos`, que incluye los dados de baja: sus tickets siguen
 * visibles (L24), así que también cuentan para el acceso al menú del módulo.
 */
export class ObtenerPermisosPorTipoUseCase {
  constructor(private readonly permisos: Pick<IPermisoTipoTicketRepository, 'listarTipos'>) {}

  /**
   * @param alcance Alcance del actor, ya cargado por request (`CargadorAlcanceTicket`).
   * @returns Las acciones por tipo y por módulo; vacías y `sinRestriccion` para ROOT y ADMINISTRADOR.
   */
  async execute(
    alcance: Pick<AlcanceActorTicket, 'permisosPorTipo'>,
  ): Promise<PermisosPorTipoSesion> {
    const { permisosPorTipo } = alcance;
    if (permisosPorTipo === null) return { sinRestriccion: true, porTipo: {}, porModulo: {} };
    if (permisosPorTipo.size === 0) return { sinRestriccion: false, porTipo: {}, porModulo: {} };

    const moduloDe = new Map((await this.permisos.listarTipos()).map((t) => [t.id, t.modulo]));
    const porTipo: Record<string, AccionTipoTicket[]> = {};
    const unionPorModulo = new Map<string, Set<AccionTipoTicket>>();
    for (const [tipoId, acciones] of permisosPorTipo) {
      porTipo[tipoId] = ordenadas(acciones);
      const modulo = moduloDe.get(tipoId);
      // La FK al tipo lo impide en la base; si igual faltara, la fila no habilita ningún menú.
      if (modulo === undefined) continue;
      const union = unionPorModulo.get(modulo) ?? new Set<AccionTipoTicket>();
      for (const accion of acciones) union.add(accion);
      unionPorModulo.set(modulo, union);
    }
    const porModulo = Object.fromEntries(
      [...unionPorModulo].map(([modulo, acciones]) => [modulo, ordenadas(acciones)]),
    );
    return { sinRestriccion: false, porTipo, porModulo };
  }
}
