import { describe, it, expect } from "vitest";
import { puedeCompletarTareaUi, puedeGestionarTareasUi, type ActorTareasUi } from "./permisos-tareas";

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
