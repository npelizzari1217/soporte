/**
 * Traducción a SQL del alcance por tipo de un listado o agregado de tickets
 * (odd/permisos-por-tipo-ticket, D5 e). Es el único lugar que define la regla de fila en la base:
 * la usan el repositorio de tickets (`findAll`, `count`, `esVisiblePara`), y a través de él la
 * grilla de Edilicia, el dashboard, las tareas completadas y el resumen de CSAT, para que todos
 * filtren igual que el acceso por id (`esTicketAccesiblePara`).
 */
import { Prisma } from '.prisma/tenant';
import { AlcanceListadoTickets } from '../../../domain/ports/i-ticket.repository';

/**
 * Regla de visibilidad de un ticket para un actor sin `VER_TODOS` sobre su tipo: lo solicitó, es su
 * responsable (decisión del dueño del 2026-10-14), o es el técnico de una tarea activa del ticket
 * (odd/tareas-con-tecnico, CA10). El `EXISTS` sobre `tareas_ticket` usa el índice (`tecnico_id`,
 * `deleted_at`, `ticket_id`).
 *
 * @param actorId Id del actor.
 * @returns La condición sobre `tickets`.
 */
export function whereVisiblePara(actorId: string): Prisma.TicketWhereInput {
  return {
    OR: [
      { solicitanteId: actorId },
      { asignadoId: actorId },
      { tareas: { some: { tecnicoId: actorId, deletedAt: null } } },
    ],
  };
}

/**
 * Condición sobre `tickets`: los tipos con `VER_TODOS` enteros, y los de solo `LECTURA` por la regla
 * de fila. Un alcance sin tipos no deja entrar nada (`IN ()` vacío). Va siempre en un `AND` propio,
 * para no pisar otros `OR` del filtro (la búsqueda de texto).
 *
 * @param alcance Alcance del actor.
 * @returns La condición sobre `tickets`.
 */
export function whereAlcanceListado(alcance: AlcanceListadoTickets): Prisma.TicketWhereInput {
  return {
    OR: [
      { tipoId: { in: [...alcance.tiposVerTodos] } },
      {
        AND: [{ tipoId: { in: [...alcance.tiposPorFila] } }, whereVisiblePara(alcance.actorId)],
      },
    ],
  };
}

/** `alias.tipo_id IN (...)` con los ids dados; sin ids, `FALSE`. */
function tipoEn(alias: Prisma.Sql, tipos: readonly string[]): Prisma.Sql {
  if (tipos.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`${alias}.tipo_id IN (${Prisma.join(tipos.map((id) => Prisma.sql`${id}::uuid`))})`;
}

/**
 * La misma condición que `whereAlcanceListado`, para consultas en SQL crudo (`$queryRaw`) que leen
 * `tickets` con un alias. La regla de fila repite la de `whereVisiblePara` columna por columna:
 * cambiar una sin la otra haría que el agregado cuente filas distintas que el listado.
 *
 * @param alcance Alcance del actor.
 * @param alias Alias de `tickets` en la consulta (por ejemplo `Prisma.raw('t')`).
 * @returns La condición, lista para un `WHERE`.
 */
export function sqlAlcanceListado(alcance: AlcanceListadoTickets, alias: Prisma.Sql): Prisma.Sql {
  const actor = Prisma.sql`${alcance.actorId}::uuid`;
  const fila = Prisma.sql`(
    ${alias}.solicitante_id = ${actor}
    OR ${alias}.asignado_id = ${actor}
    OR EXISTS (
      SELECT 1 FROM tareas_ticket tt
      WHERE tt.ticket_id = ${alias}.id AND tt.tecnico_id = ${actor} AND tt.deleted_at IS NULL
    )
  )`;
  return Prisma.sql`(${tipoEn(alias, alcance.tiposVerTodos)} OR (${tipoEn(alias, alcance.tiposPorFila)} AND ${fila}))`;
}
