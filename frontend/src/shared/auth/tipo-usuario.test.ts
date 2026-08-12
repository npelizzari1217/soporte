import { describe, expect, it } from "vitest";
import { tipoUsuario } from "./tipo-usuario";
import type { JwtPayload } from "@/shared/api/types";

// Spec: bloque de identidad del sidebar — deriva una etiqueta de presentación
// desde is_global_admin/rol. NO es una fuente de autorización (ver JSDoc).

type Actor = Pick<JwtPayload, "is_global_admin" | "rol">;

describe("tipoUsuario", () => {
  it.each<[string, Actor, string]>([
    ["ROOT (is_global_admin) → 'Root', incluso con rol ADMINISTRADOR en la membresía", { is_global_admin: true, rol: "ADMINISTRADOR" }, "Root"],
    ["ROOT sin rol (token master) → 'Root'", { is_global_admin: true, rol: null }, "Root"],
    ["rol ADMINISTRADOR → 'Administrador'", { is_global_admin: false, rol: "ADMINISTRADOR" }, "Administrador"],
    ["rol TECNICO → 'Técnico'", { is_global_admin: false, rol: "TECNICO" }, "Técnico"],
    ["rol COLABORADOR → 'Colaborador'", { is_global_admin: false, rol: "COLABORADOR" }, "Colaborador"],
    ["rol USUARIO → 'Usuario'", { is_global_admin: false, rol: "USUARIO" }, "Usuario"],
    ["rol null y no-root → '—'", { is_global_admin: false, rol: null }, "—"],
    ["rol desconocido/no mapeado y no-root → '—'", { is_global_admin: false, rol: "ROL_INEXISTENTE" }, "—"],
  ])("%s", (_desc, actor, expected) => {
    expect(tipoUsuario(actor)).toBe(expected);
  });
});
