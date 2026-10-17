import { describe, expect, it } from "vitest";
import { puedeEditarReparacionUi } from "./permisos-reparacion";

const sinTareas = { bloqueada: false, subtareas: [] };

describe("puedeEditarReparacionUi (odd/detalle-ticket-legible, S5-S6)", () => {
  it.each(["NUEVO", "ASIGNADO"])("en %s sin tareas completadas se puede", (estado) => {
    expect(puedeEditarReparacionUi(sinTareas, estado, false)).toEqual({ puede: true });
  });

  it.each(["EN_PROCESO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO", "CANCELADO"])(
    "en %s un usuario común no puede: motivo EN_PROCESO",
    (estado) => {
      expect(puedeEditarReparacionUi(sinTareas, estado, false)).toEqual({ puede: false, motivo: "EN_PROCESO" });
    },
  );

  it("con una tarea completada un usuario común no puede: motivo TAREAS_COMPLETADAS", () => {
    const conCompletada = { bloqueada: false, subtareas: [{ completada: false }, { completada: true }] };
    expect(puedeEditarReparacionUi(conCompletada, "NUEVO", false)).toEqual({
      puede: false,
      motivo: "TAREAS_COMPLETADAS",
    });
  });

  it("ROOT puede aunque esté en proceso y con tareas completadas", () => {
    const conCompletada = { bloqueada: false, subtareas: [{ completada: true }] };
    expect(puedeEditarReparacionUi(conCompletada, "RESUELTO", true)).toEqual({ puede: true });
  });

  it("bloqueada por una compra no puede nadie, ni ROOT, y ese motivo gana a los demás", () => {
    const bloqueada = { bloqueada: true, subtareas: [{ completada: true }] };
    expect(puedeEditarReparacionUi(bloqueada, "RESUELTO", false)).toEqual({ puede: false, motivo: "BLOQUEADA" });
    expect(puedeEditarReparacionUi(bloqueada, "NUEVO", true)).toEqual({ puede: false, motivo: "BLOQUEADA" });
  });

  it("con el catálogo de estados sin resolver no bloquea por estado: decide el backend", () => {
    expect(puedeEditarReparacionUi(sinTareas, undefined, false)).toEqual({ puede: true });
  });
});
