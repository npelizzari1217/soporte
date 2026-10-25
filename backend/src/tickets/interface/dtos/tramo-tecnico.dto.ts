import { MotivoFinTramo } from '../../../tiempo-tecnico/domain/tramo-tecnico';
import { TramoTecnico } from '../../../tiempo-tecnico/domain/ports/i-tramo-tecnico.repository';
import { NombreUsuario } from './tarea-ticket.dto';

/**
 * Un tramo del técnico en la respuesta de `GET /tickets/:id/tramos-tecnico`
 * (odd/tasks/tiempo-tecnico.md, T4, S8). Los nombres siguen el patrón de `asignadoNombre` y
 * `asignadoApellido` del detalle: `null` si el usuario no se pudo resolver en master.
 *
 * Un tramo abierto (`finAt: null`) está en curso: sin motivo, medición, meta ni veredicto.
 * `cumplido` solo existe en el que cerró en RESUELTO con meta y medición (S4, S6).
 */
export interface TramoTecnicoResponseDto {
  id: string;
  tecnicoId: string;
  tecnicoNombre: string | null;
  tecnicoApellido: string | null;
  inicioAt: string;
  finAt: string | null;
  motivoFin: MotivoFinTramo | null;
  habilS: number | null;
  metaS: number | null;
  cumplido: boolean | null;
}

/**
 * @param tramo Tramo leído del repositorio.
 * @param nombres Nombres de master por id de usuario, resueltos en lote.
 * @returns El tramo en la forma de la respuesta HTTP.
 */
export function toTramoTecnicoResponseDto(
  tramo: TramoTecnico,
  nombres: ReadonlyMap<string, NombreUsuario>,
): TramoTecnicoResponseDto {
  const tecnico = nombres.get(tramo.tecnicoId);
  return {
    id: tramo.id,
    tecnicoId: tramo.tecnicoId,
    tecnicoNombre: tecnico?.nombre ?? null,
    tecnicoApellido: tecnico?.apellido ?? null,
    inicioAt: tramo.inicioAt.toISOString(),
    finAt: tramo.finAt ? tramo.finAt.toISOString() : null,
    motivoFin: tramo.motivoFin,
    habilS: tramo.habilS,
    metaS: tramo.metaS,
    cumplido: tramo.cumplido,
  };
}
