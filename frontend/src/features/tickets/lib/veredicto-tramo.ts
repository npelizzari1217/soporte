/**
 * Veredicto de un tramo del técnico para la UI (odd/tasks/tiempo-tecnico.md, T4, S4, S6). El
 * backend es la autoridad: `cumplido` ya viene calculado y solo existe en el tramo que cerró en
 * RESUELTO con meta y medición. Acá solo se elige la etiqueta y, sin veredicto, el porqué.
 */
import type { BadgeProps } from "@/components/ui/badge";
import type { MotivoFinTramo, TramoTecnico } from "../types";

export type EtiquetaVeredicto = "En curso" | "Cumplido" | "No cumplido" | "Sin veredicto";

export interface VeredictoTramo {
  etiqueta: EtiquetaVeredicto;
  variant: NonNullable<BadgeProps["variant"]>;
  /** Por qué no hay veredicto; `null` si lo hay o si el tramo sigue en curso. */
  motivo: string | null;
}

/** Cierres que no son del técnico que resolvió: guardan su tiempo sin evaluarlo (S6). */
const MOTIVO_SIN_RESOLVER: Readonly<Record<Exclude<MotivoFinTramo, "RESUELTO">, string>> = {
  REASIGNADO: "Reasignado",
  DESASIGNADO: "Desasignado",
  CERRADO: "Cerrado sin resolver",
  CANCELADO: "Cancelado",
};

/**
 * @param tramo Tramo tal como lo manda el backend.
 * @returns Etiqueta, variante del badge y, sin veredicto, el motivo.
 */
export function veredictoTramo(
  tramo: Pick<TramoTecnico, "finAt" | "motivoFin" | "metaS" | "habilS" | "cumplido">,
): VeredictoTramo {
  if (tramo.finAt === null) return { etiqueta: "En curso", variant: "info", motivo: null };
  if (tramo.cumplido === true) return { etiqueta: "Cumplido", variant: "success", motivo: null };
  if (tramo.cumplido === false) return { etiqueta: "No cumplido", variant: "destructive", motivo: null };

  let motivo: string;
  if (tramo.motivoFin !== null && tramo.motivoFin !== "RESUELTO") {
    motivo = MOTIVO_SIN_RESOLVER[tramo.motivoFin];
  } else if (tramo.metaS === null) {
    motivo = "Sin meta de SLA";
  } else {
    // Resuelto con meta pero sin `habilS`: la medición falló al cerrar.
    motivo = "Sin medición";
  }
  return { etiqueta: "Sin veredicto", variant: "secondary", motivo };
}
