import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { WebhookSection } from "./webhook-section";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * WebhookSection — webhooks T7 (CA4, CA6, CA7): formulario del destino, el
 * secreto mostrado una sola vez, regenerar con confirmación, avisos por código
 * y el registro de entregas paginado.
 */
const SECRETO = "whsec_valor-de-un-solo-uso";

const SIN_CONFIGURAR = { configurado: false, url: null, eventos: null, activo: null, creadoEn: null, actualizadoEn: null };
const CONFIGURADO = {
  configurado: true,
  url: "https://erp.example.com/hooks",
  eventos: ["TICKET_CREADO", "TICKET_ASIGNADO"],
  activo: true,
  creadoEn: "2026-10-13T12:00:00.000Z",
  actualizadoEn: "2026-10-13T12:00:00.000Z",
};

function entrega(over: Record<string, unknown>) {
  return {
    id: "e-1",
    evento: "ticket.creado",
    ticketId: "t-1",
    numero: "SOP-2026-00042",
    estado: "ENTREGADA",
    intentos: 1,
    ultimoCodigo: 200,
    ultimoError: null,
    createdAt: "2026-10-13T12:00:00.000Z",
    proximoIntentoAt: null,
    entregadaAt: "2026-10-13T12:00:01.000Z",
    ...over,
  };
}

function mockConfig(config: Record<string, unknown>) {
  server.use(http.get("/api/integraciones/webhook", () => HttpResponse.json(config)));
}

function mockEntregas(items: unknown[], total = items.length) {
  server.use(
    http.get("/api/integraciones/webhook/entregas", ({ request }) => {
      const pagina = Number(new URL(request.url).searchParams.get("pagina"));
      return HttpResponse.json({ items, total, pagina, porPagina: 20 });
    }),
  );
}

