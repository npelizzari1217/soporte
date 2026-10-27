import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ConfigurarIaDialog } from "./configurar-ia-dialog";
import type { Cliente, ClienteIa } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CLIENTE: Cliente = {
  id: "c1",
  nombre: "Cliente Uno",
  razonSocial: null,
  cuit: null,
  dbName: "cliente_uno",
  activo: true,
  csatHabilitado: false,
  slug: null,
  formularioPublicoHabilitado: false,
  apiHabilitada: false,
};

const SIN_IA: ClienteIa = {
  configurado: false,
  url: null,
  modelo: null,
  verificadoAt: null,
  verificacionError: null,
};

function conIa(overrides: Partial<ClienteIa> = {}): ClienteIa {
  return {
    configurado: true,
    url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    modelo: "gemini-2.5-flash",
    verificadoAt: null,
    verificacionError: null,
    ...overrides,
  };
}

async function abrir() {
  const user = userEvent.setup();
  renderWithProviders(<ConfigurarIaDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });
  await user.click(screen.getByRole("button", { name: /ia de cliente uno/i }));
  return user;
}

describe("ConfigurarIaDialog", () => {
  beforeEach(() => vi.mocked(toast.success).mockClear());

  it("sin IA: propone Gemini, exige la clave y la manda al guardar", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/clientes/c1/ia", () => HttpResponse.json(SIN_IA)),
      http.patch("/api/clientes/c1/ia", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(conIa());
      }),
    );
    const user = await abrir();

    expect(await screen.findByText("Sin IA: el asistente responde con la Ayuda")).toBeInTheDocument();
    expect(screen.getByLabelText(/url del proveedor/i)).toHaveValue(
      "https://generativelanguage.googleapis.com/v1beta/openai/",
    );
    expect(screen.getByLabelText(/^modelo$/i)).toHaveValue("gemini-2.5-flash");

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(await screen.findByText("La clave es requerida para la primera configuración")).toBeInTheDocument();
    expect(body).toBeNull();

    await user.type(screen.getByLabelText(/^clave/i), "AIzaClave");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() =>
      expect(body).toEqual({
        url: "https://generativelanguage.googleapis.com/v1beta/openai/",
        modelo: "gemini-2.5-flash",
        clave: "AIzaClave",
      }),
    );
    // Tras guardar, la clave tipeada no queda en el formulario.
    await waitFor(() => expect(screen.getByLabelText(/^clave/i)).toHaveValue(""));
  });

  it("con IA: la clave arranca vacía y, vacía, no se manda (el backend conserva la guardada)", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/clientes/c1/ia", () => HttpResponse.json(conIa())),
      http.patch("/api/clientes/c1/ia", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(conIa({ modelo: "gemini-2.0-flash" }));
      }),
    );
    const user = await abrir();

    expect(await screen.findByText("IA configurada")).toBeInTheDocument();
    expect(screen.getByLabelText(/^clave/i)).toHaveValue("");

    const modelo = screen.getByLabelText(/^modelo$/i);
    await user.clear(modelo);
    await user.type(modelo, "gemini-2.0-flash");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(body).toEqual({
        url: "https://generativelanguage.googleapis.com/v1beta/openai/",
        modelo: "gemini-2.0-flash",
      }),
    );
  });

  it("cerrar sin guardar y reabrir descarta lo tipeado y muestra el dato vigente", async () => {
    server.use(http.get("/api/clientes/c1/ia", () => HttpResponse.json(conIa())));
    const user = await abrir();
    await screen.findByText("IA configurada");

    const modelo = screen.getByLabelText(/^modelo$/i);
    await user.clear(modelo);
    await user.type(modelo, "basura");
    await user.type(screen.getByLabelText(/^clave/i), "clave-a-medio-tipear");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /ia de cliente uno/i }));

    expect(await screen.findByLabelText(/^modelo$/i)).toHaveValue("gemini-2.5-flash");
    expect(screen.getByLabelText(/^clave/i)).toHaveValue("");
  });

  it("un modelo de solo espacios se rechaza sin llamar al servidor", async () => {
    let llamadas = 0;
    server.use(
      http.get("/api/clientes/c1/ia", () => HttpResponse.json(conIa())),
      http.patch("/api/clientes/c1/ia", () => {
        llamadas += 1;
        return HttpResponse.json(conIa());
      }),
    );
    const user = await abrir();
    await screen.findByText("IA configurada");

    const modelo = screen.getByLabelText(/^modelo$/i);
    await user.clear(modelo);
    await user.type(modelo, "   ");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(await screen.findByText("El modelo es requerido")).toBeInTheDocument();
    expect(llamadas).toBe(0);
  });

  it("Probar muestra el motivo de una prueba fallida", async () => {
    server.use(
      http.get("/api/clientes/c1/ia", () => HttpResponse.json(conIa())),
      http.post("/api/clientes/c1/ia/probar", () =>
        HttpResponse.json(conIa({ verificacionError: "El proveedor rechazó la clave." })),
      ),
    );
    const user = await abrir();
    await screen.findByText("IA configurada");

    await user.click(screen.getByRole("button", { name: /^probar$/i }));

    expect(await screen.findByText("Prueba fallida: El proveedor rechazó la clave.")).toBeInTheDocument();
  });

  it("una prueba exitosa muestra cuándo se probó (instante en el huso de la suite)", async () => {
    server.use(
      http.get("/api/clientes/c1/ia", () => HttpResponse.json(conIa({ verificadoAt: "2026-10-26T15:00:00.000Z" }))),
    );
    await abrir();
    // 15:00 UTC = 12:00 en America/Argentina/Buenos_Aires.
    expect(await screen.findByText("Probada el 26/10/2026 12:00")).toBeInTheDocument();
  });

  it("quitar la configuración pide confirmación y llama al DELETE", async () => {
    let borrado = false;
    server.use(
      http.get("/api/clientes/c1/ia", () => HttpResponse.json(borrado ? SIN_IA : conIa())),
      http.delete("/api/clientes/c1/ia", () => {
        borrado = true;
        return HttpResponse.json(SIN_IA);
      }),
    );
    const user = await abrir();
    await screen.findByText("IA configurada");

    await user.click(screen.getByRole("button", { name: /quitar configuración/i }));
    await user.click(screen.getByRole("button", { name: /^quitar$/i }));

    await waitFor(() => expect(borrado).toBe(true));
    expect(await screen.findByText("Sin IA: el asistente responde con la Ayuda")).toBeInTheDocument();
  });
});
