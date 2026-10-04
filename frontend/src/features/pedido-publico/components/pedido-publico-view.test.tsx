import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { destinoLoginSesion, PedidoPublicoView } from "./pedido-publico-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

// Spec: sdd/formulario-publico-qr, pedido-publico y D3: modo EXTERNO muestra el formulario;
// modo SESION redirige al login; 404 uniforme y 429 con su aviso.

function renderView(tokenQr: string | null = "tok1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PedidoPublicoView slug="mi-colegio" tokenQr={tokenQr} />
    </QueryClientProvider>,
  );
}

function contexto(modo: "EXTERNO" | "SESION", equipo: { nombre: string } | null = { nombre: "PC Sala 3" }) {
  server.use(
    http.get("/api/publico/c/mi-colegio/pedido/contexto", () =>
      HttpResponse.json({ cliente: { nombre: "Colegio Norte" }, equipo, modo }),
    ),
  );
}

async function completar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/tu nombre/i), "Ana Pérez");
  await user.type(screen.getByLabelText(/tu email/i), "ana@example.com");
  await user.type(screen.getByLabelText(/asunto/i), "No enciende");
  await user.type(screen.getByLabelText(/qué pasa/i), "Desde ayer no prende.");
  await user.click(screen.getByRole("button", { name: /enviar pedido/i }));
}

describe("PedidoPublicoView", () => {
  beforeEach(() => replace.mockReset());

  it("EXTERNO: muestra cliente y equipo, y no redirige", async () => {
    contexto("EXTERNO");
    renderView();

    expect(await screen.findByText(/Colegio Norte — PC Sala 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar pedido/i })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("EXTERNO sin equipo: muestra solo el cliente", async () => {
    contexto("EXTERNO", null);
    renderView(null);

    expect(await screen.findByText("Colegio Norte")).toBeInTheDocument();
  });

  it("EXTERNO: envía el pedido con el equipoToken y muestra el aviso de revisar el correo", async () => {
    contexto("EXTERNO");
    let cuerpo: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/publico/c/mi-colegio/pedido/solicitud", async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ mensaje: "ok" }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderView();

    await completar(user);

    expect(await screen.findByText(/Revisá tu correo/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/link que te mandamos/i);
    expect(cuerpo).toMatchObject({ nombre: "Ana Pérez", email: "ana@example.com", equipoToken: "tok1" });
  });

  it("EXTERNO: datos inválidos no llaman al backend", async () => {
    contexto("EXTERNO");
    let llamadas = 0;
    server.use(
      http.post("/api/publico/c/mi-colegio/pedido/solicitud", () => {
        llamadas += 1;
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText(/tu email/i), "no-es-email");
    await user.click(screen.getByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByText(/email válido/i)).toBeInTheDocument();
    expect(llamadas).toBe(0);
  });

  it("EXTERNO: 429 al enviar muestra el aviso y deja el formulario para reintentar", async () => {
    contexto("EXTERNO");
    server.use(
      http.post("/api/publico/c/mi-colegio/pedido/solicitud", () =>
        HttpResponse.json({ statusCode: 429, message: "ThrottlerException" }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderView();

    await completar(user);

    expect(await screen.findByText(/demasiados pedidos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar pedido/i })).toBeInTheDocument();
  });

  it("SESION: redirige al login con el destino codificado y no muestra el formulario", async () => {
    contexto("SESION");
    renderView("tok/1");

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith(destinoLoginSesion("mi-colegio", "tok/1"));
    expect(screen.queryByRole("button", { name: /enviar pedido/i })).not.toBeInTheDocument();
  });

  it("destinoLoginSesion: el query interno viaja codificado y sin token omite `e`", () => {
    expect(destinoLoginSesion("mi-colegio", "a&b")).toBe(
      `/login?siguiente=${encodeURIComponent("/pedido-qr?c=mi-colegio&e=a%26b")}`,
    );
    expect(destinoLoginSesion("mi-colegio", null)).toBe(
      `/login?siguiente=${encodeURIComponent("/pedido-qr?c=mi-colegio")}`,
    );
  });

  it("404: mensaje uniforme, sin reintento ni formulario", async () => {
    server.use(
      http.get("/api/publico/c/mi-colegio/pedido/contexto", () =>
        HttpResponse.json({ statusCode: 404, message: "x" }, { status: 404 }),
      ),
    );
    renderView();

    expect(await screen.findByText(/no está disponible o el link no es válido/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar pedido/i })).not.toBeInTheDocument();
  });

  it("429 en el contexto: aviso de límite con reintento", async () => {
    server.use(
      http.get("/api/publico/c/mi-colegio/pedido/contexto", () =>
        HttpResponse.json({ statusCode: 429, message: "x" }, { status: 429 }),
      ),
    );
    renderView();

    expect(await screen.findByText(/demasiados pedidos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });
});
