/**
 * describir-objetivo.service.ts — WU-2 (2.1/2.2), función pura de dominio
 * que traduce el objetivo resuelto de un plan preventivo (equipo o
 * ubicación) a la línea que antepone la descripción del ticket generado.
 *
 * Dominio puro: sin imports de `equipos/` ni de infraestructura. Recibe una
 * unión discriminada ya resuelta (`ObjetivoResuelto`), nunca la entidad de
 * equipos — el mapeo entidad → unión y el `try/catch` de I/O viven en la
 * capa de aplicación (`GenerarPreventivosUseCase`), mismo criterio que
 * `CalcularCicloService`.
 *
 * Ref spec: sdd/preventivo-edicion-y-permisos/specs/preventivo-objetivo-en-ticket/spec
 * Requirements "La descripción del ticket antepone el objetivo del plan" y
 * "Objetivo irresoluble degrada el texto sin fallar la generación".
 * Ref design: ADR-1. Tarea: 2.1, 2.2.
 */

/**
 * Objetivo de un plan preventivo ya resuelto contra el repositorio de
 * equipos. Cinco estados de equipo (nunca colapsados, ADR-1) + ubicación +
 * el caso sin objetivo de una fila histórica que `reconstitute()` no
 * revalida.
 */
export type ObjetivoResuelto =
  | { tipo: 'UBICACION'; texto: string }
  | { tipo: 'EQUIPO_VIGENTE'; nombre: string }
  | { tipo: 'EQUIPO_DADO_DE_BAJA'; nombre: string }
  | { tipo: 'EQUIPO_ELIMINADO'; nombre: string }
  | { tipo: 'EQUIPO_INEXISTENTE'; equipoId: string }
  | { tipo: 'EQUIPO_NO_CONSULTABLE'; equipoId: string }
  | { tipo: 'SIN_OBJETIVO' };

/**
 * Traduce el objetivo resuelto a la línea que encabeza la descripción del
 * ticket. `null` cuando no hay objetivo que anteponer (`SIN_OBJETIVO`).
 */
export function describirObjetivo(objetivo: ObjetivoResuelto): string | null {
  switch (objetivo.tipo) {
    case 'UBICACION':
      return `Ubicación: ${objetivo.texto}`;
    case 'EQUIPO_VIGENTE':
      return `Equipo: ${objetivo.nombre}`;
    case 'EQUIPO_DADO_DE_BAJA':
      return `Equipo: ${objetivo.nombre} (dado de baja)`;
    case 'EQUIPO_ELIMINADO':
      return `Equipo: ${objetivo.nombre} (eliminado del inventario)`;
    case 'EQUIPO_INEXISTENTE':
      return `Equipo: no encontrado (id ${objetivo.equipoId})`;
    case 'EQUIPO_NO_CONSULTABLE':
      return `Equipo: no se pudo consultar (id ${objetivo.equipoId})`;
    case 'SIN_OBJETIVO':
      return null;
  }
}

/**
 * Compone la descripción final del ticket: `<línea de objetivo>\n\n<instrucciones>`.
 * Sin línea de objetivo (`SIN_OBJETIVO`) devuelve las instrucciones solas;
 * sin instrucciones devuelve la línea de objetivo sola. Nunca deja una línea
 * en blanco colgada.
 *
 * Cuenta como "sin instrucciones" tanto `null` como la cadena vacía o la que
 * es solo espacios: el DTO las acepta (`@IsOptional() @IsString()` sin
 * `@IsNotEmpty()`), y componerlas dejaría la línea colgada que OT-R1 prohíbe.
 * El texto real viaja sin recortar — el `trim()` solo decide la rama.
 */
export function componerDescripcionTicket(
  objetivo: ObjetivoResuelto,
  instrucciones: string | null,
): string {
  const lineaObjetivo = describirObjetivo(objetivo);
  const instruccionesUtiles =
    instrucciones !== null && instrucciones.trim() !== '' ? instrucciones : null;

  if (lineaObjetivo === null) return instruccionesUtiles ?? '';
  if (instruccionesUtiles === null) return lineaObjetivo;
  return `${lineaObjetivo}\n\n${instruccionesUtiles}`;
}
