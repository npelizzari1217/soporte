import { describe, it, expect } from "vitest";
import { motivoTareasSoloLectura, puedeCompletarTareaUi, puedeGestionarTareasUi, type ActorTareasUi } from "./permisos-tareas";

/**
 * La matriz con responsable conocido la cubre `ticket-tareas.test.tsx`. Acá va
 * el caso que solo existe en el front: el responsable desconocido (`undefined`),
 * que es lo que ve el diálogo de Edilicia mientras el ticket carga o si su
 * lectura falla.
 */
const conTipo: ActorTareasUi = { id: "u1", esAdministrador: false, tieneModificacionDelTipo: true };
const sinTipo: ActorTareasUi = { ...conTipo, tieneModificacionDelTipo: false };

describe("permisos-tareas — responsable desconocido", () => {
  it("gestiona quien tiene MODIFICACION sobre el tipo, porque podría ser el responsable", () => {
    expect(puedeGestionarTareasUi(conTipo, undefined)).toBe(true);
    expect(puedeGestionarTareasUi(sinTipo, undefined)).toBe(false);
  });

  it("completa quien tiene MODIFICACION sobre el tipo o es el técnico de la tarea", () => {
    expect(puedeCompletarTareaUi(conTipo, undefined, null)).toBe(true);
    expect(puedeCompletarTareaUi(sinTipo, undefined, null)).toBe(false);
    expect(puedeCompletarTareaUi(sinTipo, undefined, "u1")).toBe(true);
  });

  it("con el responsable conocido, MODIFICACION sobre el tipo solo no alcanza", () => {
    expect(puedeGestionarTareasUi(conTipo, "otro")).toBe(false);
    expect(puedeCompletarTareaUi(conTipo, "otro", null)).toBe(false);
    expect(puedeCompletarTareaUi(conTipo, null, null)).toBe(false);
  });
});

describe("motivoTareasSoloLectura (odd/ticket-cerrado-solo-lectura, S4)", () => {
  it("CERRADO y CANCELADO bloquean con su motivo, aunque no esté bloqueada por compra", () => {
    expect(motivoTareasSoloLectura("CERRADO", false)).toBe(
      "El ticket está cerrado: sus tareas ya no se modifican.",
    );
    expect(motivoTareasSoloLectura("CANCELADO", false)).toBe(
      "El ticket está cancelado: sus tareas ya no se modifican.",
    );
  });

  it("bloqueada por compra bloquea en cualquier estado no terminal, y el estado terminal manda antes", () => {
    expect(motivoTareasSoloLectura("EN_PROCESO", true)).toBe(
      "El ticket está bloqueado por una compra en curso: sus tareas ya no se modifican.",
    );
    expect(motivoTareasSoloLectura("CERRADO", true)).toMatch(/cerrado/);
  });

  it("RESUELTO, los demás estados y el catálogo sin resolver no bloquean", () => {
    expect(motivoTareasSoloLectura("RESUELTO", false)).toBeNull();
    expect(motivoTareasSoloLectura("NUEVO", false)).toBeNull();
    expect(motivoTareasSoloLectura(undefined, false)).toBeNull();
  });
});
