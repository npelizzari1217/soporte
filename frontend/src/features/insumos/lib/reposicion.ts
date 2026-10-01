/**
 * Lectura en pantalla del estado de reposición, compartida por la ficha del
 * insumo y el reporte de stock (reporte-stock-insumos): una sola traducción.
 */
import type { EstadoReposicionInsumo } from "../types";

/**
 * Cómo se lee cada estado de reposición en pantalla. Es traducción, no
 * decisión: el estado ya viene resuelto del backend.
 *
 * El `Record<EstadoReposicionInsumo, …>` es el mecanismo, no una prolijidad: si
 * mañana entra un cuarto estado en `ESTADOS_REPOSICION_INSUMO`, esto rompe el
 * typecheck en vez de renderizar una etiqueta vacía en silencio.
 */
export const ETIQUETA_REPOSICION: Record<EstadoReposicionInsumo, string> = {
  SIN_PUNTO_DEFINIDO: "Sin punto de reposición definido",
  SUFICIENTE: "Existencia suficiente",
  BAJO_MINIMO: "Hay que reponer",
};

/** Variante del badge por estado, con la misma cobertura exhaustiva. */
export const VARIANTE_REPOSICION: Record<EstadoReposicionInsumo, "outline" | "success" | "destructive"> = {
  SIN_PUNTO_DEFINIDO: "outline",
  SUFICIENTE: "success",
  BAJO_MINIMO: "destructive",
};
