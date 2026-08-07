import { describe, it, expect } from "vitest";
import { getValidNextStates } from "./estado-transitions";

/**
 * Regla de negocio crítica (spec R-M1 / T1.10): "transicionar estado, solo
 * transiciones válidas del flujo, SIN reapertura". Mirror exacto de
 * `backend/src/tickets/domain/state-machine/base-ticket-state-machine.ts`
 * (VALID_TRANSITIONS) — la UI solo debe OFRECER arcos que el backend además
 * validará server-side (doble capa, nunca confiar solo en esto).
 *
 * Nota (deviación documentada): el backend resuelve la máquina de estados
 * POR TIPO de ticket (`TicketStateMachineFactory.resolve`), con fallback a
 * la base cuando el tipo no tiene una implementación registrada. Hoy (B1)
 * el registry está vacío — TODOS los tipos usan la base. Si Compras/Edilicia
 * (B5) registran máquinas propias, este mirror deja de ser universal y
 * requerirá ajuste.
 */
describe("getValidNextStates", () => {
  it.each([
    ["NUEVO", ["ASIGNADO", "CANCELADO"]],
    ["ASIGNADO", ["EN_PROCESO", "CANCELADO"]],
    ["EN_PROCESO", ["RESUELTO", "CANCELADO"]],
    ["RESUELTO", ["CERRADO"]],
  ] as const)("desde %s → %j", (desde, esperado) => {
    expect(getValidNextStates(desde)).toEqual(esperado);
  });

  it.each(["CERRADO", "CANCELADO"] as const)(
    "%s es terminal — sin arcos de salida (sin reapertura, T9/T11)",
    (desde) => {
      expect(getValidNextStates(desde)).toEqual([]);
    },
  );

  it("estado desconocido/no seedeado → sin arcos válidos (fail-closed, no fail-open)", () => {
    expect(getValidNextStates("ESTADO_INEXISTENTE")).toEqual([]);
  });
});
