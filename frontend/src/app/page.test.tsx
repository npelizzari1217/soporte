import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import type { JwtPayload } from "@/shared/api/types";
import Home from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

let usuarioActual: JwtPayload | null = null;
vi.mock("@/shared/auth/modulo-layout-gate", () => ({
  usuarioDeLaCookie: vi.fn(async () => usuarioActual),
}));

function usuario(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: "u1",
    cliente_id: "c1",
    rol: "TECNICO",
    permisos: [],
    is_global_admin: false,
    cliente_nombre: "Cliente Uno",
    membresias: [],
    modulos: [],
    nombre: "Ana",
    apellido: "Pérez",
    ...overrides,
  };
}

async function destino(): Promise<string> {
  await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
  return vi.mocked(redirect).mock.calls.at(-1)?.[0] as string;
}

describe('Home ("/") — inicio según el menú del usuario (odd/permisos-por-tipo-ticket, S0)', () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    usuarioActual = null;
  });

  it("con TICKETS:LECTURA va a /tickets", async () => {
    usuarioActual = usuario({
      permisos: ["TICKETS:LECTURA"],
      modulos: ["TICKETS"],
    });
    expect(await destino()).toBe("/tickets");
  });

  it("sin Tickets y con Edilicia va a /edilicia, no a /tickets (que lo devolvería acá en ciclo)", async () => {
    usuarioActual = usuario({
      permisos: ["EDILICIA:LECTURA"],
      modulos: ["EDILICIA"],
    });
    expect(await destino()).toBe("/edilicia");
  });

  it("sin ningún área con gate va a la Ayuda, que todos ven", async () => {
    usuarioActual = usuario({ permisos: [] });
    expect(await destino()).toBe("/kb");
  });

  it("sin token legible va a /tickets: su gate deja pasar ese caso (refresh tolerante)", async () => {
    usuarioActual = null;
    expect(await destino()).toBe("/tickets");
  });
});
