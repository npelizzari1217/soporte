import { describe, it, expect } from "vitest";
import { veredictoTramo } from "./veredicto-tramo";
import type { TramoTecnico } from "../types";

type Entrada = Pick<TramoTecnico, "finAt" | "motivoFin" | "metaS" | "habilS" | "cumplido">;

const CERRADO: Entrada = {
  finAt: "2026-10-05T15:00:00.000Z",
  motivoFin: "RESUELTO",
  habilS: 3600,
  metaS: 14_400,
  cumplido: true,
};

describe("veredictoTramo", () => {
  it.each<[string, Entrada, ReturnType<typeof veredictoTramo>]>([
    [
      "abierto → En curso, aunque el resto venga vacío",
      { finAt: null, motivoFin: null, habilS: null, metaS: null, cumplido: null },
      { etiqueta: "En curso", variant: "info", motivo: null },
    ],
    ["cumplido → Cumplido", CERRADO, { etiqueta: "Cumplido", variant: "success", motivo: null }],
    [
      "no cumplido → No cumplido",
      { ...CERRADO, habilS: 18_000, cumplido: false },
      { etiqueta: "No cumplido", variant: "destructive", motivo: null },
    ],
    [
      "reasignado → Sin veredicto, Reasignado",
      { ...CERRADO, motivoFin: "REASIGNADO", cumplido: null },
      { etiqueta: "Sin veredicto", variant: "secondary", motivo: "Reasignado" },
    ],
    [
      "desasignado → Sin veredicto, Desasignado",
      { ...CERRADO, motivoFin: "DESASIGNADO", cumplido: null },
      { etiqueta: "Sin veredicto", variant: "secondary", motivo: "Desasignado" },
    ],
    [
      "cerrado sin pasar por resuelto → Sin veredicto",
      { ...CERRADO, motivoFin: "CERRADO", cumplido: null },
      { etiqueta: "Sin veredicto", variant: "secondary", motivo: "Cerrado sin resolver" },
    ],
    [
      "cancelado → Sin veredicto, Cancelado",
      { ...CERRADO, motivoFin: "CANCELADO", cumplido: null },
      { etiqueta: "Sin veredicto", variant: "secondary", motivo: "Cancelado" },
    ],
    [
      "resuelto sin meta → Sin veredicto, Sin meta de SLA",
      { ...CERRADO, metaS: null, cumplido: null },
      { etiqueta: "Sin veredicto", variant: "secondary", motivo: "Sin meta de SLA" },
    ],
    [
      "resuelto con meta y sin medición → Sin veredicto, Sin medición",
      { ...CERRADO, habilS: null, cumplido: null },
      { etiqueta: "Sin veredicto", variant: "secondary", motivo: "Sin medición" },
    ],
  ])("%s", (_caso, entrada, esperado) => {
    expect(veredictoTramo(entrada)).toEqual(esperado);
  });
});
