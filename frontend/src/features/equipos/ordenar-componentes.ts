/**
 * Orden del listado enriquecido de componentes de un equipo (activos +
 * dados de baja, item "componentes de equipo"): primero los ACTIVOS en
 * orden alfabético, luego los DADOS DE BAJA en orden alfabético — el
 * listado muestra el historial completo, no solo los vigentes, así que
 * separar por estado ayuda a escanear rápido lo que sigue en uso.
 *
 * Clave de orden: `tipoNombre ?? tipoComponenteCodigo` (nombre resuelto del
 * catálogo MASTER; el código crudo si no hay match), desempatando por
 * `descripcion` y luego `capacidad`. `localeCompare` con locale "es" para
 * un orden alfabético correcto (acentos, ñ).
 */
export interface ComponenteOrdenable {
  activo: boolean;
  tipoComponenteCodigo: string;
  tipoNombre: string | null;
  descripcion: string | null;
  capacidad: string | null;
}

function claveOrden(componente: ComponenteOrdenable): string {
  return componente.tipoNombre ?? componente.tipoComponenteCodigo;
}

function comparar(a: ComponenteOrdenable, b: ComponenteOrdenable): number {
  const porTipo = claveOrden(a).localeCompare(claveOrden(b), "es");
  if (porTipo !== 0) return porTipo;
  const porDescripcion = (a.descripcion ?? "").localeCompare(b.descripcion ?? "", "es");
  if (porDescripcion !== 0) return porDescripcion;
  return (a.capacidad ?? "").localeCompare(b.capacidad ?? "", "es");
}

/** Activos primero (orden alfabético), luego dados de baja (orden alfabético). */
export function ordenarComponentes<T extends ComponenteOrdenable>(componentes: T[]): T[] {
  const activos = componentes.filter((c) => c.activo).sort(comparar);
  const inactivos = componentes.filter((c) => !c.activo).sort(comparar);
  return [...activos, ...inactivos];
}
