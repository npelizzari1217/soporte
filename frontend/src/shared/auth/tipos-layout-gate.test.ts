import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import type { JwtPayload } from "@/shared/api/types";
import type { PermisosPorTipo } from "@/shared/auth/permisos-por-tipo";
import { tiposLayoutGate } from "./tipos-layout-gate";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

let usuarioActual: JwtPayload | null = null;
vi.mock("@/shared/auth/modulo-layout-gate", () => ({
  usuarioDeLaCookie: vi.fn(async () => usuarioActual),
}));

let permisosActuales: PermisosPorTipo | null = null;
vi.mock("@/shared/auth/permisos-por-tipo-servidor", () => ({
  permisosPorTipoDelServidor: vi.fn(async () => permisosActuales),
}));

const TECNICO: JwtPayload = {
  sub: "u1",
  cliente_id: "c1",
  rol: "TECNICO",
  // Sin celdas ni módulos en el JWT: el acceso sale de las filas por tipo.
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
  nombre: "Ana",
  apellido: "Pérez",
};

function permisos(porModulo: PermisosPorTipo["porModulo"]): PermisosPorTipo {
  return { sinRestriccion: false, porTipo: {}, porModulo };
}

describe("tiposLayoutGate (odd/permisos-por-tipo-ticket, S5, T6)", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    usuarioActual = TECNICO;
    permisosActuales = null;
  });

  it("con LECTURA en un tipo del módulo deja pasar, sin la celda ni el módulo en el JWT", async () => {
    permisosActuales = permisos({ TICKETS: ["LECTURA"] });
    await expect(tiposLayoutGate("TICKETS")).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sin LECTURA en ningún tipo del módulo manda al inicio, aunque tenga otra acción o la celda", async () => {
    usuarioActual = { ...TECNICO, permisos: ["EDILICIA:LECTURA"], modulos: ["EDILICIA"] };
    permisosActuales = permisos({ EDILICIA: ["ALTAS"], TICKETS: ["LECTURA"] });
    await expect(tiposLayoutGate("EDILICIA")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("sin token legible deja pasar (refresh tolerante) y no consulta los permisos", async () => {
    usuarioActual = null;
    permisosActuales = permisos({});
    await expect(tiposLayoutGate("TICKETS")).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("si los permisos no se pudieron leer deja pasar: decide el cliente, que no redirige", async () => {
    permisosActuales = null;
    await expect(tiposLayoutGate("TICKETS")).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
