import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useCrearFeriado } from "./use-feriados-globales-admin-mutations";

/**
 * `useCrearFeriado`/`useEditarFeriado`'s POST/PATCH body, toast de éxito y
 * el 422 de fecha duplicada ya quedan probados end-to-end en
 * `feriados-globales-admin-view.test.tsx` (vía el diálogo). Este archivo
 * cubre SOLO lo que ese test NO puede: la invalidación de query (nadie más
 * la espía) y el 422 "fecha de calendario inválida"
 * (`FechaCalendarioInvalidaError`, D7) — inalcanzable desde el diálogo
 * porque `<input type="date">` nunca deja pasar un valor con formato
 * correcto pero calendario inexistente (verificado contra jsdom
 * directamente: ni tipear ni mutar el atributo `type` lo esquiva).
 */
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCrearFeriado", () => {
  it("invalida [\"feriados-globales\"] al crear", async () => {
    server.use(
      http.post("/api/feriados", () =>
        HttpResponse.json({ id: "f1", fecha: "2026-12-25", descripcion: "Navidad" }, { status: 201 }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCrearFeriado(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ fecha: "2026-12-25", descripcion: "Navidad" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["feriados-globales"]);
    invalidateSpy.mockRestore();
  });

  it("422 fecha de calendario inválida (`FechaCalendarioInvalidaError`, D7) muestra el mensaje EXACTO del backend en el toast de error", async () => {
    const MENSAJE_BACKEND =
      '"2026-02-30" no es una fecha de calendario válida. Se espera el formato \'YYYY-MM-DD\' y una fecha que exista realmente en el calendario.';
    server.use(
      http.post("/api/feriados", () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );
    vi.mocked(toast.error).mockClear();

    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useCrearFeriado(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ fecha: "2026-02-30", descripcion: "Fecha inválida" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND);
  });
});
