import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { AvisoSaturacionRoot } from "./aviso-saturacion-root";

const AHORA = new Date("2026-11-09T18:00:00.000Z");
const ROOT = buildUser({ is_global_admin: true });

function responder(avisadoEn: string | null) {
  const pedidos: string[] = [];
  server.use(
    http.get("/api/operacion/saturacion", ({ request }) => {
      pedidos.push(request.url);
      return HttpResponse.json({
        eventosRecientes: 0,
        ultimoAviso: avisadoEn
          ? {
              avisadoEn,
              eventos: 7,
              desde: "2026-11-09T15:02:00.000Z",
              hasta: "2026-11-09T15:09:30.000Z",
              porOrigen: { servidor: 2, pool: 5, transaccion: 0 },
            }
          : null,
      });
    }),
  );
  return pedidos;
}

/** Aviso en pantalla a ROOT cuando la base se saturó de forma repetida (odd/saturacion-conexiones, S3). */
describe("AvisoSaturacionRoot", () => {
  afterEach(() => vi.useRealTimers());

  it("un ROOT ve el aviso de una saturación de las últimas 24 horas, con qué revisar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
    responder("2026-11-09T15:09:30.000Z");

    renderWithProviders(<AvisoSaturacionRoot />, { user: ROOT });

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("La base de datos se saturó 7 veces en 10 minutos");
    expect(aviso).toHaveTextContent(
      "Los usuarios vieron el aviso de sistema saturado. Revise la capacidad del servidor y los otros " +
        "sistemas del VPS; el detalle está en el log del backend (SATURACION_CONEXIONES).",
    );
  });

  it("un aviso de hace más de 24 horas ya no se muestra", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
    const pedidos = responder("2026-11-08T17:59:00.000Z");

    renderWithProviders(<AvisoSaturacionRoot />, { user: ROOT });

    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sin avisos no muestra nada", async () => {
    const pedidos = responder(null);

    renderWithProviders(<AvisoSaturacionRoot />, { user: ROOT });

    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("quien no es ROOT no lo ve ni lo pide (el backend le respondería 403)", async () => {
    const pedidos = responder("2026-11-09T15:09:30.000Z");

    renderWithProviders(<AvisoSaturacionRoot />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await new Promise((resolver) => setTimeout(resolver, 100));
    expect(pedidos).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
