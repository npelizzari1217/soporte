import { describe, it, expect } from "vitest";
import {
  getEstadosCorrectivos,
  getManualNextStates,
  getValidNextStates,
  puedeAsignarYPonerEnProceso,
  puedeEditarDatos,
} from "./estado-transitions";

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

/**
 * Flujo MANUAL vs control unificado "Asignar y poner en proceso": los arcos de
 * arranque (NUEVO→ASIGNADO, ASIGNADO→EN_PROCESO) los cubre el botón combinado,
 * así que se excluyen del control de transición manual para no ofrecer dos
 * caminos al mismo destino.
 */
describe("getManualNextStates", () => {
  it.each([
    ["NUEVO", ["CANCELADO"]],
    ["ASIGNADO", ["CANCELADO"]],
    ["EN_PROCESO", ["RESUELTO", "CANCELADO"]],
    ["RESUELTO", ["CERRADO"]],
  ] as const)("desde %s → %j (sin el arco de arranque)", (desde, esperado) => {
    expect(getManualNextStates(desde)).toEqual(esperado);
  });
});

describe("puedeAsignarYPonerEnProceso", () => {
  it.each(["NUEVO", "ASIGNADO"] as const)("%s puede llegar a EN_PROCESO vía el control unificado", (estado) => {
    expect(puedeAsignarYPonerEnProceso(estado)).toBe(true);
  });

  it.each(["EN_PROCESO", "RESUELTO", "CERRADO", "CANCELADO"] as const)(
    "%s NO ofrece el control unificado",
    (estado) => {
      expect(puedeAsignarYPonerEnProceso(estado)).toBe(false);
    },
  );
});

/**
 * Salto correctivo (ROOT/ADMINISTRADOR): destinos = todos los NO terminales
 * menos el estado actual. NUNCA incluye CERRADO/CANCELADO.
 */
describe("getEstadosCorrectivos", () => {
  it.each([
    ["NUEVO", ["ASIGNADO", "EN_PROCESO", "RESUELTO"]],
    ["EN_PROCESO", ["NUEVO", "ASIGNADO", "RESUELTO"]],
    ["CERRADO", ["NUEVO", "ASIGNADO", "EN_PROCESO", "RESUELTO"]],
    ["CANCELADO", ["NUEVO", "ASIGNADO", "EN_PROCESO", "RESUELTO"]],
  ] as const)("desde %s → %j (no terminales menos el actual)", (desde, esperado) => {
    expect(getEstadosCorrectivos(desde)).toEqual(esperado);
  });

  it.each(["CERRADO", "CANCELADO"] as const)("nunca ofrece el terminal %s como destino", (terminal) => {
    for (const desde of ["NUEVO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO", "CANCELADO"]) {
      expect(getEstadosCorrectivos(desde)).not.toContain(terminal);
    }
  });
});

/**
 * Regla de bloqueo de edición por estado (mirror backend): EN_PROCESO+ → solo
 * ROOT. NUEVO/ASIGNADO → cualquiera con permiso. ROOT edita siempre.
 */
describe("puedeEditarDatos", () => {
  it.each(["NUEVO", "ASIGNADO"] as const)("no-ROOT en %s → puede editar", (estado) => {
    expect(puedeEditarDatos(estado, false)).toBe(true);
  });

  it.each(["EN_PROCESO", "RESUELTO", "CERRADO", "CANCELADO"] as const)(
    "no-ROOT en %s → NO puede editar (bloqueado)",
    (estado) => {
      expect(puedeEditarDatos(estado, false)).toBe(false);
    },
  );

  it.each(["NUEVO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO", "CANCELADO"] as const)(
    "ROOT en %s → puede editar SIEMPRE",
    (estado) => {
      expect(puedeEditarDatos(estado, true)).toBe(true);
    },
  );
});
