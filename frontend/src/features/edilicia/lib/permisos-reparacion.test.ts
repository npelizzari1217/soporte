import { describe, expect, it } from "vitest";
import { puedeEditarReparacionUi, textoMotivoNoEditable } from "./permisos-reparacion";

const sinTareas = { bloqueada: false, subtareas: [] };

describe("puedeEditarReparacionUi (odd/detalle-ticket-legible, S5-S6)", () => {
  it.each(["NUEVO", "ASIGNADO"])("en %s sin tareas completadas se puede", (estado) => {
    expect(puedeEditarReparacionUi(sinTareas, estado, false, false)).toEqual({ puede: true });
  });

  it.each(["EN_PROCESO", "ESPERANDO_CLIENTE"])("en %s un usuario común no puede: motivo EN_PROCESO", (estado) => {
    expect(puedeEditarReparacionUi(sinTareas, estado, false, false)).toEqual({ puede: false, motivo: "EN_PROCESO" });
  });

  it.each(["RESUELTO", "CERRADO", "CANCELADO"])(
    "en %s un usuario común no puede: motivo SOLO_COMENTARIOS (odd/cerrado-solo-comentarios)",
    (estado) => {
      expect(puedeEditarReparacionUi(sinTareas, estado, false, false)).toEqual({
        puede: false,
        motivo: "SOLO_COMENTARIOS",
      });
    },
  );

  it.each(["RESUELTO", "CERRADO", "CANCELADO"])(
    "caso hermano: un ADMINISTRADOR (no ROOT) en %s sigue con la regla de siempre, motivo EN_PROCESO",
    (estado) => {
      expect(puedeEditarReparacionUi(sinTareas, estado, false, true)).toEqual({ puede: false, motivo: "EN_PROCESO" });
    },
  );

  it("el texto del motivo SOLO_COMENTARIOS nombra el estado", () => {
    expect(textoMotivoNoEditable("SOLO_COMENTARIOS", "CANCELADO")).toBe(
      "El ticket está cancelado: solo admite comentarios.",
    );
    expect(textoMotivoNoEditable("EN_PROCESO", "EN_PROCESO")).toBe("Ya está en proceso: solo ROOT puede editarla.");
  });

  it("con una tarea completada un usuario común no puede: motivo TAREAS_COMPLETADAS", () => {
    const conCompletada = { bloqueada: false, subtareas: [{ completada: false }, { completada: true }] };
    expect(puedeEditarReparacionUi(conCompletada, "NUEVO", false, false)).toEqual({
      puede: false,
      motivo: "TAREAS_COMPLETADAS",
    });
  });

  it("ROOT puede aunque esté en proceso y con tareas completadas", () => {
    const conCompletada = { bloqueada: false, subtareas: [{ completada: true }] };
    expect(puedeEditarReparacionUi(conCompletada, "RESUELTO", true, true)).toEqual({ puede: true });
  });

  it("bloqueada por una compra no puede nadie, ni ROOT, y ese motivo gana a los demás", () => {
    const bloqueada = { bloqueada: true, subtareas: [{ completada: true }] };
    expect(puedeEditarReparacionUi(bloqueada, "RESUELTO", false, false)).toEqual({ puede: false, motivo: "BLOQUEADA" });
    expect(puedeEditarReparacionUi(bloqueada, "NUEVO", true, true)).toEqual({ puede: false, motivo: "BLOQUEADA" });
  });

  it("con el catálogo de estados sin resolver no bloquea por estado: decide el backend", () => {
    expect(puedeEditarReparacionUi(sinTareas, undefined, false, false)).toEqual({ puede: true });
  });
});
