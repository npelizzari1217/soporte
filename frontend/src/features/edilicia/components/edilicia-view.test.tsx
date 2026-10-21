import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { buildUser } from "../../../../test/render-with-providers";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";
import { EdiliciaView } from "./edilicia-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/edilicia",
  useSearchParams: () => new URLSearchParams(""),
}));

const SIN_PERMISO = "No tenés permiso para ver Edilicia.";

/** Acceso a la vista: LECTURA sobre algún tipo de EDILICIA (odd/permisos-por-tipo-ticket, S5). */
describe("EdiliciaView — acceso por permisos por tipo", () => {
  it("con LECTURA en un tipo de EDILICIA ve el listado, sin la celda EDILICIA:LECTURA", async () => {
    server.use(
      http.get("/api/reparaciones", () => HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 })),
    );
    renderConPermisos(<EdiliciaView />, {
      user: buildUser({ rol: "TECNICO", permisos: [], modulos: [] }),
      permisos: permisosDeTest({ "tipo-mantenimiento": ["LECTURA"] }, { "tipo-mantenimiento": "EDILICIA" }),
    });

    expect(await screen.findByRole("heading", { name: "Reparaciones" })).toBeInTheDocument();
    expect(screen.queryByText(SIN_PERMISO)).not.toBeInTheDocument();
  });

  it("con la celda EDILICIA:LECTURA pero sin LECTURA en ningún tipo de EDILICIA, no la ve", async () => {
    renderConPermisos(<EdiliciaView />, {
      user: buildUser({ rol: "TECNICO", permisos: ["EDILICIA:LECTURA"], modulos: ["EDILICIA"] }),
      permisos: permisosDeTest(
        { "tipo-soporte": ["LECTURA"], "tipo-mantenimiento": ["ALTAS"] },
        { "tipo-soporte": "TICKETS", "tipo-mantenimiento": "EDILICIA" },
      ),
    });

    expect(await screen.findByText(SIN_PERMISO)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reparaciones" })).not.toBeInTheDocument();
  });
});
