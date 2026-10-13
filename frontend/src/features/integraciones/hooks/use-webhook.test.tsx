import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { ApiError } from "@/shared/api/types";
import { useWebhookConfig, useWebhookEntregas } from "./use-webhook";
import { avisoErrorWebhook, useGuardarWebhook, useRegenerarSecretoWebhook } from "./use-webhook-mutations";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SECRETO = "whsec_secreto-que-no-se-cachea";

const CONFIG = {
  configurado: true,
  url: "https://erp.example.com/hooks",
  eventos: ["TICKET_CREADO"],
  activo: true,
  creadoEn: "2026-10-13T12:00:00.000Z",
  actualizadoEn: "2026-10-13T12:00:00.000Z",
};

const BODY = { url: "https://erp.example.com/hooks", eventos: ["TICKET_CREADO" as const], activo: true };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

function cacheSerializado(queryClient: QueryClient): string {
  return JSON.stringify([
    queryClient.getQueryCache().getAll().map((q) => q.state),
    queryClient.getMutationCache().getAll().map((m) => m.state),
  ]);
}

describe("hooks del webhook", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("useWebhookConfig lee GET /integraciones/webhook", async () => {
    server.use(http.get("/api/integraciones/webhook", () => HttpResponse.json(CONFIG)));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useWebhookConfig(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CONFIG);
  });

  it("useWebhookEntregas pide la página con porPagina=20", async () => {
    let pedida: URL | undefined;
    server.use(
      http.get("/api/integraciones/webhook/entregas", ({ request }) => {
        pedida = new URL(request.url);
        return HttpResponse.json({ items: [], total: 0, pagina: 3, porPagina: 20 });
      }),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useWebhookEntregas(3), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(pedida?.searchParams.get("pagina")).toBe("3");
    expect(pedida?.searchParams.get("porPagina")).toBe("20");
  });

  it("useGuardarWebhook entrega el secreto por callback y cachea la vista sin él", async () => {
    let body: unknown;
    server.use(
      http.put("/api/integraciones/webhook", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...CONFIG, secreto: SECRETO });
      }),
    );
    const onSecreto = vi.fn();
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useGuardarWebhook(onSecreto), { wrapper: Wrapper });

    await act(() => result.current.mutateAsync(BODY));

    expect(body).toEqual(BODY);
    expect(onSecreto).toHaveBeenCalledWith(SECRETO);
    expect(queryClient.getQueryData(["webhook"])).toEqual(CONFIG);
    expect(cacheSerializado(queryClient)).not.toContain(SECRETO);
    expect(toast.success).toHaveBeenCalledWith("Webhook guardado.");
  });

  it("useGuardarWebhook no llama al callback cuando la respuesta no trae secreto", async () => {
    server.use(http.put("/api/integraciones/webhook", () => HttpResponse.json(CONFIG)));
    const onSecreto = vi.fn();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGuardarWebhook(onSecreto), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync(BODY));
    expect(onSecreto).not.toHaveBeenCalled();
  });

  it("useGuardarWebhook deja al formulario los códigos conocidos y manda a toast el resto", async () => {
    server.use(
      http.put("/api/integraciones/webhook", () =>
        HttpResponse.json({ statusCode: 422, message: "La URL no es válida: tiene que usar https.", code: "WEBHOOK_URL_INVALIDA" }, { status: 422 }),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGuardarWebhook(vi.fn()), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync(BODY).catch(() => undefined));
    expect(toast.error).not.toHaveBeenCalled();

    server.use(http.put("/api/integraciones/webhook", () => HttpResponse.json({ statusCode: 400, message: ["url must be a string"] }, { status: 400 })));
    await act(() => result.current.mutateAsync(BODY).catch(() => undefined));
    expect(toast.error).toHaveBeenCalledWith("url must be a string");
  });

  it("useRegenerarSecretoWebhook entrega el secreto por callback y no lo deja en el cache", async () => {
    server.use(http.post("/api/integraciones/webhook/secreto", () => HttpResponse.json({ secreto: SECRETO })));
    const onSecreto = vi.fn();
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useRegenerarSecretoWebhook(onSecreto), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync());
    expect(onSecreto).toHaveBeenCalledWith(SECRETO);
    expect(cacheSerializado(queryClient)).not.toContain(SECRETO);
  });

  it("useRegenerarSecretoWebhook avisa el 404 sin destino con el texto del front", async () => {
    server.use(
      http.post("/api/integraciones/webhook/secreto", () =>
        HttpResponse.json({ statusCode: 404, message: "not found", code: "WEBHOOK_DESTINO_NO_ENCONTRADO" }, { status: 404 }),
      ),
    );
    const onSecreto = vi.fn();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRegenerarSecretoWebhook(onSecreto), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync().catch(() => undefined));
    expect(toast.error).toHaveBeenCalledWith("Todavía no hay un webhook configurado. Guardá la configuración primero.");
    expect(onSecreto).not.toHaveBeenCalled();
  });
});

describe("avisoErrorWebhook", () => {
  const error = (code: string | undefined, message = "mensaje del backend") => new ApiError(422, message, [message], undefined, code);

  it("da un aviso fijo para API_NO_HABILITADA y WEBHOOK_EVENTOS_INVALIDOS", () => {
    expect(avisoErrorWebhook(error("API_NO_HABILITADA"))).toMatch(/ROOT tiene que habilitarla/);
    expect(avisoErrorWebhook(error("WEBHOOK_EVENTOS_INVALIDOS"))).toMatch(/eventos elegidos no es válido/);
  });

  it("usa el mensaje del backend para la URL inválida y el destino no admitido", () => {
    expect(avisoErrorWebhook(error("WEBHOOK_URL_INVALIDA", "La URL admite hasta 2048 caracteres."))).toBe(
      "La URL admite hasta 2048 caracteres.",
    );
    expect(avisoErrorWebhook(error("WEBHOOK_DESTINO_NO_ADMITIDO", "El destino no está admitido."))).toBe(
      "El destino no está admitido.",
    );
  });

  it("no da aviso para un código desconocido, un error sin código o algo que no es ApiError", () => {
    expect(avisoErrorWebhook(error("OTRO_CODIGO"))).toBeUndefined();
    expect(avisoErrorWebhook(error(undefined))).toBeUndefined();
    expect(avisoErrorWebhook(new Error("x"))).toBeUndefined();
  });
});