function renderSeccion() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WebhookSection />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("WebhookSection", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    mockEntregas([]);
  });

  it("sin destino propone los cuatro eventos, activo, y no ofrece regenerar", async () => {
    mockConfig(SIN_CONFIGURAR);
    renderSeccion();
    expect(await screen.findByLabelText("URL de destino")).toHaveValue("");
    for (const nombre of ["Ticket creado", "Cambio de estado", "Ticket asignado", "Comentario público", "Activo"]) {
      expect(screen.getByRole("checkbox", { name: nombre })).toBeChecked();
    }
    expect(screen.queryByRole("button", { name: "Regenerar secreto" })).not.toBeInTheDocument();
    expect(screen.getByText(/ROOT tiene que haber habilitado la API de este cliente/)).toBeInTheDocument();
  });

  it("con destino carga la URL, los eventos y el estado guardados", async () => {
    mockConfig({ ...CONFIGURADO, activo: false });
    renderSeccion();
    expect(await screen.findByLabelText("URL de destino")).toHaveValue("https://erp.example.com/hooks");
    expect(screen.getByRole("checkbox", { name: "Ticket creado" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cambio de estado" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Activo" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Regenerar secreto" })).toBeInTheDocument();
  });

  it("valida el formulario sin llamar al backend", async () => {
    const user = userEvent.setup();
    const guardado = vi.fn();
    mockConfig(SIN_CONFIGURAR);
    server.use(http.put("/api/integraciones/webhook", () => { guardado(); return HttpResponse.json(CONFIGURADO); }));
    renderSeccion();
    await user.type(await screen.findByLabelText("URL de destino"), "http://erp.example.com");
    for (const nombre of ["Ticket creado", "Cambio de estado", "Ticket asignado", "Comentario público"]) {
      await user.click(screen.getByRole("checkbox", { name: nombre }));
    }
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("La URL tiene que empezar con https://.")).toBeInTheDocument();
    expect(screen.getByText("Elija al menos un evento.")).toBeInTheDocument();
    expect(guardado).not.toHaveBeenCalled();
  });

  it("el primer guardado muestra el secreto una vez y lo descarta al cerrar", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    let body: unknown;
    mockConfig(SIN_CONFIGURAR);
    server.use(
      http.put("/api/integraciones/webhook", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...CONFIGURADO, eventos: ["TICKET_CREADO"], secreto: SECRETO });
      }),
    );
    const queryClient = renderSeccion();
    await user.type(await screen.findByLabelText("URL de destino"), "https://erp.example.com/hooks");
    for (const nombre of ["Cambio de estado", "Ticket asignado", "Comentario público"]) {
      await user.click(screen.getByRole("checkbox", { name: nombre }));
    }
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText(SECRETO)).toBeInTheDocument();
    expect(body).toEqual({ url: "https://erp.example.com/hooks", eventos: ["TICKET_CREADO"], activo: true });
    expect(screen.getByText(/única vez que podrá verlo/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copiar secreto" }));
    expect(writeText).toHaveBeenCalledWith(SECRETO);

    await user.click(screen.getByRole("button", { name: "Ya lo guardé" }));
    await waitFor(() => expect(screen.queryByText(SECRETO)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Regenerar secreto" })).toBeInTheDocument();
    const cache = JSON.stringify([
      queryClient.getQueryCache().getAll().map((q) => q.state),
      queryClient.getMutationCache().getAll().map((m) => m.state),
    ]);
    expect(cache).not.toContain(SECRETO);
  });

  it("una actualización sin secreto en la respuesta no abre el diálogo", async () => {
    const user = userEvent.setup();
    mockConfig(CONFIGURADO);
    server.use(http.put("/api/integraciones/webhook", () => HttpResponse.json({ ...CONFIGURADO, actualizadoEn: "2026-10-13T13:00:00.000Z" })));
    renderSeccion();
    await user.click(await screen.findByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Webhook guardado."));
    expect(screen.queryByText("Secreto de firma")).not.toBeInTheDocument();
  });

  it.each([
    ["API_NO_HABILITADA", "texto del backend", /ROOT tiene que habilitarla/],
    ["WEBHOOK_URL_INVALIDA", "La URL no es válida: tiene credenciales.", /^La URL no es válida: tiene credenciales\.$/],
    ["WEBHOOK_DESTINO_NO_ADMITIDO", "El destino del webhook no está admitido.", /^El destino del webhook no está admitido\.$/],
  ])("un 422 %s se muestra en el formulario", async (code, message, esperado) => {
    const user = userEvent.setup();
    mockConfig(CONFIGURADO);
    server.use(http.put("/api/integraciones/webhook", () => HttpResponse.json({ statusCode: 422, message, code }, { status: 422 })));
    renderSeccion();
    await user.click(await screen.findByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(esperado);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("regenerar pide confirmación y muestra el secreto nuevo", async () => {
    const user = userEvent.setup();
    const regenerado = vi.fn();
    mockConfig(CONFIGURADO);
    server.use(http.post("/api/integraciones/webhook/secreto", () => { regenerado(); return HttpResponse.json({ secreto: SECRETO }); }));
    renderSeccion();
    await user.click(await screen.findByRole("button", { name: "Regenerar secreto" }));
    expect(screen.getByText(/El actual deja de funcionar en el acto/)).toBeInTheDocument();
    expect(regenerado).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Regenerar" }));
    expect(await screen.findByText(SECRETO)).toBeInTheDocument();
    expect(regenerado).toHaveBeenCalledTimes(1);
  });

  it("el registro vacío muestra su estado vacío", async () => {
    mockConfig(CONFIGURADO);
    renderSeccion();
    expect(await screen.findByText("Sin entregas")).toBeInTheDocument();
  });

  it("el registro muestra evento, ticket, estado, intentos, resultado y seguimiento", async () => {
    mockConfig(CONFIGURADO);
    mockEntregas([
      entrega({}),
      entrega({ id: "e-2", evento: "ticket.comentado", numero: "SOP-2026-00007", estado: "PENDIENTE", intentos: 2, ultimoCodigo: 503, ultimoError: "HTTP 503", proximoIntentoAt: "2026-10-13T12:20:00.000Z", entregadaAt: null }),
      entrega({ id: "e-3", evento: "ticket.asignado", numero: null, estado: "FALLIDA", intentos: 10, ultimoCodigo: null, ultimoError: "timeout", entregadaAt: null }),
    ]);
    renderSeccion();

    const entregada = (await screen.findByText("SOP-2026-00042")).closest("tr") as HTMLElement;
    expect(within(entregada).getByText("Ticket creado")).toBeInTheDocument();
    expect(within(entregada).getByText("Entregada")).toBeInTheDocument();
    expect(within(entregada).getByText("200")).toBeInTheDocument();
    expect(within(entregada).getByText(/^Entregada el \d{2}\/\d{2}\/2026/)).toBeInTheDocument();

    const pendiente = screen.getByText("SOP-2026-00007").closest("tr") as HTMLElement;
    expect(within(pendiente).getByText("Comentario público")).toBeInTheDocument();
    expect(within(pendiente).getByText("Pendiente")).toBeInTheDocument();
    expect(within(pendiente).getByText("HTTP 503")).toBeInTheDocument();
    expect(within(pendiente).getByText(/^Próximo intento:/)).toBeInTheDocument();

    const fallida = screen.getByText("Fallida").closest("tr") as HTMLElement;
    expect(within(fallida).getByText("—")).toBeInTheDocument();
    expect(within(fallida).getByText("10")).toBeInTheDocument();
    expect(within(fallida).getByText("timeout")).toBeInTheDocument();
    expect(within(fallida).getByText("Sin más reintentos")).toBeInTheDocument();
  });

  it("pagina el registro en el servidor", async () => {
    const user = userEvent.setup();
    const paginas: string[] = [];
    mockConfig(CONFIGURADO);
    server.use(
      http.get("/api/integraciones/webhook/entregas", ({ request }) => {
        const pagina = new URL(request.url).searchParams.get("pagina") ?? "";
        paginas.push(pagina);
        return HttpResponse.json({ items: [entrega({ id: `e-${pagina}`, numero: `SOP-2026-00${pagina}00` })], total: 45, pagina: Number(pagina), porPagina: 20 });
      }),
    );
    renderSeccion();
    expect(await screen.findByText("SOP-2026-00100")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(await screen.findByText("SOP-2026-00200")).toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    expect(paginas).toEqual(["1", "2"]);
  });
});
