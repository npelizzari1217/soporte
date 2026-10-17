import { describe, it, expect } from "vitest";
import { motivoTareasSoloLectura, puedeCompletarTareaUi, puedeGestionarTareasUi, type ActorTareasUi } from "./permisos-tareas";

/**
 * La matriz con responsable conocido la cubre `ticket-tareas.test.tsx`. Acá va
 * el caso que solo existe en el front: el responsable desconocido (`undefined`),
 * que es lo que ve el diálogo de Edilicia sin `TICKETS:LECTURA`.
 */
const conModulo: ActorTareasUi = { id: "u1", esAdministrador: false, tieneModificacionDelModulo: true };
const sinModulo: ActorTareasUi = { ...conModulo, tieneModificacionDelModulo: false };

describe("permisos-tareas — responsable desconocido", () => {
  it("gestiona quien tiene el permiso del módulo, porque podría ser el responsable", () => {
    expect(puedeGestionarTareasUi(conModulo, undefined)).toBe(true);
    expect(puedeGestionarTareasUi(sinModulo, undefined)).toBe(false);
  });

  it("completa quien tiene el permiso del módulo o es el técnico de la tarea", () => {
    expect(puedeCompletarTareaUi(conModulo, undefined, null)).toBe(true);
    expect(puedeCompletarTareaUi(sinModulo, undefined, null)).toBe(false);
    expect(puedeCompletarTareaUi(sinModulo, undefined, "u1")).toBe(true);
  });

  it("con el responsable conocido, el permiso del módulo solo no alcanza", () => {
    expect(puedeGestionarTareasUi(conModulo, "otro")).toBe(false);
    expect(puedeCompletarTareaUi(conModulo, "otro", null)).toBe(false);
    expect(puedeCompletarTareaUi(conModulo, null, null)).toBe(false);
  });
});

describe("motivoTareasSoloLectura (odd/ticket-cerrado-solo-lectura, S4)", () => {
  it("CERRADO y CANCELADO bloquean con su motivo, aunque no esté bloqueada por compra", () => {
    expect(motivoTareasSoloLectura("CERRADO", false)).toBe(
      "El ticket está cerrado: sus tareas y comentarios ya no se modifican.",
    );
    expect(motivoTareasSoloLectura("CANCELADO", false)).toBe(
      "El ticket está cancelado: sus tareas y comentarios ya no se modifican.",
    );
  });

  it("bloqueada por compra bloquea en cualquier estado no terminal, y el estado terminal manda antes", () => {
    expect(motivoTareasSoloLectura("EN_PROCESO", true)).toBe(
      "La reparación está bloqueada por una compra en curso: sus tareas y comentarios ya no se modifican.",
    );
    expect(motivoTareasSoloLectura("CERRADO", true)).toMatch(/cerrado/);
  });

  it("RESUELTO, los demás estados y el catálogo sin resolver no bloquean", () => {
    expect(motivoTareasSoloLectura("RESUELTO", false)).toBeNull();
    expect(motivoTareasSoloLectura("NUEVO", false)).toBeNull();
    expect(motivoTareasSoloLectura(undefined, false)).toBeNull();
  });
});
