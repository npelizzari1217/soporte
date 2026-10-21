import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import type { JwtPayload } from "@/shared/api/types";
import type { PermisosPorTipo } from "@/shared/auth/permisos-por-tipo";
import { permisosDeTest } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";
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

// Lo que el backend responde en `GET /tickets/permisos-por-tipo`; `null` si no se pudo leer.
let permisosActuales: PermisosPorTipo | null = null;
vi.mock("@/shared/auth/permisos-por-tipo-servidor", () => ({
  permisosPorTipoDelServidor: vi.fn(async () => permisosActuales),
}));

const MODULO_DE = { "tipo-soporte": "TICKETS", "tipo-mantenimiento": "EDILICIA" };

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
    permisosActuales = null;
  });

  it("con LECTURA en un tipo de TICKETS va a /tickets, sin la celda ni el módulo en el JWT (T6)", async () => {
    usuarioActual = usuario({ permisos: [], modulos: [] });
    permisosActuales = permisosDeTest({ "tipo-soporte": ["LECTURA"] }, MODULO_DE);
    expect(await destino()).toBe("/tickets");
  });

  it("sin Tickets y con Edilicia va a /edilicia, no a /tickets (que lo devolvería acá en ciclo)", async () => {
    usuarioActual = usuario({ permisos: [], modulos: [] });
    permisosActuales = permisosDeTest({ "tipo-mantenimiento": ["LECTURA"] }, MODULO_DE);
    expect(await destino()).toBe("/edilicia");
  });

  it("con la celda TICKETS:LECTURA pero sin LECTURA en ningún tipo no va a /tickets (su gate lo devolvería acá)", async () => {
    usuarioActual = usuario({ permisos: ["TICKETS:LECTURA", "COMPRAS:LECTURA"], modulos: ["TICKETS", "COMPRAS"] });
    permisosActuales = permisosDeTest({ "tipo-soporte": ["ALTAS"] }, MODULO_DE);
    expect(await destino()).toBe("/compras");
  });

  it("sin ningún área con gate va a la Ayuda, que todos ven", async () => {
    usuarioActual = usuario({ permisos: [] });
    permisosActuales = permisosDeTest({});
    expect(await destino()).toBe("/kb");
  });

  it("si los permisos por tipo no se pudieron leer, no elige Tickets ni Edilicia", async () => {
    usuarioActual = usuario({ permisos: ["TICKETS:LECTURA"], modulos: ["TICKETS"] });
    permisosActuales = null;
    expect(await destino()).toBe("/kb");
  });

  it("sin token legible va a /tickets: su gate deja pasar ese caso (refresh tolerante)", async () => {
    usuarioActual = null;
    expect(await destino()).toBe("/tickets");
  });
});
