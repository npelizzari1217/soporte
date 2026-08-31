import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { createElement, type ReactNode } from "react";
import { server } from "../../../test/msw/server";
import { useExportarCsv } from "./use-exportar-csv";

/**
 * `dispararDescarga` se mockea (no se prueba de nuevo acá — tiene su propio
 * caso de uso en `descarga.ts`) para poder observar CON QUÉ NOMBRE se llamó,
 * que es exactamente el comportamiento que este hook decide.
 */
vi.mock("@/shared/lib/descarga", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/shared/lib/descarga")>();
  return { ...real, dispararDescarga: vi.fn() };
});

vi.mock("@/shared/lib/toast", () => ({ notifyError: vi.fn() }));

import { dispararDescarga } from "@/shared/lib/descarga";
import { notifyError } from "@/shared/lib/toast";

// `.spec.ts` (no JSX) a propósito — el comando de foco de esta unidad es
// exacto, así que el wrapper se arma con `createElement` en vez de JSX.
function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

beforeEach(() => {
  vi.mocked(dispararDescarga).mockClear();
  vi.mocked(notifyError).mockClear();
});

describe("useExportarCsv", () => {
  it("sin Content-Disposition legible → cae en el nombre por defecto en vez de bajar un archivo sin nombre", async () => {
    server.use(
      http.get("/api/tickets/export", () =>
        new HttpResponse("numero,titulo\n", { headers: { "content-type": "text/csv" } }),
      ),
    );

    const { result } = renderHook(
      () => useExportarCsv({ recurso: "tickets", nombrePorDefecto: "tickets.csv" }),
      { wrapper: wrapper(buildClient()) },
    );
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(dispararDescarga).toHaveBeenCalledTimes(1);

    // Se afirma el CONTENIDO del blob, no su clase. Bajo jsdom conviven dos
    // clases `Blob` distintas con el mismo nombre: la que construye Node al
    // resolver `res.blob()` y la global del entorno. `instanceof` da false
    // entre ellas aunque el objeto sea el correcto, asi que `expect.any(Blob)`
    // fallaba por identidad de constructor, no por comportamiento.
    // Mirar los bytes ademas prueba MAS: que bajo este archivo y no otro.
    const [blobDescargado, nombreUsado] = vi.mocked(dispararDescarga).mock.calls[0];
    expect(nombreUsado).toBe("tickets.csv");
    expect(blobDescargado.type).toBe("text/csv");
    await expect(blobDescargado.text()).resolves.toBe("numero,titulo\n");
  });

  it("fallo del backend → notifyError se llama y NO se dispara ninguna descarga", async () => {
    server.use(
      http.get("/api/equipos/export", () =>
        HttpResponse.json(
          { statusCode: 422, message: "La exportación supera las 5000 filas. Acotá los filtros." },
          { status: 422 },
        ),
      ),
    );

    const { result } = renderHook(
      () => useExportarCsv({ recurso: "equipos", nombrePorDefecto: "equipos.csv" }),
      { wrapper: wrapper(buildClient()) },
    );
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(dispararDescarga).not.toHaveBeenCalled();
  });
});
