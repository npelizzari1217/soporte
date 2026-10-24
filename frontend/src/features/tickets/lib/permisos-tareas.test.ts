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

describe("motivoTareasSoloLectura (odd/cerrado-solo-comentarios, S1-S3; odd/ticket-cerrado-solo-lectura, S4)", () => {
  it("RESUELTO, CERRADO y CANCELADO dejan las tareas en solo lectura a quien no es administrador, nombrando el estado", () => {
    expect(motivoTareasSoloLectura("RESUELTO", false, false)).toBe("El ticket está resuelto: solo admite comentarios.");
    expect(motivoTareasSoloLectura("CERRADO", false, false)).toBe("El ticket está cerrado: solo admite comentarios.");
    expect(motivoTareasSoloLectura("CANCELADO", false, false)).toBe(
      "El ticket está cancelado: solo admite comentarios.",
    );
  });

  it("caso hermano: un ADMINISTRADOR o ROOT edita las tareas en esos estados (S3)", () => {
    for (const estado of ["RESUELTO", "CERRADO", "CANCELADO"]) {
      expect(motivoTareasSoloLectura(estado, false, true)).toBeNull();
    }
  });

  it("bloqueada por compra bloquea a cualquiera, administrador incluido, y el estado manda antes", () => {
    const bloqueo = "El ticket está bloqueado por una compra en curso: sus tareas ya no se modifican.";
    expect(motivoTareasSoloLectura("EN_PROCESO", true, false)).toBe(bloqueo);
    expect(motivoTareasSoloLectura("CERRADO", true, true)).toBe(bloqueo);
    expect(motivoTareasSoloLectura("CERRADO", true, false)).toMatch(/cerrado/);
  });

  it("los demás estados y el catálogo sin resolver no bloquean", () => {
    expect(motivoTareasSoloLectura("NUEVO", false, false)).toBeNull();
    expect(motivoTareasSoloLectura("EN_PROCESO", false, false)).toBeNull();
    expect(motivoTareasSoloLectura(undefined, false, false)).toBeNull();
  });
});
